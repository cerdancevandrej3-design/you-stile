import urllib.request
from pathlib import Path

out = Path(__file__).resolve().parent / "_tmp"
out.mkdir(exist_ok=True)
ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
cands = {
    "bazaar1.jpg": "https://hips.hearstapps.com/hmg-prod/images/7710d98d-da83-4771-9434-2ea48fc8901a.jpeg",
    "bazaar2.jpg": "https://hips.hearstapps.com/hmg-prod/images/aad220a9-d56b-4feb-a2f6-d6c461093faf.jpeg",
    "cosmo1.jpg": "https://hips.hearstapps.com/hmg-prod/images/d6f63b7a-d343-44cc-a907-61c48892d910.jpeg",
    "cosmo2.jpg": "https://hips.hearstapps.com/hmg-prod/images/4382509e-4318-4065-9ab1-554cd925100e.jpeg",
    "cosmo3.jpg": "https://hips.hearstapps.com/hmg-prod/images/a3d71995-7669-4bf4-93a2-4d638a3bba3d.jpg",
    "cosmo4.jpg": "https://hips.hearstapps.com/hmg-prod/images/112de3ea-00e5-46d0-bfb2-083076144861.jpg",
    "deadline.jpg": "https://deadline.com/wp-content/uploads/2026/08/GettyImages-2289787582.jpg",
}
for name, url in cands.items():
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Referer": "https://www.harpersbazaar.com/", "Accept": "image/*,*/*"})
    try:
        data = urllib.request.urlopen(req, timeout=30).read()
        (out / name).write_bytes(data)
        print(name, len(data))
    except Exception as e:
        print(name, "ERR", e)
