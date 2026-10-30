"""Keep a short, local, scene-specific segment from Kling; never add a camera loop."""
import math
import cv2
import numpy as np
from pathlib import Path


def subject_guards(still, protected):
    """Supplement explicit/OCR masks with local face and skin-region guards."""
    height, width = still.shape[:2]
    result = protected.copy()
    gray = cv2.cvtColor(still, cv2.COLOR_BGR2GRAY)
    faces = []
    # OpenCV's Windows filename API cannot open the workspace's Chinese path.
    # Load the installed local classifier from bytes rather than a filename.
    detector = cv2.CascadeClassifier()
    cascade = Path(cv2.data.haarcascades) / 'haarcascade_frontalface_alt2.xml'
    if cascade.exists():
        storage = cv2.FileStorage(cascade.read_text(encoding='utf-8'),cv2.FILE_STORAGE_READ|cv2.FILE_STORAGE_MEMORY)
        detector.read(storage.getFirstTopLevelNode())
        storage.release()
    if not detector.empty():
        for x, y, w, h in detector.detectMultiScale(gray, 1.08, 3, minSize=(24, 24)):
            pad = max(4, round(w * .12))
            result[max(0,y-pad):min(height,y+h+pad), max(0,x-pad):min(width,x+w+pad)] = 255
            faces.append([int(x), int(y), int(w), int(h)])
    hsv = cv2.cvtColor(still, cv2.COLOR_BGR2HSV)
    ycc = cv2.cvtColor(still, cv2.COLOR_BGR2YCrCb)
    skin = ((hsv[:,:,0] < 28) & (hsv[:,:,1] > 18) & (hsv[:,:,1] < 195)
            & (hsv[:,:,2] > 65) & (ycc[:,:,1] > 132) & (ycc[:,:,2] < 140)).astype(np.uint8)*255
    skin = cv2.morphologyEx(skin, cv2.MORPH_CLOSE, np.ones((3,3),np.uint8))
    contours, _ = cv2.findContours(skin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        x,y,w,h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)
        if 18 <= area <= width*height*.10 and .35 < w/max(1,h) < 2.8:
            guard = np.zeros_like(result)
            cv2.fillConvexPoly(guard, cv2.convexHull(contour), 255)
            result[cv2.dilate(guard, np.ones((5,5),np.uint8)) > 0] = 255
    # Ornate red-outline/gold-fill Chinese word art is often missed by OCR.
    # Protect coherent horizontal title groups, not all warm-colored objects.
    red = (((hsv[:,:,0] < 10) | (hsv[:,:,0] > 175)) & (hsv[:,:,1] > 100) & (hsv[:,:,2] > 120))
    gold = ((hsv[:,:,0] >= 10) & (hsv[:,:,0] <= 40) & (hsv[:,:,1] > 50) & (hsv[:,:,2] > 160)).astype(np.uint8)
    outlined = (red & (cv2.dilate(gold,np.ones((5,5),np.uint8)) > 0)).astype(np.uint8)*255
    outlined = cv2.morphologyEx(outlined,cv2.MORPH_CLOSE,np.ones((9,17),np.uint8))
    titles = []
    contours,_ = cv2.findContours(outlined,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        x,y,w,h = cv2.boundingRect(contour)
        if w > width*.15 and h > height*.04 and w/max(h,1) > 1.25 and cv2.contourArea(contour) > width*height*.001:
            pad = max(4,round(height*.012))
            result[max(0,y-pad):min(height,y+h+pad),max(0,x-pad):min(width,x+w+pad)] = 255
            titles.append([int(x),int(y),int(w),int(h)])
    return result, faces, titles


def aligned_frames(still, frames):
    """Remove incidental provider camera drift, not local environmental motion."""
    gray = cv2.cvtColor(still, cv2.COLOR_BGR2GRAY)
    points = cv2.goodFeaturesToTrack(gray, 500, .02, 7)
    registered, shifts = [], []
    height, width = gray.shape
    for frame in frames:
        aligned = frame
        if points is not None and len(points) >= 12:
            target, status, error = cv2.calcOpticalFlowPyrLK(gray, cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), points, None)
            if target is not None:
                valid = (status.ravel() > 0) & (error.ravel() < 35)
                if valid.sum() >= 10:
                    matrix, inliers = cv2.estimateAffinePartial2D(points[valid], target[valid], method=cv2.RANSAC, ransacReprojThreshold=1.2)
                    if matrix is not None and inliers.sum() >= 8:
                        scale = math.hypot(matrix[0,0],matrix[0,1])
                        shift = math.hypot(matrix[0,2],matrix[1,2])
                        if not .97 <= scale <= 1.03 or shift > width*.035:
                            raise ValueError('可灵镜头位移过大，已保留视频；不会以整图缩放代替场景动效')
                        aligned = cv2.warpAffine(frame, cv2.invertAffineTransform(matrix), (width,height), borderMode=cv2.BORDER_REFLECT_101)
                        shifts.append({'scale':round(scale,5),'translationPx':round(shift,3)})
        registered.append(aligned)
    return np.stack(registered).astype(np.float32), shifts


