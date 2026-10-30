"""Retain complete model frames. Never restore rectangular/subject source patches."""
from pathlib import Path
import cv2
import numpy as np


def render_full_scene_frames(still, frames, options):
    if len(frames) < 13:
        raise ValueError('完整场景视频帧不足，不能制作自然循环')
    fps = float(options.get('nativeSampleFps', 10))
    rate = min(1., max(.25, float(options.get('playbackRate', 1))))
    overlap = 3
    span = 10 + overlap
    explicit = options.get('nativeStartMs')
    if explicit is not None:
        start = max(0, min(len(frames)-span, round(float(explicit)*fps/1000)))
    else:
        # Choose a quiet continuous window, rather than accelerating the whole
        # four-second video. No spatial mask or original-pixel restoration.
        choices = []
        for candidate in range(len(frames)-span+1):
            segment = np.asarray(frames[candidate:candidate+span], dtype=np.float32)
            movement = np.abs(segment[1:] - segment[:-1]).mean()
            if movement < .08:
                continue
            closure = np.abs(segment[-overlap:] - segment[:overlap]).mean()
            deviation = np.abs(segment[0] - still.astype(np.float32)).mean()
            choices.append((closure/(movement+.1) + deviation*.015, candidate))
        if not choices:
            raise ValueError('完整场景视频没有可辨认的微动；保留视频供复查，不套用缩放或补丁')
        start = min(choices)[1]
    segment = frames[start:start+span]
    output = []
    for index in range(10):
        image = segment[index].copy()
        if index < overlap:
            # A uniform temporal dissolve connects the ends. Its scalar weight
            # applies to the entire frame, so it cannot create cut-out borders.
            weight = index / overlap
            image = cv2.addWeighted(segment[index+10], 1-weight, image, weight, 0)
        output.append(image)
    overlay_file = options.get('nativeOverlayFile')
    overlay = None
    if overlay_file:
        overlay = cv2.imdecode(np.fromfile(str(Path(overlay_file)), np.uint8), cv2.IMREAD_UNCHANGED)
        if overlay is None or overlay.shape != (*still.shape[:2], 4):
            raise ValueError('原生透明文案层尺寸或格式不正确')
        alpha = overlay[:, :, 3:4].astype(np.float32)/255
        if not np.any(alpha == 0) or not np.any(alpha > 0):
            raise ValueError('文案必须是真正透明的独立图层，不能使用矩形原图覆盖')
        for i, image in enumerate(output):
            output[i] = np.rint(image*(1-alpha)+overlay[:, :, :3]*alpha).astype(np.uint8)
    changes = [np.abs(image.astype(np.int16)-output[0].astype(np.int16)) for image in output]
    visible = max(int(np.count_nonzero(change.max(axis=2)>5)) for change in changes)
    if visible < max(24, still.shape[0]*still.shape[1]*.0005):
        raise ValueError('完整场景循环变化不足，需复查原视频')
    return output, {
        'method':'native-full-scene-transparent-type-v1',
        'motionStyle':'full-scene', 'fullFrameVideo':True,
        'sourcePatchesApplied':False, 'spatialMotionMasksApplied':False,
        'nativeTypographyOverlay':overlay is not None,
        'nativeStartMs':round(start/fps*1000),
        'nativeSegmentDurationMs':round((span-1)/fps*1000),
        'playbackRate':rate, 'nativeChronologyPreserved':True,
        'loopMethod':'whole-frame-temporal-overlap', 'loopOverlapFrames':overlap,
        'frames':10, 'durationMs':1000, 'delayMs':100, 'loop':0,
        'visiblyChangedPixels':visible, 'visualReviewRequired':True,
    }
