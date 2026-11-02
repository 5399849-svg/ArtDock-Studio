import importlib.util
from pathlib import Path
import tempfile
import unittest

from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import Group, PixelLayer

spec = importlib.util.spec_from_file_location('exporter', Path(__file__).parents[1] / 'scripts/export-task-psd-assets.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class SourceAssetTests(unittest.TestCase):
    def test_both_formats_keep_character_group_transparent_and_exclude_hidden_layers(self):
        for version, extension in [(1, 'psd'), (2, 'psb')]:
            with self.subTest(extension=extension), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                psd = PSDImage.new('RGB', (80, 80))
                psd._record.header.version = version
                group = Group.new(psd, 'character')
                pixels = Image.new('RGBA', (20, 30))
                pixels.paste((255, 0, 0, 255), (2, 3, 18, 27))
                PixelLayer.frompil(pixels, group, 'body', top=10, left=20)
                hidden = PixelLayer.frompil(Image.new('RGBA', (80, 80), 'blue'), group, 'hidden')
                hidden.visible = False
                source = root / f'角色.{extension}'
                psd.save(source)
                result = exporter.export_assets(source, root / 'out')
                self.assertEqual(len(result['layers']), 1)
                layer = result['layers'][0]
                self.assertEqual(layer['role'], 'character')
                self.assertEqual(layer['sourceBounds'], [22, 13, 16, 24])
                exported = Image.open(root / 'out' / layer['file'])
                self.assertEqual(exported.getpixel((0, 0)), (255, 0, 0, 255))

    def test_named_characters_export_separately_without_body_fragments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            psd = PSDImage.new('RGB', (80, 80))
            wrapper = Group.new(psd, 'assets')
            for name in ['character1', 'character2', 'Logo']:
                group = Group.new(wrapper, name)
                PixelLayer.frompil(Image.new('RGBA', (10, 10), 'red'), group, 'layer1')
                PixelLayer.frompil(Image.new('RGBA', (5, 5), 'green'), group, 'layer2')
            source = root / '多图层.psd'
            psd.save(source)
            result = exporter.export_assets(source, root / 'out')
            self.assertEqual([layer['role'] for layer in result['layers']], ['character', 'character', 'logo'])


if __name__ == '__main__':
    unittest.main()
