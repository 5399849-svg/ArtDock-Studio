from pathlib import Path
import sys

from PIL import Image, ImageFilter


source = Path(sys.argv[1])
target = Path(sys.argv[2])
target_width = int(sys.argv[3]) if len(sys.argv) > 3 else 369
target_height = int(sys.argv[4]) if len(sys.argv) > 4 else 102
background_mode = sys.argv[5] if len(sys.argv) > 5 else "checker"
image = Image.open(source).convert("RGB")
width, height = image.size
pixels = image.load()
alpha = Image.new("L", image.size, 0)
alpha_pixels = alpha.load()

# The image editor preview may bake its checkerboard into RGB. Recover the
# continuous red/gold button silhouette column by column and keep its interior.
for x in range(width):
    hits = []
    for y in range(height):
        red, green, blue = pixels[x, y]
        maximum = max(red, green, blue)
        minimum = min(red, green, blue)
        saturation = (maximum - minimum) / max(1, maximum)
        foreground = (maximum > 18) if background_mode == "black" else (saturation > 0.16 and (red > 105 or green > 70))
        if foreground:
            hits.append(y)
    if hits:
        top = max(0, min(hits) - 3)
        bottom = min(height - 1, max(hits) + 3)
        for y in range(top, bottom + 1):
            alpha_pixels[x, y] = 255

alpha = alpha.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(2))
image.putalpha(alpha)
image = image.crop(image.getbbox())
image.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
canvas = Image.new("RGBA", (target_width, target_height))
canvas.alpha_composite(image, ((target_width - image.width) // 2, (target_height - image.height) // 2))
target.parent.mkdir(parents=True, exist_ok=True)
canvas.save(target, optimize=True)
print(f"{target}: {canvas.mode} {canvas.size} {target.stat().st_size} bytes")
