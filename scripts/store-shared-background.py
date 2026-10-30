from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser(description="Recover a detailed common background from store pages 2-6.")
    parser.add_argument("--sources", nargs=5, type=Path, required=True)
    parser.add_argument("--layer-dirs", nargs=5, type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    images = [np.array(Image.open(path).convert("RGB")) for path in args.sources]
    height, width = images[0].shape[:2]
    if any(image.shape[:2] != (height, width) for image in images):
        raise ValueError("第2至第6张源图尺寸必须一致才能恢复共享背景")
    removals = []
    for directory in args.layer_dirs:
        union = np.zeros((height, width), np.uint8)
        for name in ("01-character.png", "02-copy.png", "03-screenshot.png", "04-logo.png"):
            rgba = np.array(Image.open(directory / name).convert("RGBA"))
            union = cv2.max(union, rgba[:, :, 3])
        union = cv2.dilate(np.where(union > 8, 255, 0).astype(np.uint8), np.ones((9, 9), np.uint8))
        removals.append(union)

    stack = np.stack(images).astype(np.float32)
    valid = np.stack([mask < 8 for mask in removals])
    masked = np.where(valid[:, :, :, None], stack, np.nan)
    with np.errstate(all="ignore"):
        recovered = np.nanmedian(masked, axis=0)
    missing = np.all(~valid, axis=0)
    fallback = np.median(stack, axis=0)
    recovered = np.where(np.isnan(recovered), fallback, recovered).astype(np.uint8)

    # Only pixels hidden by foreground on all five pages are locally repaired.
    # Common decorative detail outside that area remains byte-derived from JPGs.
    if np.any(missing):
        bgr = cv2.cvtColor(recovered, cv2.COLOR_RGB2BGR)
        missing_mask = cv2.dilate(missing.astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
        scale = min(1.0, 960 / max(width, height))
        size = (max(1, round(width * scale)), max(1, round(height * scale)))
        small = cv2.resize(bgr, size, interpolation=cv2.INTER_AREA)
        small_mask = cv2.resize(missing_mask, size, interpolation=cv2.INTER_NEAREST)
        repaired = cv2.inpaint(small, small_mask, 7, cv2.INPAINT_TELEA)
        repaired = cv2.resize(repaired, (width, height), interpolation=cv2.INTER_CUBIC)
        blend = cv2.GaussianBlur(missing_mask, (0, 0), 3.0).astype(np.float32)[:, :, None] / 255
        bgr = np.clip(bgr * (1 - blend) + repaired * blend, 0, 255).astype(np.uint8)
        recovered = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(recovered, "RGB").save(args.output, quality=96, subsampling=0)
    print(str(args.output.resolve()))


if __name__ == "__main__":
    main()
