"""Refine an existing local segmentation mask; never generate or change RGB."""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    for key in ('input', 'mask', 'prompts', 'output'):
        parser.add_argument('--' + key, type=Path, required=True)
    parser.add_argument('--keep-accessories', action='store_true')
    args = parser.parse_args()
    original = Image.open(args.input).convert('RGB')
    rgba = Image.open(args.mask).convert('RGBA')
    if rgba.size != original.size:
        raise ValueError('Mask dimensions do not match the source')
    ratio = min(1., 1600 / max(original.size))
    size = (round(original.width * ratio), round(original.height * ratio))
    rgb = np.array(original.resize(size, Image.Resampling.LANCZOS))
    alpha = np.array(rgba.getchannel('A').resize(size, Image.Resampling.LANCZOS))
    binary = (alpha > 64).astype(np.uint8)
    # Only mend tiny mask pinholes. Large enclosed spaces between hair, limbs
    # and props are background, not damage to be filled unconditionally.
    filled = binary.copy()
    count, labels, stats, _ = cv2.connectedComponentsWithStats(1 - binary, 8)
    for label in range(1, count):
        x, y, width, height, area = stats[label]
        if area <= 48 and x > 0 and y > 0 and x + width < size[0] and y + height < size[1]:
            filled[labels == label] = 1
    outer = cv2.dilate(filled, np.ones((9, 9), np.uint8)) > 0
    # Color similarity must never grow a yellow costume into an entire yellow
    # building. GrabCut is permitted to change only this narrow edge band.
    mask = np.full(binary.shape, cv2.GC_BGD, dtype=np.uint8)
    mask[outer] = cv2.GC_PR_BGD
    mask[filled > 0] = cv2.GC_PR_FGD
    mask[cv2.erode(filled, np.ones((3, 3), np.uint8)) > 0] = cv2.GC_FGD
    objects = json.loads(args.prompts.read_text(encoding='utf-8-sig'))['objects']
    box = [round(n * ratio) for n in objects[0]['box']]
    x1, y1, x2, y2 = box
    mask[:y1] = cv2.GC_BGD
    mask[y2:] = cv2.GC_BGD
    mask[:, :x1] = cv2.GC_BGD
    mask[:, x2:] = cv2.GC_BGD
    seen = set()
    for obj in objects:
        for point, label in zip(obj['points'], obj['labels']):
            x, y = (round(n * ratio) for n in point)
            key = (x, y, label)
            if key in seen:
                continue
            seen.add(key)
            cv2.circle(mask, (x, y), 3, cv2.GC_FGD if label else cv2.GC_BGD, -1)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, None,
                np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
                4, cv2.GC_INIT_WITH_MASK)
    result = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    result[:y1] = 0
    result[y2:] = 0
    result[:, :x1] = 0
    result[:, x2:] = 0
    count, components, statistics, _ = cv2.connectedComponentsWithStats(result, 8)
    keep = set()
    if count > 1:
        keep.add(1 + int(np.argmax(statistics[1:, cv2.CC_STAT_AREA])))
    for x, y, label in seen:
        if label and 0 <= y < result.shape[0] and 0 <= x < result.shape[1]:
            keep.add(int(components[y, x]))
    keep.discard(0)
    if args.keep_accessories:
        # Jewelry can be disconnected by a few pixels, but a second person's
        # hand or a distant pillar must never be kept just because SAM saw it.
        near=cv2.dilate(np.isin(components,list(keep)).astype(np.uint8),np.ones((13,13),np.uint8))>0
        for label in range(1,count):
            component=components==label;area=int(statistics[label,cv2.CC_STAT_AREA])
            if area>=8 and np.any(near[component]) and int(np.count_nonzero(binary[component]))>=area*.25:keep.add(label)
    result[~np.isin(components, list(keep))] = 0
    result = cv2.GaussianBlur(result, (3, 3), .55)
    final = original.convert('RGBA')
    final.putalpha(Image.fromarray(result).resize(original.size, Image.Resampling.LANCZOS))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    final.save(args.output, optimize=True)
    print(json.dumps({'method': 'source-rgb-mask-refinement-v1', 'pixels': int((result > 32).sum())}))


if __name__ == '__main__':
    main()
