#!/usr/bin/env python3
"""Deploy you-stile to VPS. Run from you-stile/ directory."""
import paramiko, os, sys

HOST = '186.246.31.126'
USER = 'root'
PASSWORD = 'yWET?HM-g1^KMW'
REMOTE = '/var/www/you-stile/you-stile'

def upload_dir(sftp, local_dir, remote_dir):
    for entry in os.scandir(local_dir):
        remote_path = f"{remote_dir}/{entry.name}"
        if entry.is_dir():
            try: sftp.mkdir(remote_path)
            except: pass
            upload_dir(sftp, entry.path, remote_path)
        else:
            sftp.put(entry.path, remote_path)
            print(f"  {entry.path.replace(local_dir, '').lstrip(os.sep)}")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)
sftp = ssh.open_sftp()

# 1. Upload server.ts
print("Uploading server.ts...")
sftp.put('server.ts', f'{REMOTE}/server.ts')

# 2. Build
print("Building...")
_, out, err = ssh.exec_command(f'cd {REMOTE} && npm run build 2>&1')
out.channel.recv_exit_status()
sys.stdout.buffer.write(out.read()[-500:])

# 3. Sync dist/
print("Syncing dist/...")
local_dist = 'dist'
upload_dir(sftp, local_dist, f'{REMOTE}/dist')

sftp.close()

# 4. Restart
print("Restarting pm2...")
_, out, _ = ssh.exec_command('pm2 restart stilist --update-env')
out.channel.recv_exit_status()
sys.stdout.buffer.write(out.read())

ssh.close()
print("\nDone! https://stilist-ai.ru")
