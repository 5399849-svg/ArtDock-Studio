from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    # Generated transparent assets may retain nearly invisible pixels around the
    # object. Ignore them so they do not make the visible button look undersized.
    solid_enough = alpha.point(lambda value: 255 if value >= 8 else 0)
    bbox = solid_enough.getbbox()
    if not bbox:
        raise ValueError("button base has no visible pixels")
    return bbox


def fit_font(text: str, font_path: Path, max_width: int, max_height: int) -> ImageFont.FreeTypeFont:
    for size in range(max_height, 7, -1):
        font = ImageFont.truetype(str(font_path), size)
        box = font.getbbox(text, stroke_width=max(1, round(size * 0.045)))
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            return font
    raise ValueError("text cannot fit inside the button")


def render(base_path: Path, font_path: Path, text: str, output: Path) -> None:
    source = Image.open(base_path).convert("RGBA")
    source = source.crop(alpha_bbox(source))
    source.putalpha(source.getchannel("A").point(lambda value: 0 if value < 8 else value))

    width, height = 369, 102
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    # Preserve ornament proportions while fitting the standard MuMu button canvas.
    # The production canvas stays 369x102, while the visible plaque remains slim
    # with transparent breathing room above and below.
    source.thumbnail((347, 70), Image.Resampling.LANCZOS)
    x = (width - source.width) // 2
    y = (height - source.height) // 2
    canvas.alpha_composite(source, (x, y))

    font = fit_font(text, font_path, 176, 37)
    stroke = 1
    draw = ImageDraw.Draw(canvas)
    box = draw.textbbox((0, 0), text, font=font, stroke_width=stroke)
    tx = (width - (box[2] - box[0])) / 2 - box[0]
    ty = (height - (box[3] - box[1])) / 2 - box[1] - 1

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.text(
        (tx, ty + 1), text, font=font, fill=(83, 23, 17, 155),
        stroke_width=1, stroke_fill=(83, 23, 17, 145),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(0.7))
    canvas = Image.alpha_composite(canvas, shadow)
    draw = ImageDraw.Draw(canvas)
    draw.text(
        (tx, ty), text, font=font, fill=(255, 248, 221, 255),
        stroke_width=stroke, stroke_fill=(112, 40, 26, 230),
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render exact CTA copy on a generated KV-style button base.")
    parser.add_argument("base", type=Path)
    parser.add_argument("font", type=Path)
    parser.add_argument("text")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    render(args.base, args.font, args.text, args.output)


if __name__ == "__main__":
    main()
