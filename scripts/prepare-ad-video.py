"""Decode model illumination; keep original geometry and typography stationary."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from ad_ambient_frames import render_ambient_frames
from ad_full_scene_frames import render_full_scene_frames


def read_image(file):
    result = cv2.imdecode(np.fromfile(str(file), np.uint8), cv2.IMREAD_COLOR)
    if result is None:
        raise ValueError(f'Cannot read {file}')
    return result


def save_image(file, image):
    cv2.imencode('.png', image)[1].tofile(str(file))


def prepare(still_file, video_file, output, options):
    still = read_image(still_file)
    height, width = still.shape[:2]
    capture = cv2.VideoCapture(str(video_file))
    fps, count = capture.get(cv2.CAP_PROP_FPS), int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if not capture.isOpened() or fps <= 0 or count < 12:
        raise ValueError('Cannot decode a complete model video')
    duration = count / fps
    if duration < 3.7:
        raise ValueError('Model video is shorter than the required four-second loop')
    playback_rate = min(1,max(.25,float(options.get('playbackRate',1))))
    scene_mode = options.get('mode') in ('scene-adaptive', 'full-scene')
    sample_fps = round(10/playback_rate) if scene_mode else 8
    sample_count = sample_fps*4 if scene_mode else 32
    options = {**options, 'nativeSampleFps': sample_fps}
    frames = []
    for index in range(sample_count):
        capture.set(cv2.CAP_PROP_POS_FRAMES, min(count - 1, round(index * fps / sample_fps)))
        ok, frame = capture.read()
        if not ok:
            raise ValueError(f'Cannot decode frame {index}')
        fh, fw = frame.shape[:2]
        scale = max(width / fw, height / fh)
        frame = cv2.resize(frame, (max(width, round(fw * scale)), max(height, round(fh * scale))), interpolation=cv2.INTER_AREA)
        top, left = (frame.shape[0] - height) // 2, (frame.shape[1] - width) // 2
        frames.append(frame[top:top + height, left:left + width].copy())
    capture.release()
    if options.get('mode') == 'full-scene':
        prepared, report = render_full_scene_frames(still, frames, options)
        # Full video frames bypass OCR freezes, face masks, safe-inset freezes,
        # illumination extraction and every other legacy cut-out operation.
        for index, image in enumerate(prepared):
            save_image(output / f'frame-{index:02}.png', image)
        save_image(output / 'contact.png', np.concatenate([
            np.concatenate(prepared[i:i+5], axis=1) for i in range(0, 10, 5)], axis=0))
        report.update({'nativeVideoDuration':duration, 'accepted':True})
        (output / 'prepare-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return report
    protected = np.zeros((height, width), np.uint8)
    inset = min(int(options.get('safeInsetX', 0)), width // 3)
    if inset and options.get('freezeSafeInset',True):
        protected[:, :inset] = 255
        protected[:, width - inset:] = 255
    valid_words = []
    for word in options.get('words', []):
        # Ignore isolated OCR punctuation and implausibly large false positives.
        x, y, w, h = [round(word.get(k, 0)) for k in ('x', 'y', 'width', 'height')]
        if h < 5 or w < 3 or h > height * .3:
            continue
        valid_words.append((x, y, w, h))
        pad = max(3, round(h * .18))
        protected[max(0, y-pad):min(height, y+h+pad), max(0, x-pad):min(width, x+w+pad)] = 255
    # Merge words on the same line, covering characters missed between recognised
    # words as well. Original pixels include the outline and the spaces.
    lines = []
    for box in sorted(valid_words, key=lambda value: value[1]):
        x, y, w, h = box
        line = next((row for row in lines if abs((y+h/2)-row['cy']) < max(h, row['height'])*.45), None)
        if line is None:
            line = {'cy': y+h/2, 'height': h, 'words': []}; lines.append(line)
        line['words'].append(box)
    for line in lines:
        boxes = line['words']
        if len(boxes) < 2:
            continue
        x0, y0 = max(0, min(b[0] for b in boxes)-4), max(0, min(b[1] for b in boxes)-4)
        x1, y1 = min(width, max(b[0]+b[2] for b in boxes)+4), min(height, max(b[1]+b[3] for b in boxes)+4)
        protected[y0:y1, x0:x1] = 255
    # Recognise broad outlined HUD panels near the right edge and top status bars.
    # These are rigid UI, so native video jitter must not animate their geometry.
    edges = cv2.Canny(still, 70, 150)
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    ui_rectangles = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        right_panel = x > width*.65 and w > width*.16 and h > height*.3
        top_bar = y < height*.22 and w > width*.28 and w/max(1,h) > 3.5 and height*.04 < h < height*.2
        if not (right_panel or top_bar) or cv2.contourArea(contour)/(w*h) < .5:
            continue
        polygon = cv2.approxPolyDP(contour, .02*cv2.arcLength(contour, True), True)
        if not 4 <= len(polygon) <= 12:
            continue
        protected[max(0,y-3):min(height,y+h+3), max(0,x-3):min(width,x+w+3)] = 255
        ui_rectangles.append([x, y, w, h])
    try:
        prepared, static, moving, report = render_ambient_frames(still, frames, protected, options)
    except ValueError as error:
        report = {'accepted': False, 'error': str(error), 'method': 'native-video-ambient-static-art-v2'}
        (output / 'prepare-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        raise
    report.update({'nativeVideoDuration': duration, 'protectedWords': len(valid_words),
                   'protectedUiRectangles': ui_rectangles, 'safeInsetX': inset,
                   'safeInsetPixelsFrozen':bool(inset and options.get('freezeSafeInset',True))})
    save_image(output / 'protected-mask.png', static)
    save_image(output / 'native-motion-mask.png', moving)
    for index, image in enumerate(prepared):
        save_image(output / f'frame-{index:02}.png', image)
    contact = np.concatenate([np.concatenate(prepared[i:i+5], axis=1) for i in range(0, 10, 5)], axis=0)
    save_image(output / 'contact.png', contact)
    report['accepted'] = True
    (output / 'prepare-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('still'); parser.add_argument('video'); parser.add_argument('output'); parser.add_argument('options')
    args = parser.parse_args()
    target = Path(args.output); target.mkdir(parents=True, exist_ok=True)
    print(json.dumps(prepare(Path(args.still), Path(args.video), target, json.loads(Path(args.options).read_text(encoding='utf-8'))), ensure_ascii=False))
