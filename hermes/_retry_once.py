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
    banner_timeout=25,
    auth_timeout=25,
)


def run(cmd, timeout=120):
    print(">>", cmd[:200].replace("\n", " "))
    _, out, err = ssh.exec_command(cmd, timeout=timeout)
    code = out.channel.recv_exit_status()
    text = (out.read() + err.read()).decode("utf-8", "replace")
    if text.strip():
        print(text[-5000:])
    print("exit", code)
    return code, text


sftp = ssh.open_sftp()
sftp.put("hermes/hermes.ts", REMOTE + "/hermes/hermes.ts")
sftp.put("hermes/compose-grid.py", REMOTE + "/hermes/compose-grid.py")
print("uploaded", sftp.stat(REMOTE + "/hermes/hermes.ts").st_size)
sftp.close()

run(
    r"""python3 - <<"PY"
import json, urllib.request, urllib.parse
env={}
for line in open("/var/www/you-stile/you-stile/hermes/.env", encoding="utf-8"):
    line=line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k,v=line.split("=",1)
    env[k.strip()]=v.strip().strip('"').strip("'")
token=env.get("HERMES_TG_TOKEN","")
chat=env.get("HERMES_TG_CHAT_ID","")
log=json.load(open("/var/www/you-stile/you-stile/hermes/data/hermes-log.json"))
posts=log.get("posts") or []
print("LAST", [(p.get("tgMessageId"), (p.get("title") or "")[:60]) for p in posts[-4:]])
ids=[]
for p in posts[-3:]:
    mid=p.get("tgMessageId")
    if mid: ids.extend([int(mid), int(mid)+1])
ids=sorted(set(ids), reverse=True)
print("delete", ids)
for mid in ids:
    url="https://api.telegram.org/bot%s/deleteMessage"%token
    data=urllib.parse.urlencode({"chat_id":chat,"message_id":mid}).encode()
    try:
        r=urllib.request.urlopen(url, data=data, timeout=20)
        j=json.loads(r.read().decode())
        print("deleted" if j.get("ok") else j, mid)
    except Exception as e:
        print("skip", mid, str(e)[:70])
p="/var/www/you-stile/you-stile/hermes/data/published-rss.json"
arr=json.load(open(p))
print("published before", len(arr))
arr=arr[:-2] if len(arr)>=2 else []
json.dump(arr, open(p,"w"), ensure_ascii=False, indent=2)
print("published after", len(arr))
PY""",
    timeout=60,
)
run("pm2 restart hermes --update-env")
print("publishing once...")
run(
    "cd /var/www/you-stile/you-stile && node ./node_modules/tsx/dist/cli.cjs hermes/hermes.ts --once",
    timeout=480,
)
ssh.close()
