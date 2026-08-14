from pathlib import Path

from PIL import Image, ImageOps, ImageEnhance, ImageFilter



src = Path(__file__).resolve().parent / "_tmp" / "bazaar1.jpg"

out = Path(__file__).resolve().parent / "_tmp" / "hero.jpg"

im = Image.open(src).convert("RGB")

w, h = im.size

need_h = int(w / (1080 / 1350))

if need_h < h:

    top = h - need_h

    im = im.crop((0, top, w, h))

im = ImageOps.fit(im, (1080, 1350), Image.Resampling.LANCZOS)

im = ImageEnhance.Contrast(im).enhance(1.04)

im = ImageEnhance.Color(im).enhance(1.03)

im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=3))

im.save(out, "JPEG", quality=94, optimize=True)

print(out, im.size)

