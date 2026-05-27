import paramiko
import io
import os

host = "186.246.31.126"
user = "root"
password = "yWET?HM-g1^KMW"
remote_dir = "/var/www/you-stile/you-stile"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=password)

# Upload server.ts
with open(r"c:\Users\and\Desktop\project\you-stile\you-stile\server.ts", "rb") as f:
    content = f.read()
sftp = client.open_sftp()
sftp.putfo(io.BytesIO(content), f"{remote_dir}/server.ts")
sftp.close()

# Upload dist folder
for root, dirs, files in os.walk(r"c:\Users\and\Desktop\project\you-stile\you-stile\dist"):
    for file in files:
        local_path = os.path.join(root, file)
        remote_path = os.path.join(f"{remote_dir}/dist", os.path.relpath(local_path, r"c:\Users\and\Desktop\project\you-stile\you-stile\dist"))
        with open(local_path, "rb") as f:
            content = f.read()
        sftp = client.open_sftp()
        sftp.putfo(io.BytesIO(content), remote_path)
        sftp.close()

# Restart PM2
stdin, stdout, stderr = client.exec_command(f"cd {remote_dir} && pm2 restart stilist")
output = stdout.read().decode('utf-8', errors='replace')

with open(r"C:\Temp\deploy_done.txt", "w", encoding="utf-8") as f:
    f.write(output)

client.close()
print("Deploy done!")
