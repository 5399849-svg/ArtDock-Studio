"""Reuse model-video illumination on a static source; never copy model geometry."""
import math
import cv2
import numpy as np
from ad_scene_frames import render_scene_frames


def polygons_mask(polygons, shape):
    mask = np.zeros(shape, np.uint8)
    for polygon in polygons:
        points = np.asarray(polygon, dtype=np.float32)
        if points.ndim != 2 or points.shape[0] < 3 or points.shape[1] != 2 or not np.isfinite(points).all():
            raise ValueError('Invalid ambient protection polygon')
        cv2.fillPoly(mask, [np.rint(points).astype(np.int32)], 255)
    return mask


def render_native_effect_frames(still, video_frames, protected, permitted, options):
    """Keep real model effect changes inside explicit scene/subject boundaries."""
    height, width = still.shape[:2]
    if not options.get('effectPolygons') or not options.get('protectedPolygons'):
        raise ValueError('原生局部动效需要明确角色保护区与效果区域')
    allowed = ((permitted > 0) & (protected == 0)).astype(np.uint8)*255
    alpha = cv2.GaussianBlur(allowed, (0, 0), 2.2).astype(np.float32)/255
    alpha[(permitted == 0) | (protected > 0)] = 0
    alpha[alpha < .025] = 0
    active = alpha > 0
    if active.sum() < max(24, width*height*.002) or active.mean() > .2:
        raise ValueError('原生动效区域过小或过大，需要检查角色保护与局部光效范围')
    stack = np.stack(video_frames).astype(np.float32)
    window = min(4, len(video_frames))
    scores = [float(np.abs(stack[start+window-1]-stack[start])[active].mean()) for start in range(len(video_frames)-window+1)]
    start = int(np.argmax(scores))
    delta = stack[start:start+window]-stack[start]
    prepared = []
    for index in range(10):
        position = (1-math.cos(2*math.pi*index/10))*.5*(window-1)
        lower = int(math.floor(position)); upper = min(window-1, lower+1)
        change = delta[lower]*(1-(position-lower))+delta[upper]*(position-lower)
        change = np.clip(change, -32, 64)*alpha[..., None]
        image = np.rint(still.astype(np.float32)+change).clip(0, 255).astype(np.uint8)
        image[~active] = still[~active]
        prepared.append(image)
    differences = [np.abs(frame.astype(np.int16)-still.astype(np.int16)) for frame in prepared]
    visible = max(int((change.max(axis=2) > 12).sum()) for change in differences)
    peak = max(float(change[active].mean()) for change in differences)
    if visible < max(24, width*height*.002) or peak < 3:
        raise ValueError('新视频局部变化仍不够清楚，已保留原生视频，可在不重新生成的情况下调整取段')
    difference = lambda a, b: float(np.abs(a.astype(np.float32)-b.astype(np.float32))[active].mean())
    report = {
        'width': width, 'height': height, 'frames': 10, 'durationMs': 1000,
        'motionStyle': 'native-local-effects', 'method': 'native-video-protected-local-effects-v3',
        'motionFraction': round(float(active.mean()), 4), 'ambientPixels': int(active.sum()),
        'protectedSubjectPolygons': len(options['protectedPolygons']), 'subjectsFrozen': True,
        'nativeEffectsPreserved': True, 'geometryFrozenOutsideEffects': True,
        'maxPixelLightDelta': max(int(change.max()) for change in differences),
        'nativeVisiblePixels': visible, 'nativeSegmentStartMs': start*125,
        'nativeSegmentDurationMs': (window-1)*125, 'loopMethod': 'native-effects-eased-forward-reverse',
        'loopSeamMeanDifference': round(difference(prepared[-1], prepared[0]), 3),
        'medianFrameDifference': round(float(np.median([difference(prepared[i-1], prepared[i]) for i in range(1, 10)])), 3),
        'peakAmbientMeanDifference': round(peak, 3), 'accepted': True,
    }
    return prepared, (~active).astype(np.uint8)*255, allowed, report


