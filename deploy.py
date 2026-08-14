#!/usr/bin/env python3
"""Deploy you-stile to VPS. Run from you-stile/ directory.

Безопасность:
- Никаких паролей/токенов в коде. Все реквизиты — из переменных окружения или .env.
- Перед запуском: убедись, что .env существует и содержит DEPLOY_SSH_*.

Ускоренный деплой:
- Заливает только исходники (server.ts, src/, package.json, vite.config.ts и т.д.)
- Сборка (npm run build) происходит НА СЕРВЕРЕ — не гоняем 1.4 ГБ картинок по сети
- dist/manicure/ и dist/nails/ не трогает (они уже на сервере)
- manicure/data.json + categories.json обновляет всегда (они маленькие)
"""
import os
import sys
import subprocess
from pathlib import Path

# Загружаем .env, если есть (иначе берём из process env)
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

import paramiko

REMOTE = '/var/www/you-stile/you-stile'

# Локальные пути, которые нужно положить в REMOTE на сервере
SYNC_PATHS = ['server.ts', 'nails-subscription.ts', 'src', 'package.json', 'package-lock.json', 'vite.config.ts',
              'tsconfig.json', 'tailwind.config.js', 'postcss.config.js', 'index.html',
              'public', 'data', 'build-manicure-data.mjs', 'hermes', 'ecosystem.config.cjs']

# Что НЕ заливаем из public/ (тяжёлые картинки, уже на сервере).
SKIP_IN_PUBLIC = {'nails', 'hermes'}
# Что НЕ заливаем из hermes/ (рантайм-логи/кэш на сервере).
SKIP_IN_HERMES = {'data', 'node_modules', '.env'}
NAILS_META_FILES = [
    'public/nails/catalog.json',
    'public/nails/nails-data.json',
    'public/nails/all/index.json',
]


def _require_env(name: str) -> str:
    """Получить обязательную переменную окружения или завершить работу с понятной ошибкой."""
    value = (os.environ.get(name) or "").strip()
    if not value:
        print(f"[ERROR] Не задана переменная окружения {name}.")
        print("Положи её в .env рядом с deploy.py или экспортируй перед запуском.")
        print("См. .env.example — там есть шаблон со всеми переменными.")
        sys.exit(2)
    return value


def upload_dir(sftp, local_dir, remote_dir, skip=None):
    skip = skip or set()
    for entry in os.scandir(local_dir):
        if entry.name in skip:
            continue
        remote_path = f"{remote_dir}/{entry.name}"
        if entry.is_dir():
            try:
                sftp.mkdir(remote_path)
            except Exception:
                pass
            upload_dir(sftp, entry.path, remote_path, skip)
        else:
            sftp.put(entry.path, remote_path)


