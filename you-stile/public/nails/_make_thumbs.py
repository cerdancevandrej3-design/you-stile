"""Make thumbnails of all nail designs for review.
Source: public/nails/ногти/*.png (2K, 3-5MB)
Output: public/nails/_review/thumb_*.jpg (600px, ~50KB)
"""
import os
import sys
from PIL import Image

SRC = r"C:\Users\and\Desktop\project\you-stile\you-stile\public\nails\ногти"
DST = r"C:\Users\and\Desktop\project\you-stile\you-stile\public\nails\_review"

os.makedirs(DST, exist_ok=True)

files = sorted([f for f in os.listdir(SRC) if f.lower().endswith(".png")])
print(f"Found {len(files)} PNG files")

ok = 0
fail = 0
for i, fname in enumerate(files, 1):
    src_path = os.path.join(SRC, fname)
    # skip duplicates like "t_xxx (1).png"
    if " (1)" in fname:
        continue
    # name thumb by index for easy batching
    dst_name = f"thumb_{i:03d}.jpg"
    dst_path = os.path.join(DST, dst_name)
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGB")
            # fit to 600px wide keeping aspect
            w, h = img.size
            new_w = 600
            new_h = int(h * new_w / w)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            img.save(dst_path, "JPEG", quality=82, optimize=True)
        ok += 1
    except Exception as e:
        print(f"FAIL {fname}: {e}")
        fail += 1

print(f"Done: {ok} ok, {fail} fail")

# write index mapping thumb_NNN.jpg -> original filename
idx_path = os.path.join(DST, "_index.txt")
with open(idx_path, "w", encoding="utf-8") as f:
    i = 0
    for fname in files:
        if " (1)" in fname:
            continue
        i += 1
        f.write(f"thumb_{i:03d}.jpg\t{fname}\n")
print(f"Index written to {idx_path}")
