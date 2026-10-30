from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
AI_BG = ROOT / "public" / "generated-demo" / "reconstructed-background-v01.png"
SEG = ROOT / "local-ai" / "experiments" / "新主视觉-SAM2对象拆分"
OUT = ROOT / "public" / "generated-demo"
OUT.mkdir(parents=True, exist_ok=True)


def alpha_crop(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    box = alpha.getbbox()
    return image.crop(box)


def contain(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    scale = min(max_width / image.width, max_height / image.height)
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)


def save_jpeg_under(image: Image.Image, path: Path, max_bytes: int) -> tuple[int, int]:
    for quality in range(92, 35, -2):
        image.convert("RGB").save(path, "JPEG", quality=quality, optimize=True, progressive=True)
        if path.stat().st_size <= max_bytes:
            return quality, path.stat().st_size
    raise RuntimeError(f"cannot compress {path.name} below {max_bytes} bytes")


# The generative model is restricted to background/character reconstruction.
# Exact title and logo pixels are restored from the supplied artwork afterwards.
source = Image.open(AI_BG).convert("RGB")
target_ratio = 1920 / 550
crop_height = round(source.width / target_ratio)
crop_top = 126
crop_top = min(crop_top, source.height - crop_height)
banner = source.crop((0, crop_top, source.width, crop_top + crop_height)).resize((1920, 550), Image.Resampling.LANCZOS).convert("RGBA")

title_left = contain(alpha_crop(SEG / "1_标题左列_抠图.png"), 122, 260)
title_right = contain(alpha_crop(SEG / "2_标题右列_抠图.png"), 112, 260)
title_y = 72
title_x = 1160
banner.alpha_composite(title_left, (title_x, title_y))
banner.alpha_composite(title_right, (title_x + 126, title_y + 3))

logo = contain(alpha_crop(SEG / "3_项目Logo_抠图.png"), 126, 126)
banner.alpha_composite(logo, (1418, 56))

# Enforce the specification's bottom 64px white gradient after all visual work.
gradient = Image.new("RGBA", (1920, 64), (255, 255, 255, 0))
gradient_pixels = gradient.load()
for y in range(64):
    alpha = round(255 * ((y + 1) / 64) ** 1.35)
    for x in range(1920):
        gradient_pixels[x, y] = (255, 255, 255, alpha)
banner.alpha_composite(gradient, (0, 486))

banner_path = OUT / "赘婿_37网游平台首页头图_1920x550_V01.jpg"
quality, banner_bytes = save_jpeg_under(banner, banner_path, 600 * 1024)

# Page-effect preview: platform overlays are simulated here and never baked into the Banner.
preview = banner.convert("RGB")
draw = ImageDraw.Draw(preview, "RGBA")
draw.rounded_rectangle((326, 0, 614, 286), radius=8, fill=(248, 248, 248, 242), outline=(205, 205, 205, 255), width=2)
draw.ellipse((350, 24, 420, 94), fill=(70, 43, 43, 255))
for y, w in [(118, 220), (148, 242), (178, 205), (208, 235)]:
    draw.rounded_rectangle((350, y, 350 + w, y + 13), radius=6, fill=(216, 216, 216, 255))
draw.rounded_rectangle((350, 242, 474, 270), radius=6, fill=(241, 101, 68, 255))
draw.rectangle((326, 352, 1574, 550), fill=(252, 252, 252, 248))
draw.line((326, 352, 1574, 352), fill=(220, 220, 220, 255), width=2)
draw.rectangle((350, 378, 560, 398), fill=(224, 224, 224, 255))
for x in (350, 650, 950, 1250):
    draw.rounded_rectangle((x, 418, x + 250, 528), radius=7, fill=(235, 235, 235, 255))

preview_path = OUT / "赘婿_37网游平台首页头图_页面效果预览_V01.jpg"
preview.convert("RGB").save(preview_path, "JPEG", quality=88, optimize=True, progressive=True)

print({
    "banner": str(banner_path),
    "banner_size": list(banner.size),
    "banner_bytes": banner_bytes,
    "jpeg_quality": quality,
    "preview": str(preview_path),
    "preview_size": list(preview.size),
})
