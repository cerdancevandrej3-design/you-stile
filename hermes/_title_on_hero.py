from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance, ImageFilter



src = Path(__file__).resolve().parent / "_tmp" / "bazaar1.jpg"

out = Path(__file__).resolve().parent / "_tmp" / "hero.jpg"

W, H, BAR = 1080, 1350, 280

photo = Image.open(src).convert("RGB")

photo = ImageOps.fit(photo, (W, H - BAR), Image.Resampling.LANCZOS, centering=(0.5, 0.42))

photo = ImageEnhance.Contrast(photo).enhance(1.04)

photo = ImageEnhance.Color(photo).enhance(1.03)

photo = photo.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=3))

im = Image.new("RGB", (W, H), (8, 8, 10))

im.paste(photo, (0, BAR))

draw = ImageDraw.Draw(im)

font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 120)

text = "ЭНН ХЭТЭУЭЙ"

bbox = draw.textbbox((0, 0), text, font=font)

tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

while tw > W - 40:

    font = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", font.size - 2)

    bbox = draw.textbbox((0, 0), text, font=font)

    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

x = (W - tw) // 2

y = (BAR - th) // 2 - 6

draw.text((x, y), text, font=font, fill=(255, 255, 255))

im.save(out, "JPEG", quality=94, optimize=True)

print(out, font.size, tw, th)

