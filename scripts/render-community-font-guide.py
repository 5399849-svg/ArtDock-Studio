"""Render literal glyphs from one verified font file, without font fallback."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def main():
    options = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    text = options["text"]
    if not text.strip() or len(text) > 200:
        raise ValueError("文案字数需在 1–200 字之间")
    if options.get("mode") == "typeset":
        render_typeset(options, text)
        return
    font = ImageFont.truetype(options["fontFile"], 180, index=options.get("faceIndex", 0))
    # A glyph sheet is a source of outlines, not a prescribed final composition.
    lines = []
    for paragraph in text.splitlines():
        paragraph = paragraph or " "
        for start in range(0, len(paragraph), 12):
            lines.append(paragraph[start:start + 12])
    bounds = [font.getbbox(line) for line in lines]
    padding, gap = 48, 36
    widths = [max(1, b[2] - b[0]) for b in bounds]
    heights = [max(1, b[3] - b[1]) for b in bounds]
    image = Image.new("RGB", (max(widths) + padding * 2, sum(heights) + gap * (len(lines) - 1) + padding * 2), "white")
    draw, y = ImageDraw.Draw(image), padding
    for line, box, width, height in zip(lines, bounds, widths, heights):
        draw.text(((image.width - width) / 2 - box[0], y - box[1]), line, font=font, fill="black")
        y += height + gap
    image.thumbnail((2304, 1536), Image.Resampling.LANCZOS)
    image.save(options["output"], format="PNG")


def render_typeset(options, text):
    # Use this exact file, with no synthetic weight, stroke, shadow or fallback.
    # Only explicit line breaks wrap text. Subtitle sentences stay on one line.
    lines = text.splitlines()
    size = 320
    while True:
        font = ImageFont.truetype(options["fontFile"], size, index=options.get("faceIndex", 0))
        boxes = [font.getbbox(line or " ") for line in lines]
        widths = [max(1, b[2] - b[0]) for b in boxes]
        heights = [max(1, b[3] - b[1]) for b in boxes]
        gap = max(2, round(size * .18))
        width, height = max(widths), sum(heights) + gap * (len(lines) - 1)
        factor = min(1, 4088 / width, 2040 / height)
        if factor == 1:
            break
        size = max(1, min(size - 1, int(size * factor)))
    image = Image.new("RGBA", (width + 8, height + 8), (0, 0, 0, 0))
    draw, y = ImageDraw.Draw(image), 4
    for line, box, w, h in zip(lines, boxes, widths, heights):
        draw.text((4 + (width - w) / 2 - box[0], y - box[1]), line, font=font, fill=options["color"])
        y += h + gap
    ink = image.getbbox()
    if not ink:
        raise ValueError("文案没有可见字形")
    image.crop((max(0, ink[0] - 2), max(0, ink[1] - 2), min(image.width, ink[2] + 2), min(image.height, ink[3] + 2))).save(options["output"], format="PNG")


if __name__ == "__main__":
    main()
