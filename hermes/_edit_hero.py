from dotenv import load_dotenv
from pathlib import Path
import os
import sys
import paramiko

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
os.chdir(ROOT)
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REMOTE = "/var/www/you-stile/you-stile"
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

sftp = ssh.open_sftp()
sftp.put("hermes/_tmp/hero.jpg", REMOTE + "/hermes/_tmp_hero.jpg")
sftp.put("hermes/_tmp/caption.html", REMOTE + "/hermes/_tmp_caption.html")
print("uploaded", sftp.stat(REMOTE + "/hermes/_tmp_hero.jpg").st_size)
sftp.close()

cmd = r"""python3 - <<"PY"
import json, urllib.request
from pathlib import Path

env = {}
for line in open("/var/www/you-stile/you-stile/hermes/.env", encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k.strip()] = v.strip().strip('"').strip("'")
token = env.get("HERMES_TG_TOKEN", "")
chat = env.get("HERMES_TG_CHAT_ID", "")
raw = Path("/var/www/you-stile/you-stile/hermes/_tmp_caption.html").read_bytes()
caption = raw.decode("utf-16" if raw[1:2] == b"\x00" else "utf-8").lstrip("\ufeff")
photo = Path("/var/www/you-stile/you-stile/hermes/_tmp_hero.jpg").read_bytes()
media = json.dumps({
    "type": "photo",
    "media": "attach://hero.jpg",
    "caption": caption,
    "parse_mode": "HTML",
})
boundary = "----HermesEditHero7f3"
body = []

def add_field(name, value):
    body.append(f"--{boundary}\r\n".encode())
    body.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
    body.append(value.encode("utf-8") if isinstance(value, str) else value)
    body.append(b"\r\n")

add_field("chat_id", chat)
add_field("message_id", "115")
add_field("media", media)
body.append(f"--{boundary}\r\n".encode())
body.append(b'Content-Disposition: form-data; name="hero.jpg"; filename="hero.jpg"\r\n')
body.append(b"Content-Type: image/jpeg\r\n\r\n")
body.append(photo)
body.append(b"\r\n")
body.append(f"--{boundary}--\r\n".encode())
data = b"".join(body)
req = urllib.request.Request(
    f"https://api.telegram.org/bot{token}/editMessageMedia",
    data=data,
    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.loads(r.read().decode())
    print("ok" if j.get("ok") else j)
except Exception as e:
    body_err = e.read().decode("utf-8", "replace") if hasattr(e, "read") else str(e)
    print("ERR", body_err[:800])
PY"""

_, out, err = ssh.exec_command(cmd, timeout=80)
print((out.read() + err.read()).decode("utf-8", "replace"))
ssh.close()
