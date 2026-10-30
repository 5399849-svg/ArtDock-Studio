"""Composite a candidate with the preview layers in a Huawei PSD template."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage


def layer_named(group, name):
    for layer in group:
        if layer.name == name:
            return layer
    raise ValueError(f"PSD 缺少预览图层：{name}")


def rendered(layer, size):
    return layer.composite(viewport=(0, 0, *size)).convert("RGBA")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("template", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    psd = PSDImage.open(args.template)
    with Image.open(args.candidate) as source:
        if source.size != psd.size:
            raise ValueError(f"候选图尺寸 {source.size} 与 PSD {psd.size} 不一致")
        scene = source.convert("RGBA")

    names = {layer.name for layer in psd}
    if "手机端预览效果" in names:
        # The PSD's white phone viewport is a replacement area, while the dark
        # outside pixels are its native scene mask. Remove only the white fill.
        frame = np.array(rendered(layer_named(psd, "手机端预览效果"), psd.size))
        brightness = frame[:, :, :3].astype(np.float32).mean(axis=2)
        keep = np.clip((240 - brightness) / 205, 0, 1)
        frame[:, :, 3] = np.rint(frame[:, :, 3] * keep).astype(np.uint8)
        scene.alpha_composite(Image.fromarray(frame, "RGBA"))
        info = layer_named(psd, "预览信息")
        scene.alpha_composite(rendered(info, psd.size))
    elif "游戏信息 示意" in names:
        info = layer_named(psd, "游戏信息 示意")
        scene.alpha_composite(rendered(info, psd.size))
    else:
        raise ValueError("该 PSD 尚未识别出可用的场景预览图层")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    scene.convert("RGB").save(args.output, format="JPEG", quality=90, subsampling=0)
    print(f"{args.output} {psd.width}x{psd.height}")


if __name__ == "__main__":
    main()
