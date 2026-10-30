from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove


ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("U2NET_HOME", str(ROOT / "local-ai" / "models"))


def soft_box(width: int, height: int, box: tuple[float, float, float, float], feather: int = 8) -> np.ndarray:
    x1, y1, x2, y2 = box
    mask = np.zeros((height, width), np.uint8)
    cv2.rectangle(mask, (round(x1 * width), round(y1 * height)), (round(x2 * width), round(y2 * height)), 255, -1)
    if feather:
        mask = cv2.GaussianBlur(mask, (0, 0), feather)
    return mask


def save_layer(source: np.ndarray, alpha: np.ndarray, target: Path) -> dict:
    rgba = source.copy()
    rgba[:, :, 3] = alpha
    Image.fromarray(rgba, "RGBA").save(target, optimize=True)
    ys, xs = np.where(alpha > 12)
    if not len(xs):
        return {"visible": False, "bounds": None, "coverage": 0}
    return {
        "visible": True,
        "bounds": {"x": int(xs.min()), "y": int(ys.min()), "width": int(xs.max() - xs.min() + 1), "height": int(ys.max() - ys.min() + 1)},
        "coverage": round(float(np.count_nonzero(alpha > 12)) / alpha.size, 5),
    }


def foreground_alpha(source: np.ndarray, max_side: int) -> np.ndarray:
    height, width = source.shape[:2]
    scale = min(1.0, max_side / max(width, height))
    work = cv2.resize(source, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA) if scale < 1 else source
    result = remove(Image.fromarray(work, "RGBA"), session=new_session("u2net"))
    alpha = np.array(result.convert("RGBA"))[:, :, 3]
    if alpha.shape != (height, width):
        alpha = cv2.resize(alpha, (width, height), interpolation=cv2.INTER_LINEAR)
    return alpha


def detail_alpha(source: np.ndarray, zone: np.ndarray, base_alpha: np.ndarray) -> np.ndarray:
    """Recover bright/gold lettering that generic foreground segmentation misses."""
    rgb = source[:, :, :3]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    local = cv2.GaussianBlur(gray, (0, 0), 7)
    contrast = cv2.absdiff(gray, local)
    bright_ink = ((gray > 182) & (contrast > 7)) | ((hsv[:, :, 1] > 58) & (hsv[:, :, 2] > 148) & (contrast > 10))
    edges = cv2.Canny(gray, 55, 145) > 0
    detail = np.where(bright_ink | edges, 255, 0).astype(np.uint8)
    detail = cv2.morphologyEx(detail, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    detail = cv2.dilate(detail, np.ones((3, 3), np.uint8), iterations=1)
    detail = cv2.GaussianBlur(detail, (0, 0), 1.1)
    recovered = cv2.max(base_alpha, detail)
    return cv2.bitwise_and(recovered, zone)


def repair_background(source: np.ndarray, removal: np.ndarray) -> np.ndarray:
    height, width = removal.shape
    support = np.where(removal > 6, 255, 0).astype(np.uint8)
    radius = max(5, round(min(width, height) * .016))
    support = cv2.dilate(support, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1)))
    scale = min(1.0, 720 / max(width, height))
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    bgr = cv2.cvtColor(source[:, :, :3], cv2.COLOR_RGB2BGR)
    small = cv2.resize(bgr, size, interpolation=cv2.INTER_AREA)
    small_mask = cv2.resize(support, size, interpolation=cv2.INTER_NEAREST)
    filled = cv2.inpaint(small, small_mask, 7, cv2.INPAINT_TELEA)
    filled = cv2.GaussianBlur(filled, (0, 0), 8)
    filled = cv2.resize(filled, (width, height), interpolation=cv2.INTER_CUBIC)
    blend = cv2.GaussianBlur(support, (0, 0), max(3, radius * .7)).astype(np.float32)[:, :, None] / 255
    composed = np.clip(bgr * (1 - blend) + filled * blend, 0, 255).astype(np.uint8)
    return cv2.cvtColor(composed, cv2.COLOR_BGR2RGB)


def dominant_extent(mask: np.ndarray) -> tuple[int, int, int]:
    binary = np.where(mask > 24, 255, 0).astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    if count <= 1:
        return (0, 0, 0)
    index = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (int(stats[index, cv2.CC_STAT_WIDTH]), int(stats[index, cv2.CC_STAT_HEIGHT]), int(stats[index, cv2.CC_STAT_AREA]))


