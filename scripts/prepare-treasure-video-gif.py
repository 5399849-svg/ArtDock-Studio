"""Prepare real Canvas video pixels for the treasure advert's 640 x 400 GIF.

No API calls, production writes, optical-flow warping, or synthetic animation.
The output is deliberately reviewable even when the quality report rejects it.
"""

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


WIDTH, HEIGHT = 640, 400
FRAME_COUNT, FRAME_SECONDS = 32, 0.125


def build_alpha(mode: str, allow_face_motion: bool) -> tuple[np.ndarray, np.ndarray]:
    active = np.zeros((HEIGHT, WIDTH), np.uint8)
    face_protection = np.zeros((HEIGHT, WIDTH), np.uint8)
    # Flame and its immediate, already illuminated surroundings. Never the title.
    cv2.fillPoly(active, [np.array([
        (302, 291), (311, 275), (318, 257), (326, 249), (331, 230),
        (342, 244), (352, 251), (358, 268), (369, 280), (370, 296),
    ], np.int32)], 255)
    if mode == "subjects+fire":
        # Hat/clothing silhouettes; faces and hands are protected below by default.
        polygons = [
            [(75, 124), (109, 79), (167, 48), (202, 57), (246, 70),
             (258, 103), (234, 131), (218, 155), (126, 166)],
            [(111, 172), (150, 164), (203, 171), (239, 164), (270, 199),
             (271, 248), (253, 278), (119, 278), (106, 226)],
            [(420, 134), (424, 104), (471, 83), (520, 96), (533, 136),
             (555, 166), (576, 222), (559, 265), (530, 293),
             (423, 291), (391, 255), (386, 212), (406, 179)],
        ]
        for polygon in polygons:
            cv2.fillPoly(active, [np.array(polygon, np.int32)], 255)
        if not allow_face_motion:
            # Generous regions protect both character expressions and finger shapes.
            cv2.ellipse(face_protection, (177, 158), (51, 42), 0, 0, 360, 255, -1)
            cv2.ellipse(face_protection, (476, 166), (52, 39), 0, 0, 360, 255, -1)
            cv2.ellipse(face_protection, (231, 175), (28, 32), 0, 0, 360, 255, -1)
            cv2.ellipse(face_protection, (549, 167), (32, 36), 0, 0, 360, 255, -1)
            active[face_protection > 0] = 0
    alpha = cv2.GaussianBlur(active, (0, 0), sigmaX=2.0).astype(np.float32) / 255
    # Hard exclusions happen after feathering, so text/safe-zone pixels cannot leak.
    alpha[:44, :] = 0
    alpha[300:, :] = 0
    alpha[:, :40] = 0
    alpha[:, 600:] = 0
    alpha[face_protection > 0] = 0
    protected = alpha == 0
    return alpha[..., None], protected


