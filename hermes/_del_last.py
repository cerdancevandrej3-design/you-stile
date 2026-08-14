from dotenv import load_dotenv
from pathlib import Path
import os
import sys
import paramiko

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
os.chdir(ROOT)
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    os.environ["DEPLOY_SSH_HOST"],
    username=os.environ["DEPLOY_SSH_USER"],
    port=int(os.environ.get("DEPLOY_SSH_PORT", "22")),
    key_filename=os.environ["DEPLOY_SSH_KEY"],
    passphrase=os.environ.get("DEPLOY_SSH_PASSPHRASE") or None,
    timeout=25,
)

cmd = r"""python3 - <<"PY"
import json, urllib.request, urllib.parse
env={}
for line in open("/var/www/you-stile/you-stile/hermes/.env", encoding="utf-8"):
    line=line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k,v=line.split("=",1)
    env[k.strip()]=v.strip().strip('"').strip("'")
token=env.get("HERMES_TG_TOKEN","")
chat=env.get("HERMES_TG_CHAT_ID","")
import re
req=urllib.request.Request("https://t.me/s/stilist_ai_ru", headers={"User-Agent":"Mozilla/5.0"})
html=urllib.request.urlopen(req, timeout=25).read().decode("utf-8","replace")
posts=re.findall(r'data-post="stilist_ai_ru/(\d+)"', html)
print("ids", posts[-8:])
chunks=re.findall(r'data-post="stilist_ai_ru/(\d+)"[\s\S]{0,2500}?tgme_widget_message_text[^>]*>([\s\S]{0,400})</div>', html)
last_txt=""
target=int(posts[-1]) if posts else None
for mid, txt in chunks:
    clean=re.sub("<[^>]+>"," ", txt)
    clean=re.sub(r"\s+"," ", clean).strip()[:80]
    print(mid, clean)
    if "адженс" in txt or "Vanessa" in txt or "ХАДЖЕНС" in txt:
        target=int(mid)
        last_txt=clean
print("last", target, last_txt)
ids=[target] if target else []
if target:
    ids.append(target+1)
print("delete", ids)
for mid in ids:
    url="https://api.telegram.org/bot%s/deleteMessage"%token
    data=urllib.parse.urlencode({"chat_id":chat,"message_id":mid}).encode()
    try:
        r=urllib.request.urlopen(url, data=data, timeout=20)
        j=json.loads(r.read().decode())
        print("deleted" if j.get("ok") else j, mid)
    except Exception as e:
        print("skip", mid, str(e)[:80])
PY"""
_, out, err = ssh.exec_command(cmd, timeout=40)
print((out.read() + err.read()).decode("utf-8", "replace"))
ssh.close()
