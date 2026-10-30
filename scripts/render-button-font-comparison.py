from pathlib import Path
import json
import sys

from PIL import Image, ImageDraw, ImageFont


root = Path(__file__).resolve().parents[1]
policy = json.loads((root / "config/font-policies.json").read_text(encoding="utf-8"))[0]
base = Image.open(root / "data/fonts/menghui-zhenhuan/button-base-blank.png").convert("RGBA")
output = root / "docs/font-tests/menghui-zhenhuan"
output.mkdir(parents=True, exist_ok=True)
copy = sys.argv[1] if len(sys.argv) > 1 else "立即下载"


def fitted_font(font_path: Path, text: str, max_width: int, max_height: int):
    for size in range(62, 19, -1):
        font = ImageFont.truetype(str(font_path), size=size)
        box = font.getbbox(text, stroke_width=3)
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            return font
    raise RuntimeError(f"Cannot fit text with {font_path}")


previews = []
for index, entry in enumerate(policy["licensedFonts"]):
    font_path = root / entry["file"]
    font = fitted_font(font_path, copy, 270, 60)
    image = base.copy()
    draw = ImageDraw.Draw(image)
    box = draw.textbbox((0, 0), copy, font=font, stroke_width=3)
    width = box[2] - box[0]
    height = box[3] - box[1]
    x = (image.width - width) / 2 - box[0]
    y = (image.height - height) / 2 - box[1] - 1
    draw.text((x + 1, y + 3), copy, font=font, fill="#7f211b", stroke_width=4, stroke_fill="#7f211b")
    draw.text((x, y), copy, font=font, fill="#fff8e8", stroke_width=3, stroke_fill="#c04424")
    filename = f"{index + 1}-{entry['family']}-{copy}.png"
    image.save(output / filename, optimize=True)
    previews.append((entry["family"], image, filename))

fallback_path = root / policy["fallback"]["file"]
label_font = ImageFont.truetype(str(fallback_path), size=18)
sheet = Image.new("RGB", (860, 340), "#f3f4f6")
sheet_draw = ImageDraw.Draw(sheet)
for index, (family, image, _) in enumerate(previews):
    column = index % 2
    row = index // 2
    left = 25 + column * 420
    top = 20 + row * 160
    sheet.alpha_composite(image, (left, top)) if sheet.mode == "RGBA" else sheet.paste(image, (left, top), image)
    sheet_draw.text((left, top + 112), family, font=label_font, fill="#111827")
sheet.save(output / f"按钮字体对比-{copy}.png", optimize=True)
print(output / f"按钮字体对比-{copy}.png")