def render_ambient_frames(still, video_frames, protected, options):
    if options.get('mode') == 'whole-image-zoom':
        return render_whole_zoom_frames(still, video_frames, protected, options)
    height, width = still.shape[:2]
    protected = protected.copy()
    subjects = polygons_mask(options.get('protectedPolygons', []), (height, width))
    if subjects.any():
        subjects = cv2.dilate(subjects, np.ones((9, 9), np.uint8))
        protected[subjects > 0] = 255
    for x, y, w, h in options.get('protectedRectangles', []):
        x, y, w, h = [round(value) for value in (x, y, w, h)]
        protected[max(0, y):min(height, y+h), max(0, x):min(width, x+w)] = 255
    permitted = np.full((height, width), 255, np.uint8)
    if options.get('effectPolygons'):
        permitted = polygons_mask(options['effectPolygons'], (height, width))
    if options.get('mode') == 'scene-adaptive':
        return render_scene_frames(still, video_frames, protected, permitted, options)
    if options.get('mode') == 'native-local-effects':
        return render_native_effect_frames(still, video_frames, protected, permitted, options)
    hsv = cv2.cvtColor(still, cv2.COLOR_BGR2HSV)
    hue, saturation, value = cv2.split(hsv)
    cool = (hue >= 78) & (hue <= 112) & (saturation > 40) & (value > 145)
    violet = (hue >= 125) & (hue <= 165) & (saturation > 90) & (value > 165)
    warm = (hue >= 12) & (hue <= 38) & (saturation > 90) & (value > 185)
    colored = (cool | violet | warm).astype(np.uint8) * 255
    # Include a narrow pale halo around an existing colored emission, not a new
    # floating light or a generic full-frame sparkle overlay.
    near_color = cv2.dilate(colored, np.ones((5, 5), np.uint8)) > 0
    emission = (colored > 0) | ((value > 242) & near_color)
    luma = np.stack([cv2.GaussianBlur(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 3) for frame in video_frames])
    temporal = np.percentile(luma, 90, axis=0) - np.percentile(luma, 10, axis=0)
    active = (emission & (temporal > .7) & (permitted > 0) & (protected == 0)).astype(np.uint8) * 255
    count, labels, stats, _ = cv2.connectedComponentsWithStats(active)
    selected = np.zeros_like(active)
    for label in range(1, count):
        area = stats[label, cv2.CC_STAT_AREA]
        # Reject tiny compression speckles and broad uniform skies/clothing.
        if 12 <= area <= width*height*.12:
            selected[labels == label] = 255
    selected = cv2.dilate(selected, np.ones((3, 3), np.uint8))
    selected[(protected > 0) | (permitted == 0)] = 0
    if options.get('limitAmbientArea'):
        count, labels, stats, _ = cv2.connectedComponentsWithStats(selected)
        compact = np.zeros_like(selected)
        budget, used = int(width*height*.10), 0
        for label in sorted(range(1, count), key=lambda label: stats[label, cv2.CC_STAT_AREA], reverse=True):
            area = int(stats[label, cv2.CC_STAT_AREA])
            if area <= budget and used < 2:
                compact[labels == label] = 255
                budget -= area
                used += 1
        selected = compact
    alpha = cv2.GaussianBlur(selected, (0, 0), 1.5).astype(np.float32)/255
    alpha[(protected > 0) | (permitted == 0)] = 0
    alpha[alpha < .025] = 0
    active = alpha > 0
    if int(active.sum()) < max(24, width*height*.0003):
        raise ValueError('原图与可灵视频中没有可用的局部光效，已保留视频；不会添加通用星光或放大角色动作')
    if active.mean() > .3:
        raise ValueError('环境微光区域过大，需要限定局部光效；已保留视频')
    # Less than half a second of native illumination is eased forward and back
    # over one second. A long action sequence is never sped up to fit the GIF.
    window = min(4, len(video_frames))
    scores = [float(np.abs(luma[start+window-1]-luma[start])[active].mean()) for start in range(len(video_frames)-window+1)]
    start = int(np.argmax(scores))
    segment = luma[start:start+window]
    native_delta = segment-segment[0]
    normalization = max(2, float(np.percentile(np.abs(native_delta[:, active]), 90)))
    amplitude = min(32, max(2, float(options.get('maxLightDelta', 28))))
    prepared = []
    for index in range(10):
        position = (1-math.cos(2*math.pi*index/10))*.5*(window-1)
        lower = int(math.floor(position)); upper = min(window-1, lower+1)
        delta = native_delta[lower]*(1-(position-lower))+native_delta[upper]*(position-lower)
        delta = np.clip(delta/normalization*amplitude, -amplitude, amplitude)*alpha
        image = np.rint(still.astype(np.float32)+delta[..., None]).clip(0, 255).astype(np.uint8)
        image[~active] = still[~active]
        prepared.append(image)
    static = (~active).astype(np.uint8)*255
    difference = lambda a, b: float(np.abs(a.astype(np.float32)-b.astype(np.float32))[active].mean())
    peak = max(float(np.abs(frame.astype(np.float32)-still)[active].mean()) for frame in prepared)
    if peak < .7:
        raise ValueError('视频中的局部光照变化不足，已保留视频；不会放大主体动作来冒充动效')
    report = {
        'width': width, 'height': height, 'frames': 10, 'durationMs': 1000,
        'motionStyle': 'ambient-light-only', 'method': 'native-video-ambient-static-art-v2',
        'motionFraction': round(float(active.mean()), 4), 'ambientPixels': int(active.sum()),
        'protectedSubjectPolygons': len(options.get('protectedPolygons', [])),
        'geometryFrozen': True, 'maxPixelLightDelta': max(int(np.abs(frame.astype(np.int16)-still.astype(np.int16)).max()) for frame in prepared),
        'nativeSegmentStartMs': start*125, 'nativeSegmentDurationMs': (window-1)*125,
        'loopMethod': 'native-light-eased-forward-reverse',
        'loopSeamMeanDifference': round(difference(prepared[-1], prepared[0]), 3),
        'medianFrameDifference': round(float(np.median([difference(prepared[i-1], prepared[i]) for i in range(1, 10)])), 3),
        'peakAmbientMeanDifference': round(peak, 3), 'accepted': True,
    }
    return prepared, static, selected, report


