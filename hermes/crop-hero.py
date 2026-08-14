#!/usr/bin/env python3
"""2:3 editorial crop: face + the outfit/product the post is about."""
import sys
from PIL import Image, ImageOps, ImageEnhance, ImageFilter

if len(sys.argv) < 3:
    sys.exit("usage: crop-hero.py out.jpg src.jpg [face|center]")

out, src = sys.argv[1], sys.argv[2]
mode = (sys.argv[3] if len(sys.argv) > 3 else "face").strip().lower()
# face: keep head; center: manicure / product — hands stay in frame
centering = (0.5, 0.5) if mode == "center" else (0.5, 0.22)
im = Image.open(src).convert("RGB")
im = ImageOps.fit(im, (1080, 1620), Image.Resampling.LANCZOS, centering=centering)
im = ImageEnhance.Contrast(im).enhance(1.04)
im = ImageEnhance.Color(im).enhance(1.03)
im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=3))
im.save(out, "JPEG", quality=94, optimize=True)
print(out)
