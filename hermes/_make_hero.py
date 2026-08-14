from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance, ImageFilter

src = Path(__file__).resolve().parent / "_tmp" / "full.jpg"
out = Path(__file__).resolve().parent / "_tmp" / "hero.jpg"
im = Image.open(src).convert("RGB")
w, h = im.size
target_w, target_h = 1080, 1350
scale = target_w / w
nw, nh = target_w, int(h * scale)
im = im.resize((nw, nh), Image.Resampling.LANCZOS)
if nh > target_h:
    # keep the face: crop extra from the bottom
    top = 40
    im = im.crop((0, top, target_w, top + target_h))
elif nh < target_h:
    im = ImageOps.pad(im, (target_w, target_h), color=(12, 12, 14))
im = ImageEnhance.Contrast(im).enhance(1.04)
im = ImageEnhance.Color(im).enhance(1.03)
im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=3))
im.save(out, "JPEG", quality=94, optimize=True)
print(out, im.size)
