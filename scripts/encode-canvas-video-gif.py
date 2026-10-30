"""Encode actual Canvas video frames without warping or masking the artwork."""

import argparse
import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import cv2


def encode(video_path: Path, output_path: Path):
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError("Cannot read Canvas video")
    fps = capture.get(cv2.CAP_PROP_FPS)
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = count / fps
    if fps <= 0 or count < 2:
        raise ValueError("Canvas video is too short")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        for samples in (12, 10, 8, 6):
            with TemporaryDirectory(prefix="canvas-video-frames-") as temporary:
                folder = Path(temporary)
                for number in range(samples):
                    index = min(count - 1, round(number * count / samples))
                    capture.set(cv2.CAP_PROP_POS_FRAMES, index)
                    ok, frame = capture.read()
                    if not ok:
                        raise ValueError(f"Cannot read video frame {index}")
                    frame = cv2.resize(frame, (640, 400), interpolation=cv2.INTER_AREA)
                    cv2.imwrite(str(folder / f"frame-{number:02d}.png"), frame)
                delay = round(duration * 1000 / samples)
                process = subprocess.run(
                    ["node", str(Path(__file__).with_name("encode-ad-motion-gif.mjs")),
                     str(folder), str(output_path), str(delay)],
                    capture_output=True, text=True,
                )
                if process.returncode == 0:
                    capture.release()
                    return {"samples": samples, "duration_seconds": round(duration, 2),
                            **json.loads(process.stdout)}
                if "exceeds the 700KB" not in process.stderr:
                    raise RuntimeError(process.stderr)
    finally:
        capture.release()
    raise ValueError("Direct Canvas video exceeds the 700KB GIF limit even at 6 frames")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("gif", type=Path)
    args = parser.parse_args()
    print(json.dumps(encode(args.video, args.gif), ensure_ascii=False))
