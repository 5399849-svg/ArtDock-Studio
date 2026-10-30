from __future__ import annotations

import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "KV PSD"
OUTPUT_DIR = ROOT / "docs" / "template-tests" / "37网游平台首页头图-V1.0"

CANVAS = (1920, 550)
REGIONS = {
    "logo": (618, 10, 164, 75),
    "copy": (618, 108, 346, 198),
    "core": (961, 0, 609, 356),
    "extend_left": (0, 0, 964, 550),
    "extend_right": (1567, 0, 353, 550),
    "ui_login": (330, 0, 282, 295),
    "ui_content": (330, 353, 1242, 197),
    "ui_dots": (872, 307, 159, 30),
    "ip": (1438, 322, 121, 26),
}


def fit_contain(image: Image.Image, box: tuple[int, int, int, int]) -> tuple[Image.Image, tuple[int, int]]:
    x, y, width, height = box
    scale = min(width / image.width, height / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    fitted = image.resize(size, Image.Resampling.LANCZOS)
    return fitted, (x + (width - size[0]) // 2, y + (height - size[1]) // 2)


def add_bottom_gradient(canvas: Image.Image, height: int) -> None:
    overlay = Image.new("RGBA", canvas.size, (255, 255, 255, 0))
    pixels = overlay.load()
    start = canvas.height - height
    for y in range(start, canvas.height):
        alpha = round(255 * ((y - start) / max(1, height - 1)) ** 1.25)
        for x in range(canvas.width):
            pixels[x, y] = (255, 255, 255, alpha)
    canvas.alpha_composite(overlay)


def jpeg_under_limit(image: Image.Image, output: Path, limit: int) -> dict:
    for quality in range(94, 39, -2):
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, "JPEG", quality=quality, optimize=True, progressive=True, subsampling=0)
        if buffer.tell() <= limit:
            output.write_bytes(buffer.getvalue())
            return {"bytes": buffer.tell(), "quality": quality, "passed": True}
    raise RuntimeError("无法在不低于40质量的情况下满足600KB限制")


def draw_region(draw: ImageDraw.ImageDraw, box, color, label, width=4):
    x, y, w, h = box
    draw.rectangle((x, y, x + w - 1, y + h - 1), outline=color, width=width)
    label_y = max(0, y + 4)
    draw.rectangle((x + 4, label_y, x + 4 + max(118, len(label) * 16), label_y + 28), fill=color)
    draw.text((x + 10, label_y + 5), label, fill="white", font=ImageFont.load_default())


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(ASSET_DIR / "横.jpg").convert("RGB")
    title = Image.open(ASSET_DIR / "文案两行排列.png").convert("RGBA")
    logo = Image.open(ASSET_DIR / "logo.png").convert("RGBA")
    if source.size != (1920, 1080):
        raise ValueError(f"横版KV应为1920×1080，实际为{source.size}")

    # Keep the source at 1:1 scale and shift the whole clean KV 261px right.
    # This maps the principal couple (source x≈700..1250) to the PSD core region
    # (target x=961..1570). The new left margin is reconstructed from a mirrored
    # environment strip, so no person layer is fabricated or duplicated.
    source_crop_y = 230
    source_strip = source.crop((0, source_crop_y, 1920, source_crop_y + CANVAS[1])).convert("RGBA")
    shift_x = 261
    background = Image.new("RGBA", CANVAS, (64, 22, 24, 255))
    left_extension = source_strip.crop((0, 0, shift_x, CANVAS[1])).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    background.alpha_composite(left_extension, (0, 0))
    background.alpha_composite(source_strip, (shift_x, 0))

    fitted_title, title_xy = fit_contain(title, REGIONS["copy"])
    fitted_logo, logo_xy = fit_contain(logo, REGIONS["logo"])
    background.alpha_composite(fitted_title, title_xy)
    background.alpha_composite(fitted_logo, logo_xy)
    ip_asset_path = ASSET_DIR / "IP标识.png"
    ip_xy = None
    if ip_asset_path.exists():
        ip_asset = Image.open(ip_asset_path).convert("RGBA")
        fitted_ip, ip_xy = fit_contain(ip_asset, REGIONS["ip"])
        background.alpha_composite(fitted_ip, ip_xy)

    # The updated PSD contains an 85px fixed gradient layer (y=465..550).
    add_bottom_gradient(background, 85)

    final_path = OUTPUT_DIR / "37网游平台首页头图_1920x550_模板测试_V01.jpg"
    technical = jpeg_under_limit(background, final_path, 600 * 1024)

    overlay = background.copy()
    draw = ImageDraw.Draw(overlay, "RGBA")
    draw_region(draw, REGIONS["core"], (0, 185, 110, 255), "CORE")
    draw_region(draw, REGIONS["copy"], (123, 97, 255, 255), "COPY")
    draw_region(draw, REGIONS["logo"], (0, 184, 217, 255), "LOGO")
    for key in ("ui_login", "ui_content", "ui_dots"):
        x, y, w, h = REGIONS[key]
        draw.rectangle((x, y, x + w - 1, y + h - 1), fill=(255, 77, 79, 68), outline=(255, 77, 79, 255), width=3)
    draw_region(draw, REGIONS["ip"], (250, 140, 22, 255), "IP")
    overlay.save(OUTPUT_DIR / "规范叠加检查_V01.png", optimize=True)

    report = {
        "template": str((ROOT / "模版规范PSD版本：V1.0" / "37网游平台首页-头图.psd").resolve()),
        "source": str((ASSET_DIR / "横.jpg").resolve()),
        "output": str(final_path.resolve()),
        "canvas": {"width": 1920, "height": 550},
        "layout": "版式_01_左文右图",
        "regions": REGIONS,
        "titleArtwork": "文案两行排列.png",
        "logoArtwork": "logo.png",
        "ipArtwork": "IP标识.png" if ip_asset_path.exists() else None,
        "placement": {"sourceShiftX": shift_x, "sourceCropY": source_crop_y, "method": "mirrored-left-background-extension"},
        "bottomWhiteGradientPx": 85,
        "technical": {**technical, "limitBytes": 600 * 1024, "format": "JPG"},
        "review": {
            "status": "designer_review_required",
            "deliveryAllowed": False,
            "warnings": [
                "固定白色渐变按已确认规范使用85px。",
                "本测试为单张干净KV的规则重构与镜像背景延展，不包含生成式背景补全。",
            ],
        },
    }
    (OUTPUT_DIR / "测试报告.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
