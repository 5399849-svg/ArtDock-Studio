"""Browser stand-in for rembg: same u2net model and the same pre/post processing
as rembg 2.x (resize, normalisation, min-max, LANCZOS mask, naive cutout); only
the model itself runs in onnxruntime-web."""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

import wb_bridge

MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


class _Session:
    def __init__(self, model_name: str):
        if model_name not in ('u2net',):
            raise ValueError(f'浏览器里只提供 u2net 模型，不支持 {model_name}')
        self.model_name = model_name


def new_session(model_name: str = 'u2net', *args, **kwargs) -> _Session:
    return _Session(model_name)


def _mask(img: Image.Image) -> Image.Image:
    small = img.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS)
    pixels = np.array(small)
    pixels = pixels / max(np.max(pixels), 1e-6)
    tensor = np.zeros((320, 320, 3))
    for channel in range(3):
        tensor[:, :, channel] = (pixels[:, :, channel] - MEAN[channel]) / STD[channel]
    tensor = np.expand_dims(tensor.transpose((2, 0, 1)), 0).astype(np.float32)
    result = wb_bridge.onnx_run('u2net', {'input.1': tensor}, {'out0': (1, 1, 320, 320)})
    pred = result['out0'][:, 0, :, :]
    high, low = np.max(pred), np.min(pred)
    pred = np.squeeze((pred - low) / (high - low if high > low else 1.0))
    return Image.fromarray((pred * 255).astype('uint8'), mode='L').resize(img.size, Image.Resampling.LANCZOS)


def remove(data, session: _Session | None = None, only_mask: bool = False, **kwargs):
    if isinstance(data, Image.Image):
        img, kind = data, 'pil'
    elif isinstance(data, np.ndarray):
        img, kind = Image.fromarray(data), 'array'
    else:
        img, kind = Image.open(io.BytesIO(data)), 'bytes'
    mask = _mask(img)
    if only_mask:
        cutout = mask
    else:
        source = img if img.mode == 'RGBA' else img.convert('RGBA')
        cutout = Image.composite(source, Image.new('RGBA', source.size, 0), mask)
    if kind == 'pil':
        return cutout
    if kind == 'array':
        return np.asarray(cutout)
    buffer = io.BytesIO()
    cutout.save(buffer, 'PNG')
    return buffer.getvalue()
