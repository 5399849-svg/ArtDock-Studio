"""Locate the original image in a Nano result; never modify either image."""
import argparse
import json
import cv2
import numpy as np

def read_gray(filename):
    image = cv2.imdecode(np.fromfile(filename, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError('图片无法解码')
    factor = min(1.0, 1500 / max(image.shape))
    return cv2.resize(image, None, fx=factor, fy=factor), image.shape, factor

def source_rect(source_shape, generated_shape, sf, gf, scales, offset):
    gx, gy = offset / gf
    physical_scale = np.asarray(scales) * sf / gf
    height, width = generated_shape
    rect = {'x':float(gx / width), 'y':float(gy / height), 'width':float(source_shape[1] * physical_scale[0] / width), 'height':float(source_shape[0] * physical_scale[1] / height)}
    if rect['x'] < -.02 or rect['y'] < -.02 or rect['x']+rect['width'] > 1.02 or rect['y']+rect['height'] > 1.02:
        raise ValueError('AI结果裁掉了部分原图，无法安全覆盖')
    return rect


def register_uniform(a, b, source, source_shape, generated_shape, sf, gf):
    matrix, mask = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=3.0, maxIters=5000)
    if matrix is None:
        raise ValueError('无法估计原图位置')
    inliers = mask.ravel().astype(bool)
    aa, bb = a[inliers], b[inliers]
    if len(aa) < 25 or len(aa) / len(a) < .30:
        raise ValueError('AI背景改变构图，无法可靠对齐')
    # Fit scale and translation only; rotating/skewing the protected source is forbidden.
    ac, bc = aa - aa.mean(axis=0), bb - bb.mean(axis=0)
    scale = float((ac * bc).sum() / (ac * ac).sum())
    offset = bb.mean(axis=0) - scale * aa.mean(axis=0)
    residual = np.linalg.norm(aa * scale + offset - bb, axis=1)
    coverage = np.ptp(aa, axis=0) / np.array([source.shape[1], source.shape[0]])
    if scale <= 0 or np.median(residual) > 2.5 or np.any(coverage < .40):
        raise ValueError('匹配偏差过大或仅匹配到局部主体')
    rect = source_rect(source_shape, generated_shape, sf, gf, [scale, scale], offset)
    return {'sourceRect':rect, 'inliers':len(aa), 'medianError':float(np.median(residual)), 'coverage':coverage.tolist(), 'method':'sift-scale-translation-v1'}


def register_axis_scale(a, b, source, source_shape, generated_shape, sf, gf):
    # Some model outputs stretch their X/Y axes by a few percent. A similarity
    # RANSAC then selects only one thin strip of an otherwise preserved image.
    # The full affine fit selects global correspondences ONLY. We never return
    # its rotation/shear or use it to warp the protected master.
    matrix, mask = cv2.estimateAffine2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=3.0, maxIters=5000)
    if matrix is None:
        raise ValueError('无法估计原图位置')
    diagonal = np.diag(matrix[:, :2])
    if np.any(diagonal <= 0) or max(abs(matrix[0, 1]), abs(matrix[1, 0])) / min(diagonal) > .02:
        raise ValueError('AI背景发生旋转或倾斜，无法安全对齐')
    inliers = mask.ravel().astype(bool)
    for _ in range(3):
        aa, bb = a[inliers], b[inliers]
        if len(aa) < 25 or len(aa) / len(a) < .30:
            raise ValueError('AI背景改变构图，无法可靠对齐')
        ac, bc = aa - aa.mean(axis=0), bb - bb.mean(axis=0)
        variance = (ac * ac).sum(axis=0)
        if np.any(variance <= 0):
            raise ValueError('仅匹配到局部主体，无法安全对齐')
        scales = (ac * bc).sum(axis=0) / variance
        offset = bb.mean(axis=0) - scales * aa.mean(axis=0)
        if np.any(scales <= 0) or max(scales) / min(scales) > 1.05:
            raise ValueError('AI背景横纵比例变化过大，无法安全对齐')
        # Re-check all matches against the axis-only model. Full affine inliers
        # that require rotation/shear cannot contribute to the final coverage.
        residual_all = np.linalg.norm(a * scales + offset - b, axis=1)
        refined = residual_all <= 3.0
        if np.array_equal(refined, inliers):
            break
        inliers = refined
    aa, bb = a[inliers], b[inliers]
    if len(aa) < 25 or len(aa) / len(a) < .30:
        raise ValueError('AI背景改变构图，无法可靠对齐')
    residual = np.linalg.norm(aa * scales + offset - bb, axis=1)
    coverage = np.ptp(aa, axis=0) / np.array([source.shape[1], source.shape[0]])
    if np.median(residual) > 2.5 or np.quantile(residual, .90) > 3.0 or np.any(coverage < .40):
        raise ValueError('匹配偏差过大或仅匹配到局部主体')
    rect = source_rect(source_shape, generated_shape, sf, gf, scales, offset)
    return {'sourceRect':rect, 'inliers':len(aa), 'medianError':float(np.median(residual)), 'p90Error':float(np.quantile(residual, .90)), 'coverage':coverage.tolist(), 'scaleX':float(scales[0] * sf / gf), 'scaleY':float(scales[1] * sf / gf), 'anisotropy':float(max(scales) / min(scales)), 'method':'sift-axis-scale-translation-v2'}


def register(source_path, generated_path, allow_axis_scale=False):
    source, source_shape, sf = read_gray(source_path)
    generated, generated_shape, gf = read_gray(generated_path)
    sift = cv2.SIFT_create(nfeatures=6000)
    sk, sd = sift.detectAndCompute(source, None)
    gk, gd = sift.detectAndCompute(generated, None)
    if sd is None or gd is None:
        raise ValueError('无法找到可对齐的原图特征')
    matches = cv2.BFMatcher().knnMatch(sd, gd, k=2)
    good = [pair[0] for pair in matches if len(pair) == 2 and pair[0].distance < .70 * pair[1].distance]
    if len(good) < 25:
        raise ValueError('原图与AI背景的可靠匹配点不足')
    a = np.float32([sk[m.queryIdx].pt for m in good])
    b = np.float32([gk[m.trainIdx].pt for m in good])
    try:
        return register_uniform(a, b, source, source_shape, generated_shape, sf, gf)
    except ValueError:
        if not allow_axis_scale:
            raise
    return register_axis_scale(a, b, source, source_shape, generated_shape, sf, gf)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--generated', required=True)
    parser.add_argument('--allow-axis-scale', action='store_true', help='Allow a globally verified, axis-aligned X/Y scale difference up to 5%%')
    args = parser.parse_args()
    print(json.dumps(register(args.source, args.generated, args.allow_axis_scale), ensure_ascii=False))
