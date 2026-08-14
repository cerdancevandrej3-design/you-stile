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


def run(cmd, timeout=120):
    print(">>", cmd[:180].replace("\n", " "))
    _, out, err = ssh.exec_command(cmd, timeout=timeout)
    code = out.channel.recv_exit_status()
    text = (out.read() + err.read()).decode("utf-8", "replace")
    if text.strip():
        print(text[-6000:])
    print("exit", code)
    return code, text


sftp = ssh.open_sftp()
sftp.put("hermes/hermes.ts", REMOTE + "/hermes/hermes.ts")
sftp.put("hermes/compose-grid.py", REMOTE + "/hermes/compose-grid.py")
sftp.put("hermes/crop-hero.py", REMOTE + "/hermes/crop-hero.py")
print("uploaded", sftp.stat(REMOTE + "/hermes/hermes.ts").st_size)
sftp.close()
run("pm2 restart hermes --update-env")
print("publishing once...")
run(
    "cd /var/www/you-stile/you-stile && node ./node_modules/tsx/dist/cli.cjs hermes/hermes.ts --once",
    timeout=480,
)
ssh.close()
