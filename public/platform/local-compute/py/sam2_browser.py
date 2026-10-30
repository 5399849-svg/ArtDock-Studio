"""Browser version of scripts/sam2-character-cutout.py (same arguments, outputs and
stdout).  SAM2.1 hiera-small runs in onnxruntime-web on the user's GPU; image
preparation, mask post-processing and composition are the same as the original.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import wb_bridge

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
SIZE = 1024


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a pixel-preserving union cutout from SAM2 prompts.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--prompts", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--separate-output", type=Path)
    parser.add_argument("--max-side", type=int, default=1600)
    parser.add_argument("--device", choices=['auto', 'cpu', 'cuda'], default='auto')
    args = parser.parse_args()

    source_image = Image.open(args.input).convert("RGB")
    ratio = min(1.0, max(512, args.max_side) / max(source_image.size))
    image = source_image.resize((round(source_image.width * ratio), round(source_image.height * ratio)), Image.Resampling.LANCZOS) if ratio < 1 else source_image
    objects = json.loads(args.prompts.read_text(encoding="utf-8-sig"))["objects"]
    objects = [{**item, "points": [item["points"]] if item["points"] and isinstance(item["points"][0], (int, float)) else item["points"]} for item in objects]
    if ratio < 1:
        objects = [{**item, "box": [round(value * ratio) for value in item["box"]], "points": [[round(value * ratio) for value in point] for point in item["points"]]} for item in objects]
        for item in objects:
            if 'bodyPoints' in item: item['bodyPoints'] = [[round(v * ratio) for v in p] for p in item['bodyPoints']]
            item['accessoryPaths'] = [{**p, 'from': [v * ratio for v in p['from']], 'to': [v * ratio for v in p['to']], 'radius': p['radius'] * ratio} for p in item.get('accessoryPaths', [])]

    width, height = image.size
    # Sam2ImageProcessor: bilinear resize to 1024×1024, rescale 1/255, ImageNet normalisation.
    pixels = np.asarray(image.resize((SIZE, SIZE), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0
    pixel_values = ((pixels - MEAN) / STD).transpose(2, 0, 1)[None].astype(np.float32)
    embeddings = wb_bridge.onnx_run('sam2-encoder', {'pixel_values': pixel_values}, {
        'image_embeddings.0': (1, 32, 256, 256), 'image_embeddings.1': (1, 64, 128, 128), 'image_embeddings.2': (1, 256, 64, 64)})
    scale_x, scale_y = SIZE / width, SIZE / height

    def predict(item, points, labels):
        # Same prompt as the video model's first frame: one object per run, the box as two corner
        # points (labels 2, 3) before the clicks, coordinates on the 1024 grid, single-mask output.
        # Models: public/platform/models/sam2.1-hiera-small (exported from local-ai/models/sam2.1-hiera-small).
        x0, y0, x1, y1 = item['box']
        coords = [[x0 * scale_x, y0 * scale_y], [x1 * scale_x, y1 * scale_y], *[[x * scale_x, y * scale_y] for x, y in points]]
        point_labels = [2, 3, *labels]
        result = wb_bridge.onnx_run('sam2-decoder', {
            'input_points': np.array(coords, np.float32).reshape(1, 1, -1, 2),
            'input_labels': np.array(point_labels, np.int32).reshape(1, 1, -1),
            'image_embeddings.0': embeddings.ref('image_embeddings.0'),
            'image_embeddings.1': embeddings.ref('image_embeddings.1'),
            'image_embeddings.2': embeddings.ref('image_embeddings.2'),
        }, {'pred_masks': (1, 1, 256, 256), 'iou_scores': (1, 1, 1)})
        scores = result['iou_scores'][0, 0]
        candidate = 0
        low = result['pred_masks'][0, 0].astype(np.float32)
        # post_process_masks: bilinear to the padded 1024 square, then to the image size; binarise at 0.
        full = cv2.resize(cv2.resize(low, (SIZE, SIZE), interpolation=cv2.INTER_LINEAR), (width, height), interpolation=cv2.INTER_LINEAR)
        return full > 0, candidate, float(scores[candidate])

    union = np.zeros((height, width), dtype=bool)
    selected = []
    for index, item in enumerate(objects):
        mask, candidate, score = predict(item, item['points'], item['labels'])
        if item.get('accessoryPaths'):
            body, _, _ = predict(item, item['bodyPoints'], item['bodyLabels'])
            corridor = Image.new('L', image.size)
            draw = ImageDraw.Draw(corridor)
            for p in item['accessoryPaths']:
                draw.line([tuple(p['from']), tuple(p['to'])], fill=255, width=max(1, round(p['radius'] * 2)))
            mask = np.logical_or(body, np.logical_and(mask, np.asarray(corridor) > 0))
        union |= mask
        if args.separate_output:
            args.separate_output.mkdir(parents=True, exist_ok=True)
            alpha = Image.fromarray(mask.astype(np.uint8) * 255, 'L')
            if ratio < 1: alpha = alpha.resize(source_image.size, Image.Resampling.LANCZOS)
            individual = source_image.convert('RGBA')
            individual.putalpha(alpha.filter(ImageFilter.GaussianBlur(.65)))
            individual.save(args.separate_output / f'{index}.png', optimize=True)
        selected.append({"name": item.get("name", str(index + 1)), "candidate": candidate, "score": score, "pixels": int(mask.sum())})
    rgba = source_image.convert("RGBA")
    alpha = Image.fromarray(union.astype(np.uint8) * 255, "L")
    if ratio < 1:
        alpha = alpha.resize(source_image.size, Image.Resampling.LANCZOS)
    alpha = alpha.filter(ImageFilter.GaussianBlur(.65))
    rgba.putalpha(alpha)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(args.output, optimize=True)
    ys, xs = np.where(union)
    bounds = None if not len(xs) else {"x": int(xs.min() / ratio), "y": int(ys.min() / ratio), "width": int((xs.max() - xs.min() + 1) / ratio), "height": int((ys.max() - ys.min() + 1) / ratio)}
    print(json.dumps({"device": "browser", "modelClass": "Sam2VideoModel (onnxruntime-web)", "bounds": bounds, "selected": selected}, ensure_ascii=False))


if __name__ == "__main__":
    main()