def existing_sparkle_layers(still, protected, options):
    """Find painted cross-shaped golden flares, excluding hair, text and subjects."""
    height, width = still.shape[:2]
    hsv = cv2.cvtColor(still, cv2.COLOR_BGR2HSV)
    white = ((still.min(axis=2) > 225) & (hsv[:, :, 1] < 55)).astype(np.uint8)*255
    count, labels, stats, centers = cv2.connectedComponentsWithStats(white)
    blocked = protected.copy()
    subjects = polygons_mask(options.get('protectedPolygons', []), (height, width))
    blocked[subjects > 0] = 255
    for x, y, w, h in options.get('protectedRectangles', []):
        x, y, w, h = [round(value) for value in (x, y, w, h)]
        blocked[max(0,y):min(height,y+h), max(0,x):min(width,x+w)] = 255
    found = []
    for label in range(1, count):
        x, y, w, h, area = [int(value) for value in stats[label]]
        minimum, maximum = max(6, round(min(width,height)*.02)), max(24, round(min(width,height)*.23))
        if min(w,h) < minimum or max(w,h) > maximum or area < 12 or not .55 <= w/h <= 1.8:
            continue
        shape = labels[y:y+h, x:x+w] == label
        if not .15 <= area/(w*h) <= .52:
            continue
        row, column = int(shape.sum(axis=1).argmax()), int(shape.sum(axis=0).argmax())
        if not (.30 <= row/h <= .65 and .30 <= column/w <= .70):
            continue
        if float((blocked[y:y+h,x:x+w][shape] > 0).mean()) > .20:
            continue
        pad = max(4, round(min(width,height)*.02))
        x0, y0, x1, y1 = max(0,x-pad), max(0,y-pad), min(width,x+w+pad), min(height,y+h+pad)
        nearby = hsv[y0:y1,x0:x1]
        warm = (nearby[:,:,0] >= 8) & (nearby[:,:,0] <= 40) & (nearby[:,:,1] > 80) & (nearby[:,:,2] > 150)
        if float(warm.mean()) < .18:
            continue
        core = (labels == label).astype(np.uint8)*255
        repair = cv2.dilate(core, np.ones((5,5),np.uint8))
        underlay = cv2.inpaint(still, repair, 3, cv2.INPAINT_TELEA).astype(np.float32)
        gold = np.median(still[y0:y1,x0:x1][warm],axis=0).astype(np.float32)
        # Fade the original white flare towards its existing warm surroundings.
        # No new sparkle geometry, particles or moving occluders are introduced.
        underlay = underlay*.3+gold*.7
        alpha = cv2.GaussianBlur(cv2.dilate(core,np.ones((3,3),np.uint8)),(0,0),1.2).astype(np.float32)/255
        alpha[core > 0] = 1
        alpha[(blocked > 0) | (alpha < .025)] = 0
        delta = (underlay-still.astype(np.float32))*alpha[:,:,None]
        found.append({'center': [round(float(value),2) for value in centers[label]],
                      'bounds': [x,y,w,h], 'delta': delta, 'core': (core > 0) & (blocked == 0)})
    return sorted(found,key=lambda entry: entry['center'][0])[:8]


