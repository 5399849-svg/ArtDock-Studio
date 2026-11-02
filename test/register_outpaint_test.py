"""Registration geometry regressions; no network or project task mutations."""
import importlib.util
import pathlib
import unittest

import cv2
import numpy as np


SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'register-outpaint.py'
SPEC = importlib.util.spec_from_file_location('register_outpaint', SCRIPT)
REGISTRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REGISTRATION)


class AxisScaleRegistrationTests(unittest.TestCase):
    def setUp(self):
        cv2.setRNGSeed(21)
        self.rng = np.random.default_rng(21)
        self.source = np.zeros((600, 1000), np.uint8)
        self.source_shape = self.source.shape
        self.generated_shape = (1600, 2000)
        # Global correspondences cover both axes, with independent bad matches.
        self.a = self.rng.uniform([30, 20], [970, 580], (150, 2)).astype(np.float32)

    def fit(self, a, b):
        return REGISTRATION.register_axis_scale(a, b, self.source, self.source_shape, self.generated_shape, 1., 1.)

    def transform(self, a=None, scales=(.90, .9252)):
        points = self.a if a is None else a
        return (points * scales + [300, 200] + self.rng.normal(0, .15, points.shape)).astype(np.float32)

    def test_global_2_8_percent_axis_difference_is_located_without_rotation(self):
        b = self.transform()
        b[-35:] = self.rng.uniform([0, 0], [2000, 1600], (35, 2))
        result = self.fit(self.a, b)
        self.assertEqual(result['method'], 'sift-axis-scale-translation-v2')
        self.assertGreater(result['inliers'], 100)
        self.assertGreater(min(result['coverage']), .80)
        self.assertLess(result['medianError'], .5)
        self.assertAlmostEqual(result['anisotropy'], 1.028, delta=.002)
        self.assertAlmostEqual(result['sourceRect']['x'], .15, delta=.001)
        self.assertAlmostEqual(result['sourceRect']['y'], .125, delta=.001)
        self.assertAlmostEqual(result['sourceRect']['width'], .45, delta=.001)
        self.assertAlmostEqual(result['sourceRect']['height'], .34695, delta=.001)

    def test_local_strip_matches_are_rejected_even_when_numerically_precise(self):
        local = self.a.copy()
        local[:, 0] = local[:, 0] * .22 + 100
        with self.assertRaisesRegex(ValueError, '局部主体'):
            self.fit(local, self.transform(local))

    def test_rotated_source_is_rejected(self):
        angle = np.deg2rad(5)
        matrix = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]]) * .9
        b = (self.a @ matrix.T + [300, 200]).astype(np.float32)
        with self.assertRaisesRegex(ValueError, '旋转|倾斜'):
            self.fit(self.a, b)

    def test_skewed_source_is_rejected(self):
        b = (self.a @ np.array([[.9, .08], [0, .9]]).T + [300, 200]).astype(np.float32)
        with self.assertRaisesRegex(ValueError, '旋转|倾斜'):
            self.fit(self.a, b)

    def test_unrelated_scene_is_rejected(self):
        b = self.rng.uniform([0, 0], [2000, 1600], self.a.shape).astype(np.float32)
        with self.assertRaises(ValueError):
            self.fit(self.a, b)

    def test_axis_difference_above_five_percent_is_rejected(self):
        with self.assertRaisesRegex(ValueError, '比例变化过大'):
            self.fit(self.a, self.transform(scales=(.9, 1.0)))

    def test_legacy_uniform_registration_keeps_original_method(self):
        b = self.transform(scales=(.9, .9))
        result = REGISTRATION.register_uniform(self.a, b, self.source, self.source_shape, self.generated_shape, 1., 1.)
        self.assertEqual(result['method'], 'sift-scale-translation-v1')
        self.assertNotIn('anisotropy', result)


if __name__ == '__main__':
    unittest.main()