def cover_frame(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    scale = max(WIDTH / width, HEIGHT / height)
    resized_width, resized_height = max(WIDTH, round(width * scale)), max(HEIGHT, round(height * scale))
    resized = cv2.resize(frame, (resized_width, resized_height), interpolation=cv2.INTER_AREA)
    left, top = (resized_width - WIDTH) // 2, (resized_height - HEIGHT) // 2
    return resized[top:top + HEIGHT, left:left + WIDTH].copy()


def read_at(capture: cv2.VideoCapture, seconds: float, fps: float, count: int) -> np.ndarray:
    index = min(count - 1, max(0, round(seconds * fps)))
    capture.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = capture.read()
    if not ok:
        raise ValueError(f"Cannot decode video frame {index}")
    return cover_frame(frame)


def estimate_translation(reference: np.ndarray, current: np.ndarray) -> dict:
    # Architecture above/between the characters should remain fixed. No alignment
    # is applied to the video: the estimate only detects an unsuitable moving camera.
    mask = np.zeros((HEIGHT, WIDTH), np.uint8)
    mask[44:88, 260:578] = 255
    mask[44:174, 292:408] = 255
    mask[44:160, 40:70] = 255
    mask[44:160, 580:600] = 255
    reference_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    current_gray = cv2.cvtColor(current, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    transform = np.eye(2, 3, dtype=np.float32)
    try:
        correlation, transform = cv2.findTransformECC(
            reference_gray, current_gray, transform, cv2.MOTION_TRANSLATION,
            (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 0.0001), mask, 5,
        )
        dx, dy = float(transform[0, 2]), float(transform[1, 2])
        return {"ok": True, "dx": round(dx, 3), "dy": round(dy, 3),
                "distance": round(math.hypot(dx, dy), 3), "correlation": round(correlation, 4)}
    except cv2.error:
        return {"ok": False, "reason": "ECC translation did not converge"}


def pixel_difference(first: np.ndarray, second: np.ndarray, region: np.ndarray) -> dict:
    difference = np.abs(first.astype(np.int16) - second.astype(np.int16))
    pixels = difference[region]
    if not pixels.size:
        return {"mean_absolute_difference": 0.0, "changed_pixels_over_15": 0}
    return {"mean_absolute_difference": round(float(pixels.mean()), 4),
            "changed_pixels_over_15": int((pixels.max(axis=1) > 15).sum())}


def prepare(still_path: Path, video_path: Path, output: Path, mode: str,
            allow_face_motion: bool, camera_limit: float) -> dict:
    still = cv2.imread(str(still_path), cv2.IMREAD_COLOR)
    if still is None or still.shape[:2] != (HEIGHT, WIDTH):
        raise ValueError("Original still must be exactly 640 x 400")
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError("Cannot open AI video")
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    video_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    video_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if fps <= 0 or count < 2 or video_height <= 0 or video_width <= 0:
        capture.release()
        raise ValueError("AI video metadata is invalid")
    duration = count / fps
    if duration < 3.9:
        capture.release()
        raise ValueError(f"Need approximately 4 seconds of real video; got {duration:.3f}s")
    output.mkdir(parents=True, exist_ok=True)
    frames_dir = output / "frames"
    frames_dir.mkdir(exist_ok=True)
    stale = list(frames_dir.glob("frame-*.png"))
    if stale:
        capture.release()
        raise ValueError("Output frames directory must be empty; use a new output directory")
    alpha, protected = build_alpha(mode, allow_face_motion)
    active = ~protected
    cv2.imwrite(str(frames_dir / "protected-mask.png"), protected.astype(np.uint8) * 255)
    cv2.imwrite(str(output / "motion-alpha.png"), np.rint(alpha[..., 0] * 255).astype(np.uint8))
    cv2.imwrite(str(output / "original.png"), still)
    first_video = read_at(capture, 0, fps, count)
    first_composite = None
    last_composite = None
    selected = {}
    translations = []
    frame_motion = []
    protected_changed = []
    try:
        for index in range(FRAME_COUNT):
            current = read_at(capture, index * FRAME_SECONDS, fps, count)
            estimate = estimate_translation(first_video, current)
            translations.append({"frame": index, **estimate})
            combined = np.rint(still.astype(np.float32) * (1 - alpha)
                               + current.astype(np.float32) * alpha).clip(0, 255).astype(np.uint8)
            combined[protected] = still[protected]
            protected_changed.append(int(np.any(combined[protected] != still[protected], axis=1).sum()))
            if first_composite is None:
                first_composite = combined.copy()
            last_composite = combined
            frame_motion.append({"frame": index,
                                 **pixel_difference(first_composite, combined, active)})
            cv2.imwrite(str(frames_dir / f"frame-{index:02d}.png"), combined)
            if index in (0, FRAME_COUNT // 2, FRAME_COUNT - 1):
                selected[index] = combined.copy()
        video_tail = read_at(capture, min(4, (count - 1) / fps), fps, count)
    finally:
        capture.release()
    sheet = Image.new("RGB", (WIDTH * 3, HEIGHT + 34), "#f2f3f7")
    draw = ImageDraw.Draw(sheet)
    for column, (index, frame) in enumerate(selected.items()):
        draw.text((column * WIDTH + 10, 10), f"frame {index:02d} / {index * FRAME_SECONDS:.3f}s", fill="#15213b")
        sheet.paste(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)), (column * WIDTH, 34))
    sheet.save(output / "contact-sheet.png")
    valid_translations = [entry for entry in translations if entry["ok"]]
    maximum_translation = max((entry["distance"] for entry in valid_translations), default=None)
    first_difference = pixel_difference(still, first_video, active)
    last_difference = pixel_difference(first_composite, last_composite, active)
    rejected = []
    warnings = []
    ratio_error = abs(math.log((video_width / video_height) / (WIDTH / HEIGHT)))
    if ratio_error > 0.06:
        rejected.append("video_aspect_ratio_requires_excessive_center_crop")
    if maximum_translation is not None and maximum_translation > camera_limit:
        rejected.append("global_camera_translation_exceeds_limit")
    if len(valid_translations) < FRAME_COUNT * 0.75:
        rejected.append("global_camera_stability_could_not_be_verified")
    if first_difference["mean_absolute_difference"] > 30:
        rejected.append("first_video_frame_differs_substantially_from_original")
    elif first_difference["mean_absolute_difference"] > 12:
        warnings.append("first_video_frame_has_visible_color_or_content_difference; no correction applied")
    if max(entry["changed_pixels_over_15"] for entry in frame_motion) == 0:
        rejected.append("no_perceptible_local_motion_detected")
    if last_difference["mean_absolute_difference"] > 12:
        warnings.append("loop_boundary_needs_visual_review; no reverse_playback_or_crossfade_applied")
    report = {
        "accepted_for_review": not rejected, "rejected_reasons": rejected, "warnings": warnings,
        "still": str(still_path.resolve()), "video": str(video_path.resolve()),
        "output": str(output.resolve()), "mask_mode": mode, "allow_face_motion": allow_face_motion,
        "width": WIDTH, "height": HEIGHT, "frames": FRAME_COUNT, "sample_fps": 8,
        "sample_interval_ms": 125, "gif_delays_ms": [120, 130] * 16, "duration_ms": 4000,
        "video_metadata": {"width": video_width, "height": video_height, "fps": fps,
                           "frames": count, "duration_seconds": round(duration, 4)},
        "geometry": {"method": "aspect-preserving center crop; no registration or warping",
                     "log_ratio_difference": round(ratio_error, 6)},
        "protected_regions": {"top_y": [0, 44], "title_y": [300, 400],
                              "left_x": [0, 40], "right_x": [600, 640],
                              "all_unmasked_pixels_static": True,
                              "max_changed_pixels_from_original": max(protected_changed)},
        "active_pixels_including_feather": int(active.sum()),
        "first_video_frame_vs_original_in_motion_area": first_difference,
        "first_composite_vs_last_composite_in_motion_area": last_difference,
        "first_video_vs_video_tail_in_motion_area": pixel_difference(first_video, video_tail, active),
        "max_camera_translation_px": maximum_translation, "camera_limit_px": camera_limit,
        "camera_translation_by_frame": translations, "local_motion_by_frame": frame_motion,
        "encoding_next_step": "node scripts/encode-treasure-video-gif.mjs FRAMES_DIR OUTPUT.gif",
    }
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("still", type=Path)
    parser.add_argument("video", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--mode", choices=("fire-only", "subjects+fire"), default="fire-only")
    parser.add_argument("--allow-face-motion", action="store_true")
    parser.add_argument("--camera-limit", type=float, default=2.0)
    options = parser.parse_args()
    result = prepare(options.still, options.video, options.output, options.mode,
                     options.allow_face_motion, options.camera_limit)
    print(json.dumps({key: result[key] for key in (
        "accepted_for_review", "rejected_reasons", "warnings", "output", "frames",
        "duration_ms", "max_camera_translation_px", "protected_regions")}, ensure_ascii=False))
