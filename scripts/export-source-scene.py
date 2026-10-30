"""Read a source document without modifying it; verify extracted visual groups."""
import argparse
import json
import re
from pathlib import Path
import numpy as np
from PIL import Image
from psd_tools import PSDImage


def export(source, output):
    psd = PSDImage.open(source)
    if psd.width * psd.height > 64_000_000:
        raise ValueError('源画布超过 6400 万像素，请先提供较小的源稿')
    output.mkdir(parents=True, exist_ok=True)
    cached = psd.topil() if psd.has_preview() else None
    reference = (cached or psd.composite()).convert('RGBA')
    reference.save(output / 'original.png')
    layers, images = [], []
    warnings = []
    for index, layer in enumerate(psd):
        if not layer.is_visible():
            continue
        # Do not split smart objects, text treatments, clipping chains or effects.
        image = layer.composite(color=0.0, alpha=0.0)
        if image is None:
            continue
        image = image.convert('RGBA')
        bounds = image.getchannel('A').getbbox()
        if not bounds:
            continue
        # Only pixels visible on the original artboard belong to this composition.
        bounds = (max(bounds[0],-layer.left),max(bounds[1],-layer.top),min(bounds[2],psd.width-layer.left),min(bounds[3],psd.height-layer.top))
        if bounds[2]<=bounds[0] or bounds[3]<=bounds[1]:
            continue
        image = image.crop(bounds)
        filename = f'group-{index}.png'
        image.save(output / filename)
        role = 'source-group'
        for candidate, pattern in [('logo', r'logo|标识'), ('title', r'主标|文案|标题'), ('subtitle', r'副标'), ('background', r'^背景$|^background$'), ('character', r'^人物$|^角色$')]:
            if re.search(pattern, layer.name, re.I):
                role = candidate
                break
        item = dict(file=filename, label=layer.name, role=role, x=layer.left+bounds[0], y=layer.top+bounds[1], width=image.width, height=image.height, visible=True)
        layers.append(item)
        images.append((image, (item['x'], item['y'])))
    rendered = Image.new('RGBA', psd.size)
    for image, xy in images:
        rendered.alpha_composite(image, xy)
    def pixels(image):
        a = np.asarray(image, dtype=np.float32)
        a[:, :, :3] *= a[:, :, 3:4] / 255
        return a
    diff = np.abs(pixels(reference)-pixels(rendered))
    mean = float(diff.mean())
    changed = float((diff.max(axis=2)>16).mean())
    verified = mean <= 1.5 and changed <= .015
    if not verified:
        # Never present an inaccurate reconstructed composition as a faithful PSD import.
        layers = [dict(file='original.png', label='原稿完整组合', role='source-group', x=0, y=0, width=psd.width, height=psd.height, visible=True)]
        warnings.append('部分图层含跨组混合或复杂效果，已保留原稿完整组合，避免改变画面。')
    if any(layer.kind == 'smartobject' and layer.is_visible() and not re.search('logo|文案|标题|主标|副标', layer.name, re.I) for layer in psd):
        warnings.append('原稿含合并的智能对象，人物与背景可能在同一视觉组内；移动时保留原组合，不自动重画人物。')
    if not cached:
        warnings.append('源文件未包含 Photoshop 合成预览，请与设计师原稿核对后确认。')
    return dict(width=psd.width, height=psd.height, preview='original.png', layers=layers, warnings=warnings, fidelity=dict(reference='embedded-preview' if cached else 'parser-render', verified=verified and bool(cached), meanError=mean, changedFraction=changed, preservedComposite=not verified))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args=parser.parse_args()
    print(json.dumps(export(args.source,args.output),ensure_ascii=False))
