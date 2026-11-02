import sys
import unittest
import math
from pathlib import Path
import numpy as np
import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from ad_ambient_frames import render_ambient_frames, existing_sparkle_layers


class AmbientMotionTests(unittest.TestCase):
    def test_scene_motion_keeps_low_saturation_fabric_motion_without_moving_camera_face_or_text(self):
        still = np.full((100,160,3),75,np.uint8)
        cv2.rectangle(still,(12,25),(30,70),(165,165,165),-1)
        still[30:55,75:100] = (95,145,200)
        still[40:45,82:88] = 5  # eyes are holes inside the face's skin contour
        still[8:13,50:130] = 240
        protected = np.zeros((100,160),np.uint8)
        protected[6:15,48:132] = 255
        frames=[]
        for index in range(32):
            frame=still.copy()
            frame[25:71,12:34] = 75
            shift = round(2*math.sin(index/5))
            cv2.rectangle(frame,(12+shift,25),(30+shift,70),(165,165,165),-1)
            frame[40:45,82:88] = 240  # deliberately bad model eye change
            frame[8:13,50:130] = 30
            frames.append(frame)
        output,static,_,report=render_ambient_frames(still,frames,protected,{'mode':'scene-adaptive'})
        self.assertEqual(report['motionStyle'],'scene-adaptive')
        self.assertFalse(report['rigidWholeImageScale'])
        self.assertEqual(report['durationMs'],1000)
        self.assertGreater(report['nativeVisiblePixels'],24)
        self.assertLess(report['motionFraction'],.20)
        np.testing.assert_array_equal(output[0],output[-1])
        self.assertEqual(report['nativeSegmentDurationMs'],1000)
        self.assertTrue(report['nativeChronologyPreserved'])
        for image in output:
            np.testing.assert_array_equal(image[static>0],still[static>0])
            np.testing.assert_array_equal(image[30:55,75:100],still[30:55,75:100])
            np.testing.assert_array_equal(image[6:15,48:132],still[6:15,48:132])

    def test_native_motion_removes_the_original_petal_instead_of_leaving_a_frozen_duplicate(self):
        still=np.full((80,120,3),30,np.uint8)
        still[55:62,10:17]=235
        frames=[]
        for i in range(40):
            frame=np.full_like(still,30)
            frame[55:62,10+i:17+i]=235
            frames.append(frame)
        output,static,_,report=render_ambient_frames(still,frames,np.zeros((80,120),np.uint8),{
            'mode':'scene-adaptive','nativeSampleFps':10,'nativeStartMs':500,
            'effectPolygons':[[[2,45],[75,45],[75,76],[2,76]]],
        })
        self.assertLess(int(output[4][58,12].max()),50,'the old source petal must be removed')
        self.assertGreater(int(output[4][58,22].min()),200,'native moving color must not be clipped into a weak ghost')
        for image in output:
            np.testing.assert_array_equal(image[static>0],still[static>0])
        np.testing.assert_array_equal(output[0],output[-1])

    def test_scene_motion_rejects_a_global_exposure_pulse_instead_of_falling_back_to_zoom(self):
        still=np.full((80,120,3),75,np.uint8)
        frames=[np.full_like(still,75+index) for index in range(32)]
        with self.assertRaisesRegex(ValueError,'场景局部动效'):
            render_ambient_frames(still,frames,np.zeros((80,120),np.uint8),{'mode':'scene-adaptive'})

    def test_existing_flares_pulse_out_of_phase_and_remain_anchored_during_zoom(self):
        still = np.full((100,160,3), [20,130,220], np.uint8)
        for x,y in [(40,45),(120,70)]:
            star = np.array([[x,y-10],[x+2,y-2],[x+10,y],[x+2,y+2],[x,y+10],[x-2,y+2],[x-10,y],[x-2,y-2]])
            cv2.fillPoly(still,[star],(255,255,255))
        still[15:25,65:85] = 255  # white text/hair-shaped block is not a flare
        protected = np.zeros((100,160), np.uint8)
        layers = existing_sparkle_layers(still,protected,{})
        self.assertEqual(len(layers),2)
        output,_,_,report = render_ambient_frames(still,[still.copy() for _ in range(32)],protected,{'mode':'whole-image-zoom'})
        self.assertEqual(report['existingSparkleCount'],2)
        self.assertTrue(report['sparkleFlickerApplied'])
        self.assertTrue(report['sparklesAnchoredToArtwork'])
        self.assertFalse(report['newSparklesAdded'])
        self.assertNotEqual(report['sparkles'][0]['opacityByFrame'],report['sparkles'][1]['opacityByFrame'])
        np.testing.assert_array_equal(output[0],output[-1])
        for x,y in [(40,45),(120,70)]:
            brightness = []
            for image,scale in zip(output,report['scales']):
                px = round(x*scale['width']/160-scale['cropLeft'])
                py = round(y*scale['height']/100-scale['cropTop'])
                brightness.append(float(image[py,px].mean()))
            self.assertGreater(max(brightness)-min(brightness),45)
        support = np.max(np.stack([np.abs(layer['delta']).max(axis=2) for layer in layers]),axis=0) > 0
        support = cv2.dilate(support.astype(np.uint8),np.ones((5,5),np.uint8))
        support = cv2.resize(support,(168,105),interpolation=cv2.INTER_NEAREST)[2:102,4:164] > 0
        np.testing.assert_array_equal(output[4][~support],output[5][~support])
        self.assertTrue(np.any(output[4] != output[5]),'stars must still flicker while zoom pauses')
        self.assertEqual(len(existing_sparkle_layers(still,protected,{'protectedRectangles':[[25,30,30,30]]})),1)

    def test_whole_image_zoom_preserves_artwork_and_ignores_broad_light_qc(self):
        still = np.full((80, 120, 3), [30, 155, 240], np.uint8)
        still[20:60, 30:50] = [230, 170, 30]
        still[30:65, 65:90] = [15, 30, 80]
        still[5:9, 40:80] = 255
        frames = []
        for index in range(32):
            model = np.clip(still.astype(np.int16)+index, 0, 255).astype(np.uint8)
            model[25:50, 25+index%8:55+index%8] = 0
            frames.append(model)
        output, _, _, report = render_ambient_frames(still, frames, np.zeros((80, 120), np.uint8), {'mode': 'whole-image-zoom'})
        self.assertEqual(len(output), 10)
        self.assertEqual(report['motionStyle'], 'whole-image-zoom')
        self.assertTrue(report['rigidWholeImageScale'])
        self.assertFalse(report['modelGeometryCopied'])
        self.assertEqual(report['durationMs'], 1000)
        self.assertEqual(report['scaleMax'], 1.05)
        self.assertGreater(report['visiblyChangedPixels'], 80*120*.02)
        np.testing.assert_array_equal(output[0], still)
        np.testing.assert_array_equal(output[0], output[1])
        np.testing.assert_array_equal(output[0], output[-1])
        np.testing.assert_array_equal(output[4], output[5])
        np.testing.assert_array_equal(output[5], output[6])
        self.assertTrue(all(image.shape == still.shape for image in output))
        # Only the original scene can move; the model's black face occluder is
        # never copied, even if no compact light region passes the old policy.
        reference = cv2.resize(still, (126, 84), interpolation=cv2.INTER_LINEAR)[2:82, 3:123]
        delta = np.abs(output[5].astype(np.int16)-reference.astype(np.int16))
        self.assertLessEqual(int(delta.max()), 16)

    def test_model_occluders_cannot_replace_character_or_text_pixels(self):
        still = np.full((80, 120, 3), [55, 45, 35], np.uint8)
        still[20:60, 35:85] = [235, 180, 35]  # existing cyan glow
        still[28:48, 55:70] = [85, 130, 205]  # subject face inside glow
        still[22:26, 38:80] = 255  # fixed HUD text
        protected = np.zeros((80, 120), np.uint8)
        protected[21:27, 37:81] = 255
        frames = []
        for index in range(32):
            frame = still.copy()
            frame[20:60, 35:85] = np.clip(frame[20:60, 35:85].astype(np.int16)+index, 0, 255)
            frame[28:48, 50+index%8:70+index%8] = 0  # deliberately bad V3 occluder
            frames.append(frame)
        output, static, _, report = render_ambient_frames(still, frames, protected, {
            'maxLightDelta': 14,
            'protectedPolygons': [[[53, 27], [71, 27], [71, 49], [53, 49]]],
            'effectPolygons': [[[33, 18], [87, 18], [87, 62], [33, 62]]],
        })
        self.assertEqual(len(output), 10)
        self.assertEqual(report['durationMs'], 1000)
        self.assertTrue(report['geometryFrozen'])
        self.assertLessEqual(report['maxPixelLightDelta'], 14)
        self.assertGreater(report['peakAmbientMeanDifference'], .7)
        self.assertGreater(report['ambientPixels'], 24)
        for image in output:
            np.testing.assert_array_equal(image[static > 0], still[static > 0])
            np.testing.assert_array_equal(image[28:48, 55:70], still[28:48, 55:70])
            np.testing.assert_array_equal(image[21:27, 37:81], still[21:27, 37:81])
        # Equal easing around the loop boundary prevents the last-to-first jump.
        np.testing.assert_array_equal(output[1], output[-1])

    def test_no_existing_emission_is_an_explicit_failure_not_a_decorative_fallback(self):
        still = np.full((80, 120, 3), 70, np.uint8)
        frames = [np.full_like(still, 70+index) for index in range(32)]
        with self.assertRaisesRegex(ValueError, '没有可用的局部光效'):
            render_ambient_frames(still, frames, np.zeros((80, 120), np.uint8), {})

    def test_native_effects_remain_visible_but_cannot_enter_subject_or_text(self):
        still = np.full((80, 120, 3), [95, 70, 40], np.uint8)
        still[28:48, 55:70] = [85, 130, 205]
        protected = np.zeros((80, 120), np.uint8)
        protected[20:26, 35:85] = 255
        frames = []
        for index in range(32):
            frame = still.copy()
            frame[18:62, 30:90] = np.clip(frame[18:62, 30:90].astype(np.int16)+index*8, 0, 255)
            frame[28:48, 50:75] = 0  # an occluder is still forbidden on the face
            frames.append(frame)
        output, static, _, report = render_ambient_frames(still, frames, protected, {
            'mode': 'native-local-effects',
            'protectedPolygons': [[[53, 27], [71, 27], [71, 49], [53, 49]]],
            'effectPolygons': [[[33, 18], [87, 18], [87, 62], [33, 62]]],
        })
        self.assertTrue(report['nativeEffectsPreserved'])
        self.assertGreaterEqual(report['nativeVisiblePixels'], 24)
        self.assertGreater(report['peakAmbientMeanDifference'], 3)
        for image in output:
            np.testing.assert_array_equal(image[static > 0], still[static > 0])
            np.testing.assert_array_equal(image[28:48, 55:70], still[28:48, 55:70])
            np.testing.assert_array_equal(image[20:26, 35:85], still[20:26, 35:85])
        np.testing.assert_array_equal(output[1], output[-1])


if __name__ == '__main__':
    unittest.main()
