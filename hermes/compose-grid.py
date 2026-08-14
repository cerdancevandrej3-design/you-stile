#!/usr/bin/env python3
"""3x2 magazine grid: portrait | detail, three rows. Ivory gaps."""
import sys
from PIL import Image, ImageOps

if len(sys.argv) < 3:
    sys.exit("usage: compose-grid.py out.jpg img1 img2 ...")

out = sys.argv[1]
files = sys.argv[2:8]
cols = 2
rows = max(1, (len(files) + 1) // 2)
cell = 800
gap = 18
w = cols * cell + (cols + 1) * gap
h = rows * cell + (rows + 1) * gap
canvas = Image.new("RGB", (w, h), (249, 248, 246))

for i, fp in enumerate(files):
    im = Image.open(fp).convert("RGB")
    im = ImageOps.fit(im, (cell, cell), Image.Resampling.LANCZOS)
    r, c = divmod(i, cols)
    x = gap + c * (cell + gap)
    y = gap + r * (cell + gap)
    canvas.paste(im, (x, y))

canvas.save(out, "JPEG", quality=93, optimize=True)
print(out)