def render_whole_zoom_frames(still, video_frames, protected, options):
    """Move the original artwork as one rigid canvas; model geometry never enters it."""
    height, width = still.shape[:2]
    light_options = {**options, 'mode': 'ambient-light-only', 'limitAmbientArea': True, 'maxLightDelta': 16}
    try:
        local, _, _, light_report = render_ambient_frames(still, video_frames, protected, light_options)
        native_light_applied, light_note = True, ''
    except ValueError as error:
        # Whole-image zoom is the requested effect. The absence of a small native
        # light region must not reject an otherwise valid rigid camera loop.
        local, light_report = [still]*10, {}
        native_light_applied, light_note = False, str(error)
    samples = [0, 0, 2, 3, 5, 5, 5, 3, 2, 0]
    maximum = float(options.get('scaleMax', 1.05))
    if not 1.02 <= maximum <= 1.05:
        raise ValueError('整图缩放幅度必须在 2% 至 5% 之间')
    sparkles = existing_sparkle_layers(still, protected, options) if options.get('sparkleFlicker', True) else []
    sparkle_report = []
    for star, layer in enumerate(sparkles):
        phase = math.pi/6+2*math.pi*star/max(1,len(sparkles))
        opacity = [.22+.78*((1+math.cos(2*math.pi*index/9-phase))*.5)**1.5 for index in range(10)]
        layer['opacity'] = opacity
        sparkle_report.append({'center':layer['center'],'bounds':layer['bounds'],
                               'opacityByFrame':[round(value,3) for value in opacity],
                               'phase':round(phase,3),'corePixels':int(layer['core'].sum())})
    prepared, scales = [], []
    for index, sample in enumerate(samples):
        scale = 1+(maximum-1)*(1-math.cos(2*math.pi*sample/10))*.5
        target_width, target_height = round(width*scale), round(height*scale)
        artwork = local[sample].astype(np.float32)
        for layer in sparkles:
            artwork += layer['delta']*(1-layer['opacity'][index])
        artwork = np.rint(artwork).clip(0,255).astype(np.uint8)
        enlarged = cv2.resize(artwork, (target_width, target_height), interpolation=cv2.INTER_LINEAR)
        left, top = (target_width-width)//2, (target_height-height)//2
        prepared.append(enlarged[top:top+height, left:left+width].copy())
        scales.append({'frame': index, 'sampleIndex': sample, 'scale': scale, 'width': target_width,
                       'height': target_height, 'cropLeft': left, 'cropTop': top})
    visible = int((np.abs(prepared[5].astype(np.int16)-prepared[0].astype(np.int16)).max(axis=2) > 12).sum())
    if visible < max(24, width*height*.02):
        raise ValueError('整图缩放变化不足，请检查原画内容')
    report = {
        'width': width, 'height': height, 'frames': 10, 'durationMs': 1000,
        'motionStyle': 'whole-image-zoom', 'method': 'native-light-whole-image-zoom-sparkles-v2',
        'scaleMin': 1, 'scaleMax': maximum, 'scales': scales, 'rigidWholeImageScale': True,
        'modelGeometryCopied': False, 'nativeLightApplied': native_light_applied,
        'nativeLightNote': light_note, 'nativeLightPixels': light_report.get('ambientPixels', 0),
        'maxNativeLightDelta': light_report.get('maxPixelLightDelta', 0),
        'sparkleFlickerApplied': bool(sparkles), 'existingSparkleCount': len(sparkles),
        'sparkles': sparkle_report, 'sparklesAnchoredToArtwork': True,
        'sparklePhaseOffset': True, 'newSparklesAdded': False,
        'visiblyChangedPixels': visible, 'loopMethod': 'eased-zoom-in-out-with-endpoint-holds',
        'loopSeamMeanDifference': 0, 'accepted': True,
    }
    return prepared, np.zeros((height, width), np.uint8), np.full((height, width), 255, np.uint8), report
