"""Add 10 new nail designs (STIL-26-101-110) to public/nails-database.json
with ids 625-634 and matching thumbnails thumb_625-634.jpg.
"""
import json
from pathlib import Path

DB_PATH = Path(r"C:\Users\and\Desktop\project\you-stile\you-stile\public\nails-database.json")

# 10 new designs with metadata
NEW_DESIGNS = [
    {
        "id": 625, "filename": "STIL-26-101.jpg", "path": "/nails/all/STIL-26-101.jpg",
        "color": "фиолетовый", "complexity": "сложный",
        "tags": ["фиолетовый", "сложный", "миндальная", "длинные", "весенний", "мраморный", "глянцевый"]
    },
    {
        "id": 626, "filename": "STIL-26-102.jpg", "path": "/nails/all/STIL-26-102.jpg",
        "color": "зелёный", "complexity": "сложный",
        "tags": ["зелёный", "сложный", "миндальная", "длинные", "зимний", "кошачий глаз", "магнитный"]
    },
    {
        "id": 627, "filename": "STIL-26-103.jpg", "path": "/nails/all/STIL-26-103.jpg",
        "color": "розовый", "complexity": "средний",
        "tags": ["розовый", "средний", "квадратная", "средние", "летний", "желе", "глянцевый"]
    },
    {
        "id": 628, "filename": "STIL-26-104.jpg", "path": "/nails/all/STIL-26-104.jpg",
        "color": "чёрный", "complexity": "сложный",
        "tags": ["чёрный", "сложный", "стилет", "длинные", "зимний", "готика", "матовый"]
    },
    {
        "id": 629, "filename": "STIL-26-105.jpg", "path": "/nails/all/STIL-26-105.jpg",
        "color": "белый", "complexity": "средний",
        "tags": ["белый", "средний", "миндальная", "средние", "весенний", "перламутр", "глянцевый"]
    },
    {
        "id": 630, "filename": "STIL-26-106.jpg", "path": "/nails/all/STIL-26-106.jpg",
        "color": "белый", "complexity": "сложный",
        "tags": ["белый", "сложный", "миндальная", "длинные", "свадебный", "французский маникюр", "жемчуг", "стразы"]
    },
    {
        "id": 631, "filename": "STIL-26-107.jpg", "path": "/nails/all/STIL-26-107.jpg",
        "color": "бордовый", "complexity": "сложный",
        "tags": ["бордовый", "сложный", "миндальная", "длинные", "зимний", "бархат", "матовый"]
    },
    {
        "id": 632, "filename": "STIL-26-108.jpg", "path": "/nails/all/STIL-26-108.jpg",
        "color": "оранжевый", "complexity": "сложный",
        "tags": ["оранжевый", "сложный", "миндальная", "длинные", "летний", "градиент", "глянцевый"]
    },
    {
        "id": 633, "filename": "STIL-26-109.jpg", "path": "/nails/all/STIL-26-109.jpg",
        "color": "серебряный", "complexity": "сложный",
        "tags": ["серебряный", "сложный", "миндальная", "длинные", "зимний", "хром", "глянцевый"]
    },
    {
        "id": 634, "filename": "STIL-26-110.jpg", "path": "/nails/all/STIL-26-110.jpg",
        "color": "коричневый", "complexity": "средний",
        "tags": ["коричневый", "средний", "миндальная", "средние", "зимний", "кофе", "матовый"]
    },
]

with open(DB_PATH, "r", encoding="utf-8") as f:
    db = json.load(f)

print(f"Current db size: {len(db)}")
print(f"Max id before: {max(e.get('id', 0) for e in db)}")

# Check for existing ids
existing_ids = {e.get("id") for e in db}
for d in NEW_DESIGNS:
    if d["id"] in existing_ids:
        print(f"WARNING: id {d['id']} already exists, will be skipped")
        continue
    db.append(d)

print(f"New db size: {len(db)}")
print(f"Max id after: {max(e.get('id', 0) for e in db)}")

with open(DB_PATH, "w", encoding="utf-8") as f:
    json.dump(db, f, ensure_ascii=False, indent=2)

print("OK: nails-database.json updated")
