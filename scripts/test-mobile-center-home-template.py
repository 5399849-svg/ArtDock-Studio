from __future__ import annotations

import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "KV PSD"
OUTPUT_DIR = ROOT / "docs" / "template-tests" / "37网游手游中心-首页头图-V1.0"
CANVAS = (1920, 862)
LAYOUT = "版式_05_右Logo居中文_主体居中"
REGIONS = {
    "logo": (1346, 10, 222, 102),
    "copy": (556, 312, 844, 138),
    "core": (339, 0, 1244, 510),
    "extend_left": (0, 0, 341, 862),
    "extend_right": (1580, 0, 340, 862),
    "ui_content": (340, 506, 1242, 356),
    "ui_dots": (864, 460, 189, 29),
    "ip": (1446, 468, 122, 26),
}


def fit_contain(image: Image.Image, box: tuple[int, int, int, int]):
    x, y, width, height = box
    scale = min(width / image.width, height / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    fitted = image.resize(size, Image.Resampling.LANCZOS)
    return fitted, (x + (width - size[0]) // 2, y + (height - size[1]) // 2)


def jpeg_under_limit(image: Image.Image, output: Path, limit: int):
    for quality in range(94, 39, -2):
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=0)
        if buffer.tell() <= limit:
            output.write_bytes(buffer.getvalue())
            return {"bytes": buffer.tell(), "quality": quality, "passed": True}
    raise RuntimeError("无法在质量不低于40的情况下满足600KB限制")


def draw_region(draw: ImageDraw.ImageDraw, box, color, label, fill=None):
    x, y, width, height = box
    draw.rectangle((x, y, x + width - 1, y + height - 1), fill=fill, outline=color, width=4)
    draw.rectangle((x + 5, y + 5, x + 145, y + 33), fill=color)
    draw.text((x + 11, y + 11), label, fill="white", font=ImageFont.load_default())


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(ASSET_DIR / "横.jpg").convert("RGB")
    title = Image.open(ASSET_DIR / "文案两行排列.png").convert("RGBA")
    logo = Image.open(ASSET_DIR / "logo.png").convert("RGBA")
    ip = Image.open(ASSET_DIR / "IP标识.png").convert("RGBA")
    if source.size != (1920, 1080):
        raise ValueError(f"横版KV应为1920×1080，实际为{source.size}")

    # 中心裁切保留完整人物关系；人物面部集中在 y=140..310，避开 y=312 起的居中文案区。
    background = ImageOps.fit(source, CANVAS, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5)).convert("RGBA")
    fitted_title, title_xy = fit_contain(title, REGIONS["copy"])
    fitted_logo, logo_xy = fit_contain(logo, REGIONS["logo"])
    fitted_ip, ip_xy = fit_contain(ip, REGIONS["ip"])
    background.alpha_composite(fitted_title, title_xy)
    background.alpha_composite(fitted_logo, logo_xy)
    background.alpha_composite(fitted_ip, ip_xy)

    final_path = OUTPUT_DIR / "37网游手游中心-首页头图_1920x862_模板测试_V01.jpg"
    technical = jpeg_under_limit(background, final_path, 600 * 1024)

    overlay = background.copy()
    draw = ImageDraw.Draw(overlay, "RGBA")
    draw_region(draw, REGIONS["core"], (0, 185, 110, 255), "CORE")
    draw_region(draw, REGIONS["copy"], (123, 97, 255, 255), "COPY")
    draw_region(draw, REGIONS["logo"], (0, 184, 217, 255), "LOGO")
    draw_region(draw, REGIONS["ip"], (250, 140, 22, 255), "IP")
    draw_region(draw, REGIONS["ui_content"], (255, 77, 79, 255), "PAGE UI", fill=(255, 77, 79, 62))
    draw_region(draw, REGIONS["ui_dots"], (255, 77, 79, 255), "DOTS", fill=(255, 77, 79, 62))
    overlay_path = OUTPUT_DIR / "规范叠加检查_V01.jpg"
    jpeg_under_limit(overlay, overlay_path, 1024 * 1024)

    report = {
        "template": str((ROOT / "模版规范PSD版本：V1.0" / "37网游手游中心-首页头图.psd").resolve()),
        "source": str((ASSET_DIR / "横.jpg").resolve()),
        "output": str(final_path.resolve()),
        "overlay": str(overlay_path.resolve()),
        "canvas": {"width": 1920, "height": 862},
        "layout": LAYOUT,
        "regions": REGIONS,
        "titleArtwork": "文案两行排列.png",
        "logoArtwork": "logo.png",
        "ipArtwork": "IP标识.png",
        "placement": {"method": "center-crop", "sourceSize": [1920, 1080], "targetSize": [1920, 862]},
        "technical": {**technical, "limitBytes": 600 * 1024, "format": "JPG"},
        "review": {
            "status": "designer_review_required",
            "deliveryAllowed": False,
            "warnings": [
                "PSD实际画布为1920×862，但00_规范信息仍声明1920×550。",
                "00_规范信息中的资源位名称仍为37网游平台首页头图，需要改为37网游手游中心-首页头图。",
                "本次按PSD默认版式05：右Logo、居中文案、主体居中生成。",
            ],
        },
    }
    (OUTPUT_DIR / "测试报告.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
