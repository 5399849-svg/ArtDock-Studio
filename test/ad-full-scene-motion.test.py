import sys
import tempfile
import unittest
from pathlib import Path
import cv2
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from ad_full_scene_frames import render_full_scene_frames


class FullSceneMotionTests(unittest.TestCase):
    def fixture(self):
        still=np.full((80,120,3),10,np.uint8)
        frames=[]
        for i in range(40):
            f=np.full_like(still,90)
            cv2.rectangle(f,(10+i,20),(35+i,60),(180,140,120),-1)
            frames.append(f)
        return still,frames

    def test_keeps_complete_native_frames_even_across_old_freeze_boundaries(self):
        still,frames=self.fixture()
        out,report=render_full_scene_frames(still,frames,{
            'nativeSampleFps':20,'playbackRate':.5,'nativeStartMs':100,
            'protectedRectangles':[[0,0,120,80]],'effectPolygons':[],
            'safeInsetX':40,'freezeSafeInset':True,
        })
        # A native rectangle crosses the old protection edge with no source patch.
        for image in out:
            self.assertEqual(int(image[0,0,0]),90)
            self.assertFalse(np.any(np.all(image==still,axis=2)))
        np.testing.assert_array_equal(out[5],frames[7])
        np.testing.assert_array_equal(out[0],frames[12])
        self.assertFalse(report['sourcePatchesApplied'])
        self.assertFalse(report['spatialMotionMasksApplied'])
        self.assertTrue(report['visualReviewRequired'])
        self.assertEqual(report['durationMs'],1000)
        self.assertEqual(len(out),10)

    def test_native_typography_preserves_transparent_holes_instead_of_a_rectangle(self):
        still,frames=self.fixture()
        with tempfile.TemporaryDirectory() as directory:
            layer=np.zeros((80,120,4),np.uint8)
            layer[30:35,10:90]=(0,200,255,255)
            layer[50:55,10:90]=(0,200,255,255)
            p=Path(directory)/'type.png';cv2.imencode('.png',layer)[1].tofile(str(p))
            out,report=render_full_scene_frames(still,frames,{'nativeStartMs':0,'nativeSampleFps':20,'nativeOverlayFile':str(p)})
            self.assertTrue(report['nativeTypographyOverlay'])
            for image in out:np.testing.assert_array_equal(image[30:35,10:90],layer[30:35,10:90,:3])
            np.testing.assert_array_equal(out[5][38:46],frames[5][38:46])
            layer[:,:,3]=255;cv2.imencode('.png',layer)[1].tofile(str(p))
            with self.assertRaisesRegex(ValueError,'真正透明'):
                render_full_scene_frames(still,frames,{'nativeOverlayFile':str(p)})

    def test_static_video_is_not_replaced_with_zoom_or_fake_light(self):
        still,frames=self.fixture()
        with self.assertRaisesRegex(ValueError,'没有可辨认'):
            render_full_scene_frames(still,[frames[0]]*40,{})


if __name__=='__main__':unittest.main()
