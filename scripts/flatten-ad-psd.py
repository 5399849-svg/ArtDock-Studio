"""Export a PSD composite and, when safely separable, its clean art and logo."""

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import ImageChops
from psd_tools import PSDImage


def export_motion_layers(psd, scene_target, typography_target):
    """Separate native transparent type, not a rectangle copied from the art."""
    titles = [layer for layer in psd if layer.is_visible() and
              re.search(r'文案|标题|主标|slogan|title|typography', layer.name or '', re.I) and
              not re.search(r'logo|背景|底图|background', layer.name or '', re.I)]
    if not titles:
        return False
    logos = [layer for layer in psd if re.fullmatch(r'logo|标识|标志', layer.name.strip(), re.I)]
    def under(layer, ancestors):
        while layer is not None:
            if any(layer is item for item in ancestors):
                return True
            layer = getattr(layer, 'parent', None)
        return False
    scene = psd.composite(ignore_preview=True, layer_filter=lambda layer: not under(layer, titles+logos))
    overlay = psd.composite(ignore_preview=True, layer_filter=lambda layer: under(layer, titles))
    if scene is None or overlay is None or 'A' not in overlay.mode:
        return False
    alpha = np.asarray(overlay.getchannel('A'))
    # A title-named layer containing a flattened image is not a text overlay.
    if not np.any(alpha > 0) or np.count_nonzero(alpha > 0)/alpha.size > .65:
        return False
    if scene.getchannel('A').getextrema()[0] != 255:
        return False
    scene.save(scene_target, format='PNG', optimize=True)
    overlay.save(typography_target, format='PNG', optimize=True)
    return True


def logo_layer(psd):
    width, height = psd.size
    candidates = []
    # Logos often live inside a small design group; inspecting only top-level
    # layers misses them and incorrectly treats the flattened art as logo-free.
    for layer in psd.descendants():
        if layer.is_group():
            continue
        x0, y0, x1, y1 = layer.bbox
        w, h = x1 - x0, y1 - y0
        if w <= 0 or h <= 0 or w >= width * .7 or h >= height * .38:
            continue
        named = bool(re.search(r"logo|标识|标志|主标|游戏名", layer.name or "", re.I))
        header_mark = y0 < height * .22 and .08 < w / width < .6 and .012 < w * h / (width * height) < .16
        visible = layer.is_visible()
        if not named and not (visible and header_mark):
            continue
        image = layer.composite() if visible else layer.topil()
        if image is None or "A" not in image.mode:
            continue
        minimum_alpha, maximum_alpha = image.getchannel("A").getextrema()
        if maximum_alpha == 0 or minimum_alpha > 16:
            continue
        candidates.append((int(named), int(visible), int(header_mark), w * h, layer))
    return max(candidates, default=None, key=lambda item: item[:4])[-1] if candidates else None


def logo_remains(clean, layer, bounds) -> bool:
    """Detect a flattened duplicate beneath a separately extracted logo layer.

    Some supplied PSDs contain the same Logo both inside the raster background
    and as a separate visible layer. Excluding that layer alone then leaves a
    false "clean" composite. Compare only opaque glyph pixels, where the logo
    artwork cannot be confused with ordinary background texture.
    """
    x0, y0, x1, y1 = bounds
    logo = layer.topil()
    if logo is None or logo.size != (x1 - x0, y1 - y0):
        return True
    logo = logo.convert("RGBA")
    clean_crop = clean.crop(bounds).convert("RGB")
    alpha = np.asarray(logo.getchannel("A"), dtype=np.uint8)
    opaque = alpha >= 220
    if int(opaque.sum()) < 256:
        return True
    clean_pixels = np.asarray(clean_crop, dtype=np.int16)
    logo_pixels = np.asarray(logo.convert("RGB"), dtype=np.int16)
    max_difference = np.abs(clean_pixels - logo_pixels).max(axis=2)
    same_logo_pixels = (max_difference <= 28) & opaque
    return float(same_logo_pixels.sum() / opaque.sum()) >= 0.72


def main() -> None:
    source, target = map(Path, sys.argv[1:3])
    psd = PSDImage.open(source)
    image = psd.composite(ignore_preview=True)
    if image is None:
        raise ValueError("PSD 没有可见画面")
    target.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGBA").save(target, format="PNG", optimize=True)
    result = {"logoSeparated": False, "logoFree": False}
    if len(sys.argv) >= 5:
        clean_target, logo_target = map(Path, sys.argv[3:5])
        layer = logo_layer(psd)
        if layer is not None:
            visible = layer.is_visible()
            clean = psd.composite(ignore_preview=True, layer_filter=lambda item: item is not layer) if visible else image
            changed = ImageChops.difference(image.convert("RGB"), clean.convert("RGB")).getbbox() if visible else None
            x0, y0, x1, y1 = layer.bbox
            safe = not visible or changed and changed[0] >= x0 - 3 and changed[1] >= y0 - 3 and changed[2] <= x1 + 3 and changed[3] <= y1 + 3
            if safe:
                remains = logo_remains(clean, layer, (x0, y0, x1, y1))
                if visible:
                    logo = layer.composite()
                else:
                    previous_visibility = layer.visible
                    try:
                        layer.visible = True
                        logo = layer.composite()
                    finally:
                        layer.visible = previous_visibility
                    if logo is None or logo.getchannel("A").getextrema()[1] == 0:
                        logo = layer.topil()
                clean.convert("RGBA").save(clean_target, format="PNG", optimize=True)
                logo.convert("RGBA").save(logo_target, format="PNG", optimize=True)
                result = {
                    "logoSeparated": True,
                    "logoVisible": visible,
                    "logoRemaining": remains,
                    "logoFree": not remains,
                    "logoBounds": [x0, y0, x1, y1],
                }
    if len(sys.argv) >= 7:
        result['motionLayersSeparated'] = export_motion_layers(psd, Path(sys.argv[5]), Path(sys.argv[6]))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
