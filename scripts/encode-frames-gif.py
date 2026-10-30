"""Encode numbered PNG frames as one looping GIF with a shared palette.

Replaces the former ffmpeg palettegen/paletteuse step. It runs in the user's
browser (Pyodide), so it only uses Pillow and numpy.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

# 8x8 Bayer threshold matrix, used for ffmpeg-style ordered dithering.
BAYER8 = np.array([
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
], dtype=np.float32) / 64.0 - 0.5


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--frames', type=Path, required=True)
    parser.add_argument('--count', type=int, required=True)
    parser.add_argument('--fps', type=int, required=True)
    parser.add_argument('--colors', type=int, required=True)
    parser.add_argument('--dither', choices=['none', 'bayer'], default='none')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()

    frames = [Image.open(args.frames / f'frame-{index:02}.png').convert('RGB') for index in range(args.count)]
    width, height = frames[0].size
    if any(frame.size != (width, height) for frame in frames):
        raise ValueError('frame sizes differ')
    # One palette from every frame (like palettegen stats_mode=full); one slot stays free for transparency.
    stack = Image.new('RGB', (width, height * len(frames)))
    for index, frame in enumerate(frames):
        stack.paste(frame, (0, index * height))
    colors = max(2, min(255, args.colors - 1))
    palette = stack.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    spread = 255.0 / max(2.0, colors ** (1 / 3)) / 2.0
    tile = np.tile(BAYER8, (height // 8 + 1, width // 8 + 1))[:height, :width, None]
    encoded = []
    for frame in frames:
        if args.dither == 'bayer':
            pixels = np.asarray(frame, dtype=np.float32) + tile * spread
            frame = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8), 'RGB')
        encoded.append(frame.quantize(palette=palette, dither=Image.Dither.NONE))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Identical neighbours are merged into one longer frame by Pillow; the
    # caller expands those holds back into 100 ms frames.
    encoded[0].save(args.output, save_all=True, append_images=encoded[1:], duration=round(1000 / args.fps),
                    loop=0, optimize=False, disposal=1)
    print(args.output.stat().st_size)


if __name__ == '__main__':
    main()
