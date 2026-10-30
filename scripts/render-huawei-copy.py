"""Render the Huawei community instruction with the supplied HarmonyHeiTi font."""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main():
    root = Path(__file__).resolve().parent.parent
    font_path = root / "渠道资源位" / "华为资源位" / "鸿蒙-社区字体" / "鸿蒙黑体" / "Harmony-Medium-0326.ttf"
    font = ImageFont.truetype(str(font_path), 35)
    canvas = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((64, 957, 794, 1023), radius=14, fill=(16, 32, 57, 209))
    draw.text((86, 969), "点击【查看详情】跳转华为应用市场", font=font, fill=(255, 255, 255, 255))
    target = Path(sys.argv[1])
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target)


if __name__ == "__main__":
    main()
