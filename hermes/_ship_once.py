"""Upload Hermes news code, delete last Telegram post, publish one new digest."""
from dotenv import load_dotenv
from pathlib import Path
import json
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
    banner_timeout=25,
    auth_timeout=25,
)


def run(cmd, timeout=120):
    print(">>", cmd[:180].replace("\n", " "))
    _, out, err = ssh.exec_command(cmd, timeout=timeout)
    code = out.channel.recv_exit_status()
    text = (out.read() + err.read()).decode("utf-8", "replace")
    if text.strip():
        print(text[-4000:])
    if code != 0:
        print("exit", code)
    return code, text


sftp = ssh.open_sftp()
for rel in ["hermes/hermes.ts", "hermes/compose-grid.py"]:
    sftp.put(rel, f"{REMOTE}/{rel}")
    print("uploaded", rel, sftp.stat(f"{REMOTE}/{rel}").st_size)
sftp.close()

# Last post ids from server log
_, out, _ = ssh.exec_command(
    f"python3 - <<'PY'\n"
    "import json\n"
    f"log=json.load(open('{REMOTE}/hermes/data/hermes-log.json'))\n"
    "posts=log.get('posts') or []\n"
    "last=posts[-6:] if posts else []\n"
    "for p in last:\n"
    "    print(p.get('tgMessageId'), '|', (p.get('title') or '')[:80], '|', p.get('ts'))\n"
    "PY\n"
)
print(out.read().decode("utf-8", "replace"))

run(
    f"""python3 - <<'PY'
import json, urllib.request, urllib.parse
env={{}}
for line in open('{REMOTE}/hermes/.env', encoding='utf-8'):
    line=line.strip()
    if not line or line.startswith('#') or '=' not in line: continue
    k,v=line.split('=',1)
    env[k.strip()]=v.strip().strip('"').strip("'")
token=env.get('HERMES_TG_TOKEN','')
chat=env.get('HERMES_TG_CHAT_ID','')
ids=[]
log=json.load(open('{REMOTE}/hermes/data/hermes-log.json'))
posts=log.get('posts') or []
for p in posts[-4:]:
    mid=p.get('tgMessageId')
    if mid: ids.append(int(mid))
extra=[]
for i in ids:
    extra.extend([i, i+1, i+2])
ids=sorted(set(extra), reverse=True)
print('try delete', ids)
ok=[]
for mid in ids:
    url='https://api.telegram.org/bot%s/deleteMessage'%token
    data=urllib.parse.urlencode({{'chat_id': chat, 'message_id': mid}}).encode()
    try:
        r=urllib.request.urlopen(url, data=data, timeout=20)
        j=json.loads(r.read().decode())
        if j.get('ok'):
            ok.append(mid)
            print('deleted', mid)
    except Exception as e:
        print('skip', mid, str(e)[:80])
print('deleted_ok', ok)
PY""",
    timeout=60,
)

run("python3 -c 'from PIL import Image, ImageOps; print(\"PIL ok\")' || apt-get install -y python3-pil >/dev/null && python3 -c 'from PIL import Image; print(\"PIL installed\")'")
run("which ffmpeg || echo 'no ffmpeg'")
run("pm2 restart hermes --update-env")
print("publishing once...")
code, text = run(
    f"cd {REMOTE} && node ./node_modules/tsx/dist/cli.cjs hermes/hermes.ts --once",
    timeout=420,
)
print("once exit", code)
ssh.close()
