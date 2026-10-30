"""Remove only the baked white copy from the two original Huawei banner drafts."""

from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/runtime/channel-analysis/0922-test"

for number, height, box in [(3, 422, (41, 95, 267, 273)), (4, 576, (42, 164, 272, 337))]:
    filename = f"HW0922-0{number}-984x{height}-candidate.jpg"
    original = cv2.imdecode(np.fromfile(BASE / "candidates-v1" / filename, dtype=np.uint8), cv2.IMREAD_COLOR)
    generated = cv2.imdecode(np.fromfile(BASE / f"clean-text-0{number}-generated.png", dtype=np.uint8), cv2.IMREAD_COLOR)
    if original is None or generated is None:
        raise RuntimeError(f"Missing artwork for {number}")
    generated = cv2.resize(generated, (984, height), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(original, cv2.COLOR_BGR2HSV)
    x0, y0, x1, y1 = box
    roi = hsv[y0:y1, x0:x1]
    mask = np.zeros((height, 984), dtype=np.uint8)
    mask[y0:y1, x0:x1] = 255
    mask = cv2.GaussianBlur(mask, (0, 0), 12)
    alpha = (mask.astype(np.float32) / 255.0)[:, :, None]
    composite = np.clip(original * (1 - alpha) + generated * alpha, 0, 255).astype(np.uint8)
    cv2.imencode(".png", composite)[1].tofile(BASE / f"clean-background-0{number}.png")
    cv2.imencode(".png", mask)[1].tofile(BASE / f"clean-mask-0{number}.png")
