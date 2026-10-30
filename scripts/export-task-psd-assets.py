"""Export visible PSD/PSB layer groups as original, transparent raster assets."""
import argparse
import json
import re
from pathlib import Path

from psd_tools import PSDImage


def layer_role(name):
    for role, pattern in [
        ('logo', r'logo|标识|标志'), ('subtitle', r'副标|subtitle'),
        ('title', r'主标|标题|文案|title'), ('background', r'背景|background'),
        ('character', r'人物|角色|鲛人|character'), ('foreground', r'前景|装饰|foreground'),
    ]:
        if re.search(pattern, name, re.I):
            return role
    return None


def export_assets(source, output, requested_role='supplement'):
    psd = PSDImage.open(source)
    if psd.width * psd.height > 64_000_000:
        raise ValueError('源文件画布超过 6400 万像素，请先拆分角色源文件再导入')
    visible = [layer for layer in psd if layer.is_visible()]
    if not visible:
        raise ValueError('源文件没有可见图层，请先在源文件中显示需要导出的角色')
    output.mkdir(parents=True, exist_ok=True)
    results = []

    def export_layer(layer, layer_path, role):
        # Render the complete group so masks, clipping and internal blending remain together.
        image = layer.composite(color=0.0, alpha=0.0)
        if image is None:
            return
        image = image.convert('RGBA')
        bounds = image.getchannel('A').getbbox()
        if not bounds:
            return
        image = image.crop(bounds)
        filename = f'layer-{len(results) + 1}.png'
        image.save(output / filename, format='PNG')
        results.append(dict(file=filename, layerPath=layer_path, role=role,
                            width=image.width, height=image.height,
                            transparent=image.getchannel('A').getextrema()[0] < 255,
                            sourceBounds=[layer.left + bounds[0], layer.top + bounds[1], image.width, image.height]))

    def visit(layer, ancestors):
        if not layer.is_visible():
            return
        names = ancestors + [layer.name]
        role = layer_role(layer.name)
        if role:
            export_layer(layer, names, role)
            return
        # A named nested role is an independent asset, not dozens of body-part layers.
        named_children = layer.is_group() and any(item.is_visible() and layer_role(item.name) for item in layer.descendants())
        if named_children:
            for child in layer:
                visit(child, names)
        elif not ancestors:
            fallback = requested_role if requested_role != 'supplement' else layer_role(source.stem) or 'supplement'
            export_layer(layer, names, fallback)

    for layer in visible:
        visit(layer, [])
    if not results:
        raise ValueError('没有可导出的可见图层组')
    return dict(version=1, canvas=[psd.width, psd.height], layers=results)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--role', default='supplement')
    args = parser.parse_args()
    print(json.dumps(export_assets(args.source, args.output, args.role), ensure_ascii=False))
