import argparse
import json
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps


def paste_reflected(image, box, source_box, blur_radius, seam):
    x0, y0, x1, y1 = box
    patch = image.crop(source_box).resize((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
    patch = ImageOps.flip(patch) if seam in {"top", "bottom"} else ImageOps.mirror(patch)
    feather = max(8, min(patch.size) // 4)
    edge = Image.new("L", patch.size, 255)
    # Fade the edge facing the retained image; outer canvas edges remain opaque.
    if seam in {"left", "right"}:
        start = max(1, patch.width - feather) if seam == "right" else 0
        end = patch.width if seam == "right" else min(feather, patch.width)
        for x in range(start, end):
            value = round(255 * (patch.width - 1 - x) / max(1, feather - 1)) if seam == "right" else round(255 * x / max(1, feather - 1))
            for y in range(patch.height):
                edge.putpixel((x, y), value)
    else:
        start = max(1, patch.height - feather) if seam == "bottom" else 0
        end = patch.height if seam == "bottom" else min(feather, patch.height)
        for y in range(start, end):
            value = round(255 * (patch.height - 1 - y) / max(1, feather - 1)) if seam == "bottom" else round(255 * y / max(1, feather - 1))
            for x in range(patch.width):
                edge.putpixel((x, y), value)
    mask = edge
    if blur_radius:
        mask = mask.filter(ImageFilter.GaussianBlur(blur_radius))
    image.paste(patch, (x0, y0), mask)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--regions", required=True, help="JSON array: {box:[...],source:[...]}")
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGB")
    for region in json.loads(args.regions):
        paste_reflected(image, region["box"], region["source"], region.get("blur", 8), region.get("seam", "right"))
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