def solidify_alpha(mask: np.ndarray, min_area: int = 240) -> np.ndarray:
    """Close transparent holes inside a selected opaque subject without changing RGB."""
    support = np.where(mask > 10, 255, 0).astype(np.uint8)
    support = cv2.morphologyEx(support, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    contours, _ = cv2.findContours(support, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(mask)
    for contour in contours:
        if cv2.contourArea(contour) >= min_area:
            cv2.drawContours(filled, [contour], -1, 255, cv2.FILLED)
    edge = cv2.GaussianBlur(filled, (0, 0), .8)
    return cv2.max(mask, edge)


def main() -> None:
    parser = argparse.ArgumentParser(description="Split a flattened store JPG into pixel-preserving editable layer groups.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--background-source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--character-layer", type=Path)
    parser.add_argument("--page", type=int, required=True)
    parser.add_argument("--orientation", choices=["landscape", "portrait"], required=True)
    parser.add_argument("--max-side", type=int, default=1280)
    args = parser.parse_args()

    source = np.array(Image.open(args.input).convert("RGBA"))
    height, width = source.shape[:2]
    alpha = foreground_alpha(source, args.max_side)
    portrait = args.orientation == "portrait"

    # Store screenshots have a stable editorial grammar. Geometry only assigns a
    # semantic owner; U2Net supplies the soft object boundary and source RGB is
    # never regenerated.
    if args.page == 1:
        zones = {
            "logo": (.68, 0, 1, .27) if not portrait else (.56, 0, 1, .23),
            "copy": (0, .64, 1, 1) if not portrait else (0, .67, 1, 1),
            "screenshot": (0, 0, 0, 0),
        }
    else:
        zones = {
            # Store pages 2-6 do not carry an independent game logo in this set;
            # phone-header artwork must remain part of the screenshot layer.
            "logo": (0, 0, 0, 0),
            "copy": (0, .63, .43, 1) if not portrait else (0, .70, 1, 1),
            "screenshot": (.38, .04, 1, .94) if not portrait else (.08, .06, .94, .72),
        }

    assigned = np.zeros_like(alpha)
    layers: dict[str, np.ndarray] = {}
    for name in ("logo", "copy", "screenshot"):
        zone = soft_box(width, height, zones[name])
        if name in {"logo", "copy"}:
            # Text/logo recovery must not claim every segmented foreground pixel
            # inside the editorial zone, otherwise a character body crossing the
            # title area is cut off and incorrectly travels with the copy layer.
            layer = detail_alpha(source, zone, np.zeros_like(alpha))
        else:
            layer = solidify_alpha(cv2.bitwise_and(alpha, zone), max(160, round(width * height * .00012)))
        layer = cv2.bitwise_and(layer, cv2.bitwise_not(assigned))
        layers[name] = layer
        assigned = cv2.max(assigned, layer)
    character_zone = soft_box(width, height, (0, 0, .47, 1) if not portrait else (0, .45, .62, 1), 2) if args.page > 1 else np.full_like(alpha, 255)
    character_alpha = cv2.bitwise_and(alpha, character_zone)
    character_selection = "u2net"
    if args.character_layer and args.character_layer.exists():
        prompted = np.array(Image.open(args.character_layer).convert("RGBA"))[:, :, 3]
        if prompted.shape != alpha.shape:
            prompted = cv2.resize(prompted, (width, height), interpolation=cv2.INTER_LINEAR)
        base_character = cv2.bitwise_and(cv2.bitwise_and(alpha, character_zone), cv2.bitwise_not(assigned))
        prompted_character = cv2.bitwise_and(cv2.bitwise_and(prompted, character_zone), cv2.bitwise_not(assigned))
        _, base_height, base_area = dominant_extent(base_character)
        _, prompted_height, prompted_area = dominant_extent(prompted_character)
        # Use SAM2 only when it repairs a clearly truncated generic subject.
        # A fixed hint that catches merely a face or a sleeve must never replace
        # an already complete U2Net character.
        if prompted_height >= max(round(height * .38), round(base_height * 1.28)) and prompted_area >= base_area * .72:
            character_alpha = cv2.bitwise_and(prompted, character_zone)
            character_selection = "sam2"
    layers["character"] = solidify_alpha(cv2.bitwise_and(character_alpha, cv2.bitwise_not(assigned)), max(220, round(width * height * .00014)))

    args.output.mkdir(parents=True, exist_ok=True)
    manifest_layers = []
    labels = {"background": "背景", "character": "人物", "copy": "文案", "screenshot": "截图", "logo": "Logo"}
    for index, name in enumerate(("character", "copy", "screenshot", "logo"), 1):
        filename = f"{index:02d}-{name}.png"
        info = save_layer(source, layers[name], args.output / filename)
        manifest_layers.append({"id": name, "label": labels[name], "file": filename, **info})

    background_source = np.array(Image.open(args.background_source or args.input).convert("RGBA"))
    if background_source.shape[:2] != (height, width):
        background_source = cv2.resize(background_source, (width, height), interpolation=cv2.INTER_LANCZOS4)
    background_alpha = foreground_alpha(background_source, args.max_side)
    if args.background_source is None or Path(args.background_source).resolve() == args.input.resolve():
        background_alpha = cv2.max(background_alpha, np.maximum.reduce(list(layers.values())))
    background = repair_background(background_source, background_alpha)
    Image.fromarray(background, "RGB").save(args.output / "00-background.jpg", quality=95, subsampling=0)
    manifest_layers.insert(0, {"id": "background", "label": labels["background"], "file": "00-background.jpg", "visible": True, "bounds": {"x": 0, "y": 0, "width": width, "height": height}, "coverage": 1})

    manifest = {
        "version": 1,
        "source": str(args.input.resolve()),
        "backgroundSource": str((args.background_source or args.input).resolve()),
        "page": args.page,
        "orientation": args.orientation,
        "width": width,
        "height": height,
        "method": "local-best-mask-solid-subjects-v6" if args.character_layer else "local-solid-subjects-v6",
        "pixelPolicy": "foreground layers contain original JPG RGB only",
        "sharedBackgroundGroup": f"{args.orientation}-pages-2-6" if args.page > 1 else f"{args.orientation}-page-1",
        "layers": manifest_layers,
        "quality": {"automatic": True, "maskConfidence": "assisted", "needsReview": True, "characterSelection": character_selection},
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=True))


if __name__ == "__main__":
    main()
