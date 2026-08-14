"""Generate thumbnails for new/regenerated nail designs.
Source: public/nails/all/STIL-26-XXX.jpg
Output: public/nails/all/thumb_XXX.jpg (600px wide, ~50KB)
"""
import os
from PIL import Image

SRC = r"C:\Users\and\Desktop\project\you-stile\you-stile\public\nails\all"

# Files that need thumbnails (10 new + 19 regenerated, minus ones that already have thumbs)
NEED_THUMB = [
    # 10 new
    "STIL-26-101.jpg", "STIL-26-102.jpg", "STIL-26-103.jpg", "STIL-26-104.jpg", "STIL-26-105.jpg",
    "STIL-26-106.jpg", "STIL-26-107.jpg", "STIL-26-108.jpg", "STIL-26-109.jpg", "STIL-26-110.jpg",
    # 19 regenerated (some thumbs exist but are stale - regenerate all)
    "STIL-26-005.jpg", "STIL-26-007.jpg", "STIL-26-013.jpg", "STIL-26-024.jpg", "STIL-26-026.jpg",
    "STIL-26-028.jpg", "STIL-26-033.jpg", "STIL-26-034.jpg", "STIL-26-037.jpg", "STIL-26-042.jpg",
    "STIL-26-047.jpg", "STIL-26-062.jpg", "STIL-26-063.jpg", "STIL-26-065.jpg", "STIL-26-068.jpg",
    "STIL-26-079.jpg", "STIL-26-081.jpg", "STIL-26-082.jpg", "STIL-26-087.jpg",
]

ok = 0
fail = 0
for fname in NEED_THUMB:
    src_path = os.path.join(SRC, fname)
    if not os.path.exists(src_path):
        print(f"MISSING source: {fname}")
        fail += 1
        continue
    # extract id number from STIL-26-XXX.jpg
    try:
        id_num = int(fname.replace("STIL-26-", "").replace(".jpg", ""))
    except ValueError:
        print(f"BAD filename: {fname}")
        fail += 1
        continue
    dst_name = f"thumb_{id_num:03d}.jpg"
    dst_path = os.path.join(SRC, dst_name)
    try:
        with Image.open(src_path) as img:
            img = img.convert("RGB")
            w, h = img.size
            new_w = 600
            new_h = int(h * new_w / w)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            img.save(dst_path, "JPEG", quality=82, optimize=True)
        ok += 1
        print(f"OK {fname} -> {dst_name}")
    except Exception as e:
        print(f"FAIL {fname}: {e}")
        fail += 1

print(f"\nDone: {ok} ok, {fail} fail")
