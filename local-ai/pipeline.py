#!/usr/bin/env python3
"""完全本地的素材预处理管线。

能力边界：抠出前景、按人工标注拆分对象、移除对象后局部补背景。
本脚本不会上传图片，也不包含任何网络请求。模型须预先缓存在 models/。
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove


ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
os.environ.setdefault("U2NET_HOME", str(MODEL_DIR))


def read_rgba(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"))


def save_rgba(path: Path, image: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(image.astype(np.uint8), "RGBA").save(path)


def save_rgb(path: Path, image: np.ndarray, quality: int = 95) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(image.astype(np.uint8), "RGB").save(path, quality=quality)


def foreground_alpha(image: np.ndarray, model: str, max_side: int) -> np.ndarray:
    """在受控分辨率上推理，再还原到原图尺寸。"""
    height, width = image.shape[:2]
    scale = min(1.0, max_side / max(height, width))
    if scale < 1:
        resized = cv2.resize(
            image,
            (max(1, round(width * scale)), max(1, round(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        resized = image

    session = new_session(model)
    result = remove(Image.fromarray(resized, "RGBA"), session=session)
    alpha = np.array(result.convert("RGBA"))[:, :, 3]
    if alpha.shape != (height, width):
        alpha = cv2.resize(alpha, (width, height), interpolation=cv2.INTER_LINEAR)
    # 显示蒙版保留模型原始软边，脸部、发丝和半透明衣缘优先保持完整。
    return alpha.astype(np.uint8)


def polygon_mask(size: tuple[int, int], points: list) -> np.ndarray:
    width, height = size
    mask = np.zeros((height, width), dtype=np.uint8)
    normalized = [[point.get("x", 0), point.get("y", 0)] if isinstance(point, dict) else point for point in points]
    polygon = np.asarray(normalized, dtype=np.float32)
    if polygon.size == 0:
        return mask
    polygon[:, 0] = np.clip(polygon[:, 0], 0, width - 1)
    polygon[:, 1] = np.clip(polygon[:, 1], 0, height - 1)
    cv2.fillPoly(mask, [np.rint(polygon).astype(np.int32)], 255)
    return mask


def crop_to_mask(image: np.ndarray, mask: np.ndarray, padding: int = 24) -> np.ndarray | None:
    ys, xs = np.where(mask > 0)
    if not len(xs):
        return None
    height, width = mask.shape
    x1 = max(0, int(xs.min()) - padding)
    x2 = min(width, int(xs.max()) + padding + 1)
    y1 = max(0, int(ys.min()) - padding)
    y2 = min(height, int(ys.max()) + padding + 1)
    result = image[y1:y2, x1:x2].copy()
    result[:, :, 3] = mask[y1:y2, x1:x2]
    return result


def load_annotations(path: Path | None) -> list[dict]:
    if path is None:
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        payload = payload.get("annotations", payload.get("objects", []))
    if not isinstance(payload, list):
        raise ValueError("标注文件必须是数组，或包含 annotations/objects 数组")
    return payload


def run_segment(args: argparse.Namespace) -> dict:
    source = read_rgba(args.input)
    height, width = source.shape[:2]
    alpha = foreground_alpha(source, args.model, args.max_side)
    annotations = load_annotations(args.annotations)
    output = args.output
    output.mkdir(parents=True, exist_ok=True)

    tag = safe_name(args.tag) if args.tag else ""
    suffix = f"__{tag}" if tag else ""
    foreground_name = f"前景总图{suffix}.png"
    repaired_name = f"背景修补草稿{suffix}.jpg"
    mask_name = f"移除蒙版{suffix}.png"
    report_name = f"处理报告{suffix}.json"

    global_rgba = source.copy()
    global_rgba[:, :, 3] = alpha
    save_rgba(output / foreground_name, global_rgba)
    foreground_y, foreground_x = np.where(alpha > 16)
    foreground_bounds = None if len(foreground_x) == 0 else {
        "x": int(foreground_x.min()),
        "y": int(foreground_y.min()),
        "width": int(foreground_x.max() - foreground_x.min() + 1),
        "height": int(foreground_y.max() - foreground_y.min() + 1),
    }

    removable = np.zeros((height, width), dtype=np.uint8)
    manifest: list[dict] = []
    for index, item in enumerate(annotations, 1):
        points = item.get("points") or item.get("polygon") or []
        region = polygon_mask((width, height), points)
        # 人工框决定对象归属，模型 alpha 负责去掉框内背景。
        object_mask = cv2.bitwise_and(region, alpha)
        kind = str(item.get("type") or item.get("kind") or "对象")
        label = str(item.get("label") or item.get("name") or f"{kind}{index}")
        cutout = crop_to_mask(source, object_mask, args.padding)
        if cutout is None:
            manifest.append({"label": label, "type": kind, "status": "empty"})
            continue
        filename = f"{index:02d}_{safe_name(label)}.png"
        save_rgba(output / f"对象_{filename}", cutout)
        if kind not in {"必须保留区域", "禁止覆盖区域", "protected", "no-cover"}:
            removable = cv2.bitwise_or(removable, object_mask)
        manifest.append({"label": label, "type": kind, "status": "ok", "file": f"对象_{filename}"})

    # 没有人工细分标注时，自动前景就是需要从背景中移除的主体。
    # 合成时同坐标透明前景会覆盖修补区，它主要负责避免边界外重复人物和接缝。
    if not annotations:
        # 背景移除蒙版比显示蒙版更保守：采用低阈值、闭合并填满外轮廓。
        # 即使模型在脸部或衣服内部漏出小洞，原位置也不会残留半张脸与移动层重叠。
        support = np.where(alpha > 6, 255, 0).astype(np.uint8)
        close_radius = max(3, round(min(width, height) * 0.012))
        close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_radius * 2 + 1, close_radius * 2 + 1))
        support = cv2.morphologyEx(support, cv2.MORPH_CLOSE, close_kernel)
        contours, _ = cv2.findContours(support, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        removable = np.zeros_like(support)
        minimum_area = width * height * 0.00008
        for contour in contours:
            if cv2.contourArea(contour) >= minimum_area:
                cv2.drawContours(removable, [contour], -1, 255, thickness=cv2.FILLED)

    # 对大面积角色移除仅作为“背景草稿”，必须经过人工检查；生成式补全不在本阶段。
    radius = max(3, round(min(width, height) * 0.012))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
    repair_mask = cv2.dilate(removable, kernel) if np.any(removable) else removable
    bgr = cv2.cvtColor(source[:, :, :3], cv2.COLOR_RGB2BGR)
    removable_ratio = float(np.count_nonzero(repair_mask)) / float(width * height)
    if removable_ratio > 0.12:
        # 大面积主体直接在原分辨率修补会产生放射状色块。先在低分辨率连续填充，
        # 再放大并用柔边蒙版混合，得到适合作为人物层底板的稳定背景。
        work_scale = min(1.0, 640.0 / max(width, height))
        work_size = (max(1, round(width * work_scale)), max(1, round(height * work_scale)))
        small_bgr = cv2.resize(bgr, work_size, interpolation=cv2.INTER_AREA)
        small_mask = cv2.resize(repair_mask, work_size, interpolation=cv2.INTER_NEAREST)
        small_repaired = cv2.inpaint(small_bgr, small_mask, inpaintRadius=7, flags=cv2.INPAINT_TELEA)
        small_repaired = cv2.GaussianBlur(small_repaired, (0, 0), 11.0)
        filled = cv2.resize(small_repaired, (width, height), interpolation=cv2.INTER_CUBIC)
        feather_sigma = max(3.0, min(width, height) * 0.012)
        blend = cv2.GaussianBlur(repair_mask, (0, 0), feather_sigma).astype(np.float32)[:, :, None] / 255.0
        repaired = np.clip(bgr.astype(np.float32) * (1.0 - blend) + filled.astype(np.float32) * blend, 0, 255).astype(np.uint8)
    else:
        repaired = cv2.inpaint(bgr, repair_mask, inpaintRadius=max(3, radius), flags=cv2.INPAINT_TELEA)
    save_rgb(output / repaired_name, cv2.cvtColor(repaired, cv2.COLOR_BGR2RGB))
    cv2.imwrite(str(output / mask_name), repair_mask)

    report = {
        "input": str(args.input.resolve()),
        "width": width,
        "height": height,
        "model": args.model,
        "offline": True,
        "objects": manifest,
        "outputs": {"foreground": foreground_name, "repaired_background": repaired_name, "mask": mask_name},
        "foreground_bounds": foreground_bounds,
        "warning": "背景修补为本地算法草稿，大面积缺失不视为可交付成品。",
    }
    (output / report_name).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def safe_name(value: str) -> str:
    invalid = '<>:"/\\|?*'
    cleaned = "".join("_" if char in invalid else char for char in value).strip(" .")
    return cleaned or "对象"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="平台与社区本地视觉预处理")
    sub = parser.add_subparsers(dest="command", required=True)
    segment = sub.add_parser("segment", help="抠图并按人工多边形标注拆分对象")
    segment.add_argument("--input", type=Path, required=True)
    segment.add_argument("--annotations", type=Path)
    segment.add_argument("--output", type=Path, required=True)
    segment.add_argument("--model", default="u2net")
    segment.add_argument("--max-side", type=int, default=1280)
    segment.add_argument("--padding", type=int, default=24)
    segment.add_argument("--tag", default="")
    segment.set_defaults(handler=run_segment)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    result = args.handler(args)
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()








