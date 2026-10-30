"""Create a contact sheet and report motion in protected regions of a Canvas video."""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


PROTECTED = {
    "left_people": (8, 70, 152, 222),
    "center_people": (116, 107, 443, 331),
    "right_person": (452, 71, 543, 196),
    "luggage": (0, 266, 133, 373),
    "picnic_props": (169, 266, 429, 385),
    "basket": (440, 271, 558, 368),
}


def run(video_path: Path, output_path: Path):
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError("Cannot read video")
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = capture.get(cv2.CAP_PROP_FPS)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    indexes = sorted(set(round((count - 1) * portion) for portion in (0, .25, .5, .75, 1)))
    frames = []
    for index in indexes:
        capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = capture.read()
        if not ok:
            raise ValueError(f"Cannot read frame {index}")
        frames.append(cv2.cvtColor(cv2.resize(frame, (640, 400)), cv2.COLOR_BGR2RGB))
    capture.release()
    sheet = Image.new("RGB", (640 * 3, 440 * 2), "white")
    draw = ImageDraw.Draw(sheet)
    for number, (index, frame) in enumerate(zip(indexes, frames)):
        x = number % 3 * 640
        y = number // 3 * 440
        sheet.paste(Image.fromarray(frame), (x, y + 28))
        draw.text((x + 8, y + 6), f"frame {index} / {index / fps:.2f}s", fill="black")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path)
    first = frames[0].astype(np.int16)
    middle = frames[len(frames) // 2].astype(np.int16)
    report = {
        "video": str(video_path), "width": width, "height": height,
        "frames": count, "fps": round(fps, 2),
        "protected_region_mean_absolute_pixel_change": {
            name: round(float(np.abs(first[y1:y2, x1:x2] - middle[y1:y2, x1:x2]).mean()), 2)
            for name, (x1, y1, x2, y2) in PROTECTED.items()
        },
    }
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("sheet", type=Path)
    args = parser.parse_args()
    run(args.video, args.sheet)
