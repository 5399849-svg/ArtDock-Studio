"""Bridge between the workbench scripts (running in Pyodide) and the browser.

Models (u2net, SAM2) run in onnxruntime-web on the user's GPU, and video frames
are decoded by the browser.  A script asks for such a result; when it is not
there yet, the request is recorded, a placeholder is returned so the script can
finish collecting every request, and the runner computes the results and runs
the script again.  Placeholder runs never reach the server.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import numpy as np

BRIDGE = Path(os.environ.get('WB_BRIDGE_DIR', '/wb-bridge'))
VIDEO = Path(os.environ.get('WB_VIDEO_DIR', '/wb-video'))
_pending: list[dict] = []
_DTYPES = {'float32': np.float32, 'int64': np.int64, 'int32': np.int32}


def reset() -> None:
    _pending.clear()


def pending() -> list[dict]:
    return list(_pending)


def _request(item: dict) -> None:
    if not any(existing.get('key') == item.get('key') and existing['kind'] == item['kind'] for existing in _pending):
        _pending.append(item)


class Ref:
    """An output of an earlier model run, passed on without copying it."""

    def __init__(self, key: str, name: str, shape, dtype: str = 'float32'):
        self.key, self.name, self.shape, self.dtype = key, name, list(shape), dtype


class Result(dict):
    def __init__(self, key: str, values: dict, ready: bool):
        super().__init__(values)
        self.key, self.ready = key, ready

    def ref(self, name: str) -> Ref:
        value = self[name]
        return Ref(self.key, name, value.shape, str(value.dtype))


def _tensor_file(array: np.ndarray) -> tuple[str, str]:
    data = np.ascontiguousarray(array).tobytes()
    digest = hashlib.sha1(data).hexdigest()
    path = BRIDGE / f't-{digest}.bin'
    if not path.exists():
        BRIDGE.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return str(path), digest


def onnx_run(model: str, inputs: dict, expected: dict) -> Result:
    """Run `model` in the browser. `expected` maps output name -> shape."""
    described, parts = {}, [model]
    for name, value in inputs.items():
        if isinstance(value, Ref):
            described[name] = {'ref': f'{value.key}:{value.name}', 'dtype': value.dtype, 'shape': value.shape}
            parts.append(f'{name}@{value.key}:{value.name}')
        else:
            array = np.asarray(value)
            dtype = 'int32' if array.dtype == np.int32 else 'int64' if array.dtype.kind in 'iu' else 'float32'
            array = array.astype(_DTYPES[dtype], copy=False)
            file, digest = _tensor_file(array)
            described[name] = {'file': file, 'dtype': dtype, 'shape': list(array.shape)}
            parts.append(f'{name}:{dtype}:{array.shape}:{digest}')
    key = hashlib.sha1('|'.join(parts).encode()).hexdigest()
    manifest = BRIDGE / f'r-{key}.json'
    if manifest.exists():
        info = json.loads(manifest.read_text())
        values = {name: np.frombuffer(Path(entry['file']).read_bytes(), dtype=_DTYPES[entry['dtype']]).reshape(entry['shape'])
                  for name, entry in info['outputs'].items()}
        return Result(key, values, True)
    _request({'kind': 'onnx', 'key': key, 'model': model, 'inputs': described, 'outputs': list(expected)})
    return Result(key, {name: np.zeros(shape, dtype=np.float32) for name, shape in expected.items()}, False)


def _video_dir(path: str) -> Path:
    return VIDEO / hashlib.sha1(path.encode()).hexdigest()


class VideoCapture:
    """cv2.VideoCapture stand-in: frames are decoded by the browser on demand."""

    def __init__(self, path, *args):
        import cv2
        self._cv2 = cv2
        self.path = os.path.abspath(str(path))
        self.dir = _video_dir(self.path)
        self.position = 0
        meta = self.dir / 'meta.json'
        if meta.exists():
            self.meta = json.loads(meta.read_text())
        else:
            self.meta = None
            _request({'kind': 'video-meta', 'key': f'meta:{self.path}', 'path': self.path})

    def isOpened(self):
        return self.meta is not None

    def get(self, prop):
        cv2 = self._cv2
        if not self.meta:
            return 0.0
        return float({cv2.CAP_PROP_FPS: self.meta['fps'], cv2.CAP_PROP_FRAME_COUNT: self.meta['count'],
                      cv2.CAP_PROP_FRAME_WIDTH: self.meta['width'], cv2.CAP_PROP_FRAME_HEIGHT: self.meta['height'],
                      cv2.CAP_PROP_POS_FRAMES: self.position}.get(prop, 0.0))

    def set(self, prop, value):
        if prop == self._cv2.CAP_PROP_POS_FRAMES:
            self.position = max(0, int(value))
        return True

    def read(self):
        if not self.meta or self.position >= self.meta['count']:
            return False, None
        index, self.position = self.position, self.position + 1
        frame = self.dir / f'{index}.png'
        if frame.exists():
            return True, self._cv2.imdecode(np.frombuffer(frame.read_bytes(), np.uint8), self._cv2.IMREAD_COLOR)
        _request({'kind': 'video-frame', 'key': f'{self.path}#{index}', 'path': self.path, 'index': index, 'fps': self.meta['fps']})
        return True, np.zeros((self.meta['height'], self.meta['width'], 3), np.uint8)

    def release(self):
        pass


def install() -> None:
    import cv2
    cv2.VideoCapture = VideoCapture
