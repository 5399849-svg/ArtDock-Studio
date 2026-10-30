"""Restore a design's sampled source palette without generating or moving pixels.

Regions are explicit artwork coordinates, not inferred faces. Only the selected
skin and garment colours are adopted; the original pixels outside these masks
(including lettering, brand artwork and the background) remain byte-identical.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def read_rgb(file):
    data = cv2.imdecode(np.fromfile(file, np.uint8), cv2.IMREAD_COLOR)
    if data is None:
        raise ValueError(f"Cannot decode {file}")
    return cv2.cvtColor(data, cv2.COLOR_BGR2RGB)


def region_mask(shape, polygons, coordinate_size, feather=0):
    height, width = shape[:2]
    sx, sy = width / coordinate_size[0], height / coordinate_size[1]
    mask = np.zeros((height, width), np.uint8)
    for points in polygons:
        points = np.rint(np.array(points) * [sx, sy]).astype(np.int32)
        cv2.fillPoly(mask, [points], 255)
    if feather:
        mask = cv2.GaussianBlur(mask, (0, 0), feather * sx)
    return mask.astype(np.float32) / 255


def ramp(value, low, high):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def skin_weight(lab, hsv):
    return (ramp(lab[:, :, 0], 45, 57) * ramp(lab[:, :, 1], 3, 7)
            * (1 - ramp(lab[:, :, 1], 31, 40))
            * ramp(lab[:, :, 2], -2, 2) * (1 - ramp(lab[:, :, 2], 25, 32))
            * ramp(hsv[:, :, 1], .04, .1) * (1 - ramp(hsv[:, :, 1], .5, .65)))


def cloth_weight(hsv):
    return (ramp(hsv[:, :, 0], 212, 227) * (1 - ramp(hsv[:, :, 0], 293, 308))
            * ramp(hsv[:, :, 1], .18, .28) * ramp(hsv[:, :, 2], .32, .46))


def quantile_map(values, sampled, reference, limit):
    if len(sampled) < 200 or len(reference) < 200:
        raise ValueError('Not enough source-colour samples for reliable calibration')
    quantiles = np.linspace(.02, .98, 33)
    before = np.quantile(sampled, quantiles)
    desired = np.quantile(reference, quantiles)
    keep = np.r_[True, np.diff(before) > 1e-5]
    delta = np.clip(desired[keep] - before[keep], -limit, limit)
    return values + np.interp(values, before[keep], delta).astype(np.float32)


def calibrate(reference_rgb, candidate_rgb, regions):
    reference = reference_rgb.astype(np.float32) / 255
    image = candidate_rgb.astype(np.float32) / 255
    ref_lab = cv2.cvtColor(reference, cv2.COLOR_RGB2LAB)
    ref_hsv = cv2.cvtColor(reference, cv2.COLOR_RGB2HSV)
    lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
    hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
    ref_face = region_mask(reference.shape, regions['referenceFace'], regions['referenceSize'])
    ref_cloth = region_mask(reference.shape, regions['referenceCloth'], regions['referenceSize'])
    face = region_mask(image.shape, regions['sampleFace'], regions['coordinateSize'])
    skin_regions = region_mask(image.shape, regions['skin'], regions['coordinateSize'], 2)
    garment = region_mask(image.shape, regions['cloth'], regions['coordinateSize'], 2)
    skin_colour = skin_weight(lab, hsv)
    ref_skin_colour = skin_weight(ref_lab, ref_hsv)
    face_samples = (face * skin_colour) > .85
    ref_face_samples = (ref_face * ref_skin_colour) > .85
    skin_alpha = skin_regions * skin_colour
    corrected_lab = lab.copy()
    # Chroma only: keep the existing luminance, brush texture and lighting.
    for channel in (1, 2):
        corrected_lab[:, :, channel] = quantile_map(
            lab[:, :, channel], lab[:, :, channel][face_samples],
            ref_lab[:, :, channel][ref_face_samples], 8)
    skin_rgb = np.clip(cv2.cvtColor(corrected_lab, cv2.COLOR_LAB2RGB), 0, 1)
    skin_result = image * (1 - skin_alpha[:, :, None]) + skin_rgb * skin_alpha[:, :, None]

    cloth_colour = cloth_weight(hsv)
    cloth_samples = (garment * cloth_colour) > .9
    ref_cloth_samples = (ref_cloth * cloth_weight(ref_hsv)) > .9
    corrected_hsv = hsv.copy()
    corrected_hsv[:, :, 0] = quantile_map(hsv[:, :, 0], hsv[:, :, 0][cloth_samples], ref_hsv[:, :, 0][ref_cloth_samples], 25)
    corrected_hsv[:, :, 1] = np.clip(quantile_map(hsv[:, :, 1], hsv[:, :, 1][cloth_samples], ref_hsv[:, :, 1][ref_cloth_samples], .15), 0, 1)
    cloth_rgb = np.clip(cv2.cvtColor(corrected_hsv, cv2.COLOR_HSV2RGB), 0, 1)
    cloth_alpha = garment * cloth_colour
    combined = skin_result * (1 - cloth_alpha[:, :, None]) + cloth_rgb * cloth_alpha[:, :, None]
    output = np.rint(combined * 255).astype(np.uint8)
    affected = np.maximum(skin_alpha, cloth_alpha) > 0
    output[~affected] = candidate_rgb[~affected]
    result_lab = cv2.cvtColor(output.astype(np.float32) / 255, cv2.COLOR_RGB2LAB)
    result_hsv = cv2.cvtColor(output.astype(np.float32) / 255, cv2.COLOR_RGB2HSV)
    report = {
        'method': 'original-palette-region-calibration-v1',
        'width': image.shape[1], 'height': image.shape[0],
        'unchangedOutsideMasks': bool(np.array_equal(output[~affected], candidate_rgb[~affected])),
        'changedPixelShare': float(np.any(output != candidate_rgb, axis=2).mean()),
        'referenceFaceLab': np.median(ref_lab[ref_face_samples], axis=0).tolist(),
        'beforeFaceLab': np.median(lab[face_samples], axis=0).tolist(),
        'afterFaceLab': np.median(result_lab[face_samples], axis=0).tolist(),
        'referenceClothHsv': np.median(ref_hsv[ref_cloth_samples], axis=0).tolist(),
        'beforeClothHsv': np.median(hsv[cloth_samples], axis=0).tolist(),
        'afterClothHsv': np.median(result_hsv[cloth_samples], axis=0).tolist(),
        'noGeneration': True, 'geometryUnchanged': True,
    }
    return output, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reference', required=True)
    parser.add_argument('--input', required=True)
    parser.add_argument('--regions', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    regions = json.loads(Path(args.regions).read_text(encoding='utf-8'))
    output, report = calibrate(read_rgb(args.reference), read_rgb(args.input), regions)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    cv2.imencode('.png', cv2.cvtColor(output, cv2.COLOR_RGB2BGR))[1].tofile(args.output)
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
