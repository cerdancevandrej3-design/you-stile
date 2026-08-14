from pathlib import Path

import urllib.request



out = Path(__file__).resolve().parent / "_tmp"

out.mkdir(exist_ok=True)

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

ref = "https://www.harpersbazaar.com/"

url = "https://hips.hearstapps.com/hmg-prod/images/7d95b008-84b6-4bfc-9b19-4a21eeda4d04.jpeg?crop=0.665xw:0.838xh;0.335xw,0.128xh&resize=1600:*"

req = urllib.request.Request(

    url,

    headers={"User-Agent": ua, "Referer": ref, "Accept": "image/*,*/*"},

)

data = urllib.request.urlopen(req, timeout=30).read()

(out / "full.jpg").write_bytes(data)

print("full.jpg", len(data))

