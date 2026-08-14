import re
import urllib.request

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
urls = [
    "https://www.harpersbazaar.com/celebrity/latest/a73405188/demi-lovato-vintage-dolce-gabbana-dress-camp-rock-3-premiere-photos/",
    "https://t.me/s/stilist_ai_ru",
]
pats = [
    r'property="og:image" content="([^"]+)"',
    r'content="(https://hips\.hearstapps\.com[^"]+)"',
    r'(https://hips\.hearstapps\.com/hmg-prod/images/[^"\s]+)',
    r'src="(https://[^"]+\.(?:jpg|jpeg|webp)[^"]*)"',
]
for u in urls:
    print("===", u)
    req = urllib.request.Request(u, headers={"User-Agent": ua, "Accept": "text/html"})
    try:
        html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
    except Exception as e:
        print("ERR", e)
        continue
    print("html", len(html))
    if "t.me" in u:
        posts = re.findall(r'data-post="([^"]+)".*?datetime="([^"]+)"', html, re.S)
        print("posts", len(posts))
        for p in posts[-8:]:
            print(p)
        texts = re.findall(
            r'data-post="([^"]+)"[\s\S]{0,400}?tgme_widget_message_text[^>]*>([\s\S]{0,280})</div>',
            html,
        )
        for t in texts[-6:]:
            clean = re.sub("<[^>]+>", " ", t[1])
            clean = re.sub(r"\s+", " ", clean).strip()[:120]
            print(t[0], clean)
        continue
    seen = []
    for pat in pats:
        for m in re.findall(pat, html):
            if m not in seen and ("hearst" in m or "lovato" in m.lower() or "getty" in m.lower()):
                seen.append(m)
    for s in seen[:12]:
        print(s)
    if not seen:
        print("no match")
        print("og", re.findall(r'property="og:image" content="([^"]+)"', html)[:3])