def main():
    ssh_host = _require_env('DEPLOY_SSH_HOST')
    ssh_user = _require_env('DEPLOY_SSH_USER')
    ssh_port = int(os.environ.get('DEPLOY_SSH_PORT', '22'))
    ssh_key = _require_env('DEPLOY_SSH_KEY')
    ssh_passphrase = os.environ.get('DEPLOY_SSH_PASSPHRASE') or None

    if not Path(ssh_key).exists():
        print(f"[ERROR] SSH-ключ не найден по пути: {ssh_key}")
        sys.exit(2)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        ssh_host,
        username=ssh_user,
        port=ssh_port,
        key_filename=ssh_key,
        passphrase=ssh_passphrase,
        timeout=15,
        banner_timeout=15,
        auth_timeout=15,
    )
    sftp = ssh.open_sftp()

    # 1. Sync source files
    print("Syncing source files...")
    for p in SYNC_PATHS:
        if not os.path.exists(p):
            continue
        remote_path = f'{REMOTE}/{p}'
        if os.path.isdir(p):
            try:
                sftp.mkdir(remote_path)
            except Exception:
                pass
            if p == 'public':
                skip = SKIP_IN_PUBLIC
            elif p == 'hermes':
                skip = SKIP_IN_HERMES
            else:
                skip = None
            upload_dir(sftp, p, remote_path, skip)
            print(f"  {p}/")
        else:
            sftp.put(p, remote_path)
            print(f"  {p}")

    # 1b. Явный аплоад hermes/.env (токены Hermes — отдельно от корневого .env)
    hermes_env = 'hermes/.env'
    if os.path.exists(hermes_env):
        try:
            sftp.put(hermes_env, f'{REMOTE}/{hermes_env}')
            print('  hermes/.env  (с POLZA_API_KEY + HERMES_TG_*)')
        except Exception as e:
            print(f'  WARN: не удалось залить hermes/.env: {e}')

    # 2. Build on server
    print("Building on server...")
    _, out, err = ssh.exec_command(f'cd {REMOTE} && NODE_ENV=production npm run build 2>&1')
    exit_code = out.channel.recv_exit_status()
    sys.stdout.buffer.write(out.read()[-2000:])
    if exit_code != 0:
        print(f"\nBuild failed with exit code {exit_code}")
        sys.exit(1)

    # 3. Regenerate manicure data.json + categories.json on server (build wiped dist/)
    print("Regenerating manicure data on server...")
    _, out, err = ssh.exec_command(f'cd {REMOTE} && node build-manicure-data.mjs 2>&1')
    out.channel.recv_exit_status()
    sys.stdout.buffer.write(out.read()[-1000:])

    # 3b. Restore nails after Vite wiped dist/: copy from public/nails (already on server)
    print("Restoring nails into dist/...")
    for meta in NAILS_META_FILES:
        if os.path.exists(meta):
            remote_meta = f'{REMOTE}/{meta.replace(os.sep, "/")}'
            remote_dir = os.path.dirname(remote_meta).replace('\\', '/')
            try:
                sftp.mkdir(remote_dir)
            except Exception:
                pass
            for part in ('public', 'public/nails', 'public/nails/all'):
                try:
                    sftp.mkdir(f'{REMOTE}/{part}')
                except Exception:
                    pass
            sftp.put(meta, remote_meta)
            print(f"  uploaded {meta}")
    _, out, err = ssh.exec_command(
        f'cd {REMOTE} && mkdir -p dist/nails/all && '
        f'cp -f public/nails/catalog.json public/nails/nails-data.json dist/nails/ && '
        f'cp -f public/nails/all/index.json dist/nails/all/ && '
        f'cp -an public/nails/all/. dist/nails/all/ && '
        f'echo "dist/nails/all=$(ls dist/nails/all | wc -l)"'
    )
    out.channel.recv_exit_status()
    sys.stdout.buffer.write(out.read())

    # 4. Ensure manicure/ originals/thumbs are present (only upload missing files)
    print("Checking manicure/ files on server...")
    try:
        sftp.mkdir(f'{REMOTE}/dist/manicure')
    except Exception:
        pass
    try:
        sftp.mkdir(f'{REMOTE}/dist/manicure/originals')
    except Exception:
        pass
    try:
        sftp.mkdir(f'{REMOTE}/dist/manicure/thumbs')
    except Exception:
        pass

    def list_remote(sftp, path):
        try:
            return set(f.filename for f in sftp.listdir_attr(path))
        except Exception:
            return set()

    # data.json + categories.json — всегда обновляем (маленькие)
    if os.path.exists('dist/manicure/data.json'):
        sftp.put('dist/manicure/data.json', f'{REMOTE}/dist/manicure/data.json')
        print("  data.json uploaded")
    if os.path.exists('dist/manicure/categories.json'):
        sftp.put('dist/manicure/categories.json', f'{REMOTE}/dist/manicure/categories.json')
        print("  categories.json uploaded")

    # originals/thumbs — только недостающие через scp (надёжнее для больших файлов).
    # Берём те же переменные окружения, что и для основного SSH-соединения.
    ssh_key_path = os.environ['DEPLOY_SSH_KEY']
    ssh_user_host = f"{ssh_user}@{ssh_host}"
    for subdir, label in [('originals', 'originals'), ('thumbs', 'thumbs')]:
        local_sub = f'dist/manicure/{subdir}'
        remote_sub = f'{REMOTE}/dist/manicure/{subdir}'
        if not os.path.exists(local_sub):
            continue
        remote_files = list_remote(sftp, remote_sub)
        local_files = set(os.listdir(local_sub))
        missing = sorted(local_files - remote_files)
        if missing:
            print(f"  {label}: uploading {len(missing)} missing files via scp...")
            for fn in missing:
                result = subprocess.run(
                    ['scp', '-i', ssh_key_path, '-o', 'StrictHostKeyChecking=no',
                     os.path.join(local_sub, fn), f'{ssh_user_host}:{remote_sub}/{fn}'],
                    capture_output=True, text=True
                )
                if result.returncode != 0:
                    print(f"    FAILED: {fn} — {result.stderr[:200]}")
            print(f"  {label}: done")
        else:
            print(f"  {label}: all {len(local_files)} files already on server")

    sftp.close()

    # 5. npm install для hermes/ (если ещё не установлено)
    print("Ensuring hermes dependencies on server...")
    _, out, _ = ssh.exec_command(
        f'cd {REMOTE}/hermes && [ -d node_modules ] && echo "node_modules exists" || npm install --no-audit --no-fund 2>&1 | tail -20'
    )
    out.channel.recv_exit_status()
    sys.stdout.buffer.write(out.read()[-2000:])

    # 6. Restart existing PM2 apps, or start them from the ecosystem file.
    # `pm2 restart name` does not create a missing process, so handle both cases.
    print("Restarting pm2 (stilist + hermes)...")
    pm2_cmd = (
        f'cd {REMOTE} && '
        f'if pm2 describe stilist >/dev/null 2>&1; then '
        f'pm2 restart stilist --update-env; '
        f'else pm2 start ecosystem.config.cjs --only stilist --update-env; fi && '
        f'if pm2 describe hermes >/dev/null 2>&1; then '
        f'pm2 restart hermes --update-env; '
        f'else pm2 start ecosystem.config.cjs --only hermes --update-env; fi 2>&1'
    )
    _, out, _ = ssh.exec_command(pm2_cmd)
    out.channel.recv_exit_status()
    sys.stdout.buffer.write(out.read()[-2000:])

    ssh.close()
    print("\nDone! https://stilist-ai.ru  +  Hermes канал")


if __name__ == '__main__':
    main()
