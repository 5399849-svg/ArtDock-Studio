import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage


LAYER_PATTERNS = {
    "background": re.compile(r"^(图|背景(?:\s*拷贝)?)$"),
    "character": re.compile(r"^(人物|角色)\d*$"),
    "screenshot": re.compile(r"^截图\d*$"),
    "copy": re.compile(r"^文案\d*$"),
    "logo": re.compile(r"logo", re.IGNORECASE),
}


def paste_layer(layer, artboard_bbox):
    left, top, right, bottom = artboard_bbox
    canvas = Image.new("RGBA", (right - left, bottom - top), (0, 0, 0, 0))
    rendered = layer.composite()
    if rendered is None:
        return canvas
    layer_left, layer_top, layer_right, layer_bottom = layer.bbox
    x, y = layer_left - left, layer_top - top
    canvas.alpha_composite(rendered.convert("RGBA"), (x, y))
    return canvas


def find_layer(artboard, layer_id):
    pattern = LAYER_PATTERNS[layer_id]
    return next((layer for layer in artboard if pattern.search(layer.name.strip())), None)


def foreground_cutoff(image):
    """A wide empty alpha band separates the body from a hidden skirt fragment.

    Keep the original pixels. The renderer can hide/reveal the detached fragment.
    Tiny transparent scan lines are not treated as a foreground occluder.
    """
    alpha = image.getchannel("A")
    occupied = [alpha.crop((0, y, image.width, y+1)).getextrema()[1] > 24 for y in range(image.height)]
    start = None
    for y, present in enumerate(occupied):
        if not present and start is None:
            start = y
        if present and start is not None:
            if start > image.height * .45 and y-start > max(12, image.height * .035):
                return start
            start = None
    return None


def export_psd(psd_path, output_dir, variant):
    psd = PSDImage.open(psd_path)
    artboards = [layer for layer in psd if layer.kind == "artboard"]
    if len(artboards) != 6:
        raise RuntimeError(f"PSD must contain 6 artboards, got {len(artboards)}")
    output_dir.mkdir(parents=True, exist_ok=True)
    shared_background = find_layer(artboards[1], "background")

    for page, artboard in enumerate(artboards, start=1):
        page_dir = output_dir / f"{variant}-{page}"
        page_dir.mkdir(parents=True, exist_ok=True)
        width = artboard.right - artboard.left
        height = artboard.bottom - artboard.top
        layers = []
        order = ["background", "screenshot", "character", "copy", "logo"] if variant == "portrait" else ["background", "character", "screenshot", "copy", "logo"]
        for index, layer_id in enumerate(order):
            layer = find_layer(artboard, layer_id)
            if layer_id == "background" and page >= 2:
                layer = shared_background
            if layer is None:
                continue
            reference = artboards[1] if layer is shared_background else artboard
            image = layer.composite()
            if image is None:
                raise RuntimeError(f"Cannot render {layer.name}")
            image = image.convert("RGBA")
            file_name = f"{index:02d}-{layer_id}.png"
            image.save(page_dir / file_name, optimize=True)
            alpha = image.getchannel("A")
            bbox = alpha.getbbox()
            layers.append({
                "id": layer_id,
                "name": layer.name,
                "file": file_name,
                "visible": True,
                "bbox": list(bbox) if bbox else None,
                "rect": {"x": layer.left-reference.left, "y":layer.top-reference.top, "width":image.width, "height":image.height},
                "compositeArtwork": page == 1 and layer_id == "background" and layer.name.strip() == "图",
                "foregroundClipY": foreground_cutoff(image) if layer_id == "character" else None,
            })
        if not any(item["id"] == "background" for item in layers):
            raise RuntimeError(f"Page {page} has no background layer")
        manifest = {
            "method": "psd-direct-layers-v2",
            "source": str(psd_path),
            "variant": variant,
            "page": page,
            "width": width,
            "height": height,
            "layers": layers,
        }
        (page_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--psd", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--variant", choices=["landscape", "portrait"], required=True)
    args = parser.parse_args()
    export_psd(Path(args.psd), Path(args.output), args.variant)


if __name__ == "__main__":
    main()
