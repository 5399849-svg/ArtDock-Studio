"""Merge independent subject masks while preserving every RGB pixel from the KV.

The protection ellipses raise existing character pixels to full face/head
opacity. They never turn an unrelated transparent background pixel opaque.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--existing", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--protection", type=Path, required=True)
    parser.add_argument("--candidate-limit-y", type=int)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = np.asarray(Image.open(args.source).convert("RGB"))
    existing = np.asarray(Image.open(args.existing).convert("RGBA"))
    candidate = np.asarray(Image.open(args.candidate).convert("RGBA"))
    if existing.shape[:2] != source.shape[:2] or candidate.shape[:2] != source.shape[:2]:
        raise ValueError("Both masks must align to original KV dimensions")
    # SAM2 can include a nearby decorative object as part of a costume.
    # Add only pixels close to the already reviewed subject silhouette.
    neighborhood = cv2.dilate(
        (existing[:, :, 3] > 12).astype(np.uint8),
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61)),
    ) > 0
    candidate_alpha = np.where(neighborhood, candidate[:, :, 3], 0)
    if args.candidate_limit_y is not None:
        candidate_alpha[args.candidate_limit_y :, :] = 0
    alpha = np.maximum(existing[:, :, 3], candidate_alpha).astype(np.float32)
    gate = np.maximum(existing[:, :, 3], candidate_alpha) > 12
    objects = json.loads(args.protection.read_text(encoding="utf-8-sig"))["regions"]
    face_report = []
    for item in objects:
        mask = np.zeros(alpha.shape, dtype=np.uint8)
        cx, cy = item["center"]
        rx, ry = item["radius"]
        cv2.ellipse(mask, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, 255, -1)
        softness = max(3, int(item.get("softness", 8)))
        mask = cv2.GaussianBlur(mask, (0, 0), softness).astype(np.float32) / 255
        floor = float(item.get("minAlpha", 250))
        alpha = np.maximum(alpha, floor * mask * gate)
        face_report.append({"name": item.get("name", "region"), "centerAlpha": int(alpha[int(cy), int(cx)])})
    rgba = np.dstack((source, np.clip(alpha, 0, 255).astype(np.uint8)))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(args.output, optimize=True)
    print(json.dumps({"output": str(args.output), "size": list(source.shape[:2][::-1]), "regions": face_report}, ensure_ascii=False))


if __name__ == "__main__":
    main()