def render_scene_frames(still, video_frames, protected, permitted, options):
    height, width = still.shape[:2]
    protected, faces, titles = subject_guards(still, protected)
    stack, registration = aligned_frames(still, video_frames)
    # Whole-frame exposure/color drift is never an environmental effect.
    offset = np.median((stack-stack[0]).reshape(len(stack),-1,3), axis=1)
    stack = np.clip(stack-offset[:,None,None,:],0,255)
    temporal_range = np.percentile(stack,90,axis=0)-np.percentile(stack,10,axis=0)
    # Include the starting footprint as well as the later path. Otherwise an
    # initially visible petal is left frozen behind its moving replacement.
    from_input = np.percentile(np.abs(stack-stack[0]),95,axis=0)
    temporal = np.max(np.maximum(temporal_range,from_input),axis=2)
    allowed = (protected == 0) & (permitted > 0)
    candidate = ((temporal > 4) & allowed).astype(np.uint8)*255
    if np.mean(candidate > 0) > .45:
        raise ValueError('视频变化遍布画面，无法保留安稳的局部动效；原视频已保留')
    candidate = cv2.morphologyEx(candidate,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    candidate[~allowed] = 0
    count,labels,stats,_ = cv2.connectedComponentsWithStats(candidate)
    limit = min(.20,max(.025,float(options.get('maxMotionFraction',.14))))
    budget = int(width*height*limit)
    components = []
    for label in range(1,count):
        area = int(stats[label,cv2.CC_STAT_AREA])
        if max(8,width*height*.00003) <= area <= budget:
            strength = float(temporal[labels == label].mean())*math.sqrt(area)
            components.append((strength,label,area))
    selected = np.zeros((height,width),np.uint8)
    selected_count = 0
    for _,label,area in sorted(components,reverse=True):
        if area > budget or selected_count >= 4:
            continue
        selected[labels == label] = 255
        budget -= area
        selected_count += 1
    if options.get('effectPolygons'):
        # A reviewed object region must retain its whole trajectory. Ranking
        # disconnected bright fragments is not a substitute for the named object.
        selected = candidate.copy()
    selected = cv2.dilate(selected,np.ones((3,3),np.uint8))
    alpha = cv2.GaussianBlur(selected,(0,0),1).astype(np.float32)/255
    alpha[~allowed] = 0
    alpha[alpha < .035] = 0
    active = alpha > 0
    if active.sum() < max(24,width*height*.0002):
        raise ValueError('可灵没有产生可用的场景局部动效，已保留视频；不会退回整图缩放或通用星光')
    sample_fps = float(options.get('nativeSampleFps',8))
    playback_rate = min(1,max(.25,float(options.get('playbackRate',1))))
    window = min(round(sample_fps*playback_rate)+1,len(stack))
    scores = []
    for begin in range(len(stack)-window+1):
        motion = float(np.abs(stack[begin+window-1]-stack[begin])[active].mean())
        scores.append(motion)
    start = int(np.argmax(scores)) if options.get('nativeStartMs') is None else min(len(stack)-window,max(0,round(float(options['nativeStartMs'])*sample_fps/1000)))
    # Always reference the video's first frame, which corresponds to the input
    # artwork. Subtracting a later segment's first frame leaves old petals behind.
    segment = stack[start:start+window]-stack[0]
    native = []
    for index in range(10):
        position = index*(window-1)/10
        low = int(math.floor(position)); high = min(window-1,low+1)
        delta = segment[low]*(1-(position-low))+segment[high]*(position-low)
        # Full RGB movement is needed to erase an old petal and reveal its new
        # position. Capping every channel at 56 turns the movement into ghosting.
        image = np.rint(still.astype(np.float32)+delta*alpha[:,:,None]).clip(0,255).astype(np.uint8)
        image[~active] = still[~active]
        native.append(image)
    prepared = [frame.copy() for frame in native]
    # Preserve chronological motion; dissolve only the final 300 ms into the
    # starting pose instead of reversing the whole action back through time.
    for index,weight in [(7,.15),(8,.55),(9,1.0)]:
        prepared[index] = np.rint(native[index].astype(np.float32)*(1-weight)+native[0].astype(np.float32)*weight).clip(0,255).astype(np.uint8)
        prepared[index][~active] = still[~active]
    changes = [np.abs(frame.astype(np.int16)-still.astype(np.int16)) for frame in prepared]
    visible = max(int((change.max(axis=2)>12).sum()) for change in changes)
    peak = max(float(change[active].mean()) for change in changes)
    if visible < max(24,width*height*.0002) or peak < 1:
        raise ValueError('当前视频局部动作仍不清楚，已保留视频供重新取段；不会自动放大整张画面')
    report = {
        'width':width,'height':height,'frames':10,'durationMs':1000,
        'motionStyle':'scene-adaptive','method':'native-video-scene-preserved-v2',
        'scenePlan':options.get('scenePlan',{}),'cameraLocked':True,'rigidWholeImageScale':False,
        'nativeEffectsPreserved':True,'geometryFrozenOutsideEffects':True,
        'motionFraction':round(float(active.mean()),4),'ambientPixels':int(active.sum()),
        'protectedFaces':faces,'protectedStylizedTitles':titles,'subjectGuardPixels':int((protected>0).sum()),
        'nativeVisiblePixels':visible,'nativeSegmentStartMs':round(start*1000/sample_fps),
        'nativeSegmentDurationMs':round((window-1)*1000/sample_fps),'peakAmbientMeanDifference':round(peak,3),
        'maxPixelLightDelta':max(int(change.max()) for change in changes),
        'loopMethod':'native-chronological-motion-tail-dissolve','loopSeamMeanDifference':0,
        'nativeChronologyPreserved':True,'loopBlendFrames':[7,8,9],
        'playbackRate':playback_rate,'nativeStartingFootprintRemoved':True,
        'registration':registration,'newSparklesAdded':False,'accepted':True,
    }
    return prepared,(~active).astype(np.uint8)*255,selected,report
