"""Combine native Canvas video frames in people-free edge zones; no image warping."""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


def frame_at(capture, seconds, fps):
    capture.set(cv2.CAP_PROP_POS_FRAMES, round(seconds * fps))
    ok, frame = capture.read()
    if not ok:
        raise ValueError(f"Cannot read frame at {seconds}s")
    return cv2.resize(frame, (640, 400), interpolation=cv2.INTER_AREA).astype(np.float32)


def smoothstep(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def edge_alpha():
    y, x = np.mgrid[0:400, 0:640].astype(np.float32)
    willow = smoothstep((105 - x) / 35) * smoothstep((80 - y) / 25)
    grass = smoothstep((160 - x) / 45) * smoothstep((y - 358) / 18)
    right_flower = smoothstep((x - 490) / 25) * smoothstep((y - 220) / 30)
    return np.maximum(willow, grass)[..., None], right_flower[..., None]


def run(base_video: Path, edge_video: Path, output: Path, contact: Path, frame_count: int = 8):
    base = cv2.VideoCapture(str(base_video))
    edge = cv2.VideoCapture(str(edge_video))
    if not base.isOpened() or not edge.isOpened():
        raise ValueError("Cannot read Canvas video")
    base_fps = base.get(cv2.CAP_PROP_FPS)
    edge_fps = edge.get(cv2.CAP_PROP_FPS)
    base_first = frame_at(base, 0, base_fps)
    edge_first = frame_at(edge, 0, edge_fps)
    correction = base_first - edge_first
    left_alpha, right_alpha = edge_alpha()
    if frame_count < 2 or frame_count > 40:
        raise ValueError("Frame count must be between 2 and 40")
    frame_interval = 4 / frame_count
    output.mkdir(parents=True, exist_ok=True)
    columns = 4
    rows = (frame_count + columns - 1) // columns
    sheet = Image.new("RGB", (640 * columns, 430 * rows), "white")
    draw = ImageDraw.Draw(sheet)
    for index in range(frame_count):
        base_time = index * frame_interval
        source_time = min(base_time, 4 - base_time)
        base_frame = frame_at(base, base_time, base_fps)
        edge_frame = np.clip(frame_at(edge, source_time, edge_fps) + correction, 0, 255)
        # Hold every pixel outside the three plant zones to the same native video frame.
        # This prevents video compression noise and GIF palette changes from flickering
        # on people, props, architecture, or text.
        combined = base_first * (1 - right_alpha) + base_frame * right_alpha
        combined = np.clip(combined * (1 - left_alpha) + edge_frame * left_alpha, 0, 255).astype(np.uint8)
        target = output / f"frame-{index:02d}.png"
        cv2.imwrite(str(target), combined)
        x, y = (index % columns) * 640, (index // columns) * 430
        sheet.paste(Image.fromarray(cv2.cvtColor(combined, cv2.COLOR_BGR2RGB)), (x, y + 25))
        draw.text((x + 8, y + 6), f"frame {index}", fill="black")
    sheet.save(contact)
    base.release()
    edge.release()
    print(json.dumps({"frames": frame_count, "size": "640x400", "output": str(output), "contact": str(contact)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("base_video", type=Path)
    parser.add_argument("edge_video", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("contact_sheet", type=Path)
    parser.add_argument("--frames", type=int, default=8)
    args = parser.parse_args()
    run(args.base_video, args.edge_video, args.output_dir, args.contact_sheet, args.frames)
