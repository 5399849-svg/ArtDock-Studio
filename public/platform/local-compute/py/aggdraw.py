"""Minimal aggdraw stand-in for psd-tools vector masks and strokes in the browser.

psd-tools only uses Draw(mask), Pen, Brush, Symbol(svg path with M/C/Z) and
Draw.symbol/flush.  Curves are flattened and drawn with Pillow at a higher
resolution, then reduced, which gives anti-aliased edges like aggdraw.
"""
from __future__ import annotations

import re

from PIL import Image, ImageDraw


class Pen:
    def __init__(self, color=255, width=1.0, opacity=255, **kwargs):
        self.color, self.width, self.opacity = color, float(width), opacity


class Brush:
    def __init__(self, color=255, opacity=255, **kwargs):
        self.color, self.opacity = color, opacity


class Symbol:
    def __init__(self, path: str):
        self.subpaths = _parse(path)


def _cubic(p0, p1, p2, p3, steps):
    points = []
    for index in range(1, steps + 1):
        t = index / steps
        u = 1 - t
        points.append((u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
                       u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]))
    return points


def _parse(path: str):
    tokens = re.findall(r'[MCZLmczl]|-?\d*\.?\d+(?:e-?\d+)?', path)
    subpaths, current, command, index = [], None, None, 0
    numbers = []

    def flush_numbers():
        nonlocal numbers, current
        if command == 'M' and len(numbers) >= 2:
            current = {'points': [(numbers[0], numbers[1])], 'closed': False}
            subpaths.append(current)
            numbers = numbers[2:]
        if command == 'L':
            while len(numbers) >= 2 and current:
                current['points'].append((numbers[0], numbers[1]))
                numbers = numbers[2:]
        if command == 'C':
            while len(numbers) >= 6 and current:
                start = current['points'][-1]
                c1, c2, end = (numbers[0], numbers[1]), (numbers[2], numbers[3]), (numbers[4], numbers[5])
                span = abs(end[0] - start[0]) + abs(end[1] - start[1]) + abs(c1[0] - start[0]) + abs(c2[1] - end[1])
                current['points'].extend(_cubic(start, c1, c2, end, max(8, min(96, int(span / 4)))))
                numbers = numbers[6:]

    while index < len(tokens):
        token = tokens[index]
        if token.isalpha():
            flush_numbers()
            command = token.upper()
            numbers = []
            if command == 'Z' and current:
                current['closed'] = True
        else:
            numbers.append(float(token))
            if command in ('M', 'L', 'C'):
                flush_numbers()
        index += 1
    return subpaths


class Draw:
    def __init__(self, image: Image.Image, *args):
        self.image = image
        width, height = image.size
        self.scale = 4 if width * height <= 4_000_000 else 2
        self.canvas = Image.new('L', (width * self.scale, height * self.scale), 0)
        self.draw = ImageDraw.Draw(self.canvas)

    def symbol(self, xy, symbol: Symbol, pen: Pen | None = None, brush: Brush | None = None):
        s = self.scale
        ox, oy = xy
        for subpath in symbol.subpaths:
            points = [((x + ox) * s, (y + oy) * s) for x, y in subpath['points']]
            if len(points) < 2:
                continue
            if brush is not None and len(points) >= 3:
                self.draw.polygon(points, fill=int(brush.color))
            if pen is not None:
                line = points + ([points[0]] if subpath['closed'] else [])
                self.draw.line(line, fill=int(pen.color), width=max(1, round(pen.width * s)), joint='curve')

    def flush(self):
        reduced = self.canvas.resize(self.image.size, Image.Resampling.BOX)
        self.image.paste(Image.composite(reduced, self.image, reduced), (0, 0))
        return self.image
