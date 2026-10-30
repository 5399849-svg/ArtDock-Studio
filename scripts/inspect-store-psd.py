import argparse
import json
import sys
from pathlib import Path


def layer_record(layer, depth=0):
    bbox = getattr(layer, "bbox", None)
    item = {
        "depth": depth,
        "name": layer.name,
        "kind": layer.kind,
        "visible": layer.is_visible(),
        "bbox": list(bbox) if bbox else None,
        "children": [],
    }
    if layer.is_group():
        item["children"] = [layer_record(child, depth + 1) for child in layer]
    return item


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("psd")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    from psd_tools import PSDImage

    psd = PSDImage.open(args.psd)
    data = {
        "file": str(Path(args.psd)),
        "width": psd.width,
        "height": psd.height,
        "layers": [layer_record(layer) for layer in psd],
    }
    Path(args.output).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
