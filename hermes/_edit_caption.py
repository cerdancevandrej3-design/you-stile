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







sftp.put("hermes/_tmp/caption.html", REMOTE + "/hermes/_tmp_caption.html")







print("uploaded caption")







sftp.close()















cmd = r"""python3 - <<"PY"







import json, urllib.request, urllib.parse







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







url = "https://api.telegram.org/bot%s/editMessageCaption" % token







data = urllib.parse.urlencode({







    "chat_id": chat,







    "message_id": 115,







    "caption": caption,







    "parse_mode": "HTML",







}).encode()







try:







    r = urllib.request.urlopen(url, data=data, timeout=30)







    j = json.loads(r.read().decode())







    print("ok" if j.get("ok") else j)







except Exception as e:







    body = ""







    if hasattr(e, "read"):







        try:







            body = e.read().decode("utf-8", "replace")[:400]







        except Exception:







            body = ""







    print("err", str(e)[:120], body)







PY"""















_, out, err = ssh.exec_command(cmd, timeout=50)







print((out.read() + err.read()).decode("utf-8", "replace"))







ssh.close()







