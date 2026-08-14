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
for rel in ["hermes/hermes.ts", "hermes/crop-hero.py"]:
    sftp.put(rel, f"{REMOTE}/{rel}")
    print("uploaded", rel, sftp.stat(f"{REMOTE}/{rel}").st_size)
sftp.close()
_, out, err = ssh.exec_command("pm2 restart hermes --update-env", timeout=30)
print((out.read() + err.read()).decode("utf-8", "replace")[-1500:])
_, out, err = ssh.exec_command(
    "python3 - <<'PY'\n"
    "env={}\n"
    "for line in open('/var/www/you-stile/you-stile/hermes/.env', encoding='utf-8'):\n"
    "    line=line.strip()\n"
    "    if not line or line.startswith('#') or '=' not in line: continue\n"
    "    k,v=line.split('=',1)\n"
    "    env[k.strip()]=v.strip().strip('\"').strip(\"'\")\n"
    "print('MODE', env.get('MODE','?'))\n"
    "print('DRY_RUN', env.get('DRY_RUN','?'))\n"
    "print('AGE', env.get('HERMES_NEWS_MAX_AGE_DAYS','14'))\n"
    "PY\n"
    "sleep 4; pm2 logs hermes --lines 25 --nostream",
    timeout=25,
)
print((out.read() + err.read()).decode("utf-8", "replace")[-2500:])
ssh.close()
