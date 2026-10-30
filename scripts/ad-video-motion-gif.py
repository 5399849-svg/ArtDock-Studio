"""Transfer Canvas video motion into selected plants while preserving the source art."""

import argparse
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

import cv2
import numpy as np
from PIL import Image


def plant_mask(width: int, height: int) -> np.ndarray:
    mask = np.zeros((height, width), np.uint8)
    # Tight regions around the willow, bottom-left grass, and right-side flowers.
    polygons = [
        [(0, 0), (.18, 0), (.16, .14), (.13, .23), (0, .25)],
        [(0, .72), (.20, .73), (.27, .88), (.23, 1), (0, 1)],
        [(.89, .53), (1, .51), (1, 1), (.81, 1), (.84, .82)],
    ]
    for polygon in polygons:
        points = np.array([(round(x * width), round(y * height)) for x, y in polygon], np.int32)
        cv2.fillPoly(mask, [points], 255)
    return cv2.GaussianBlur(mask, (0, 0), sigmaX=7).astype(np.float32) / 255


def read_frame(capture: cv2.VideoCapture, index: int, width: int, height: int) -> np.ndarray:
    capture.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = capture.read()
    if not ok:
        raise ValueError(f"Cannot decode Canvas video frame {index}")
    return cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)


def make_gif(still_path: Path, video_path: Path, output_path: Path, frames_dir: Path | None = None) -> dict:
    still = cv2.imread(str(still_path), cv2.IMREAD_COLOR)
    if still is None:
        raise ValueError("Cannot read original still")
    height, width = still.shape[:2]
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError("Cannot open Canvas video")
    fps = capture.get(cv2.CAP_PROP_FPS)
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if fps <= 0 or count < 20:
        raise ValueError("Canvas video is too short")
    reference = read_frame(capture, 0, width, height)
    reference_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    alpha = plant_mask(width, height)[..., None]
    grid_x, grid_y = np.meshgrid(np.arange(width, dtype=np.float32), np.arange(height, dtype=np.float32))
    times = [0, .5, 1, 1.5, 2, 1.5, 1, .5]
    images = []
    motion_amounts = []
    for second in times:
        index = min(count - 1, round(second * fps))
        if index == 0:
            frame = still.copy()
            motion_amounts.append(0.0)
        else:
            current = read_frame(capture, index, width, height)
            flow = cv2.calcOpticalFlowFarneback(
                cv2.cvtColor(current, cv2.COLOR_BGR2GRAY), reference_gray,
                None, .5, 3, 19, 3, 5, 1.2, 0,
            )
            flow = cv2.GaussianBlur(flow, (0, 0), sigmaX=1.8)
            flow = np.clip(flow * .58, -3.0, 3.0)
            motion_amounts.append(float(np.mean(np.linalg.norm(flow, axis=2)[alpha[..., 0] > .5])))
            moved = cv2.remap(still, grid_x + flow[..., 0], grid_y + flow[..., 1], cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_REFLECT_101)
            frame = np.rint(still * (1 - alpha) + moved * alpha).clip(0, 255).astype(np.uint8)
        images.append(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)))
    capture.release()
    def save_frames(folder: Path) -> None:
        folder.mkdir(parents=True, exist_ok=True)
        for index, image in enumerate(images):
            image.save(folder / f"frame-{index:02d}.png")

    result = {"width": width, "height": height, "frames": len(images),
              "plant_motion_px": round(max(motion_amounts), 2)}
    if frames_dir:
        save_frames(frames_dir)
        return result
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="ad-video-motion-") as temporary:
        folder = Path(temporary)
        save_frames(folder)
        command = ["node", str(Path(__file__).with_name("encode-ad-motion-gif.mjs")), str(folder), str(output_path)]
        completed = subprocess.run(command, capture_output=True, text=True, check=True)
        return {**result, **json.loads(completed.stdout)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("still", type=Path)
    parser.add_argument("video", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--frames-dir", type=Path)
    options = parser.parse_args()
    print(json.dumps(make_gif(options.still, options.video, options.output, options.frames_dir), ensure_ascii=False))
