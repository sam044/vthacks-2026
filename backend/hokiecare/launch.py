"""Prepare the mounted demo-data directory, then drop root before running the app."""
import os
from pathlib import Path
import sys


def main():
    root = Path('/data')
    root.mkdir(exist_ok=True)
    if os.getuid() == 0:
        # Only the app-owned files in this named mount are touched, never recursive paths.
        os.chown(root, 10001, 10001)
        for name in ('appointments.sqlite3', 'appointments.sqlite3-wal', 'appointments.sqlite3-shm',
                     'appointments.sqlite3-journal', 'microsoft-graph-cache.bin',
                     'microsoft-graph-cache.bin.tmp'):
            file = root / name
            if file.exists() and not file.is_symlink():
                os.chown(file, 10001, 10001)
        os.setgroups([])
        os.setgid(10001)
        os.setuid(10001)
    os.execv(sys.executable, [sys.executable, '-m', 'uvicorn', 'hokiecare.app:app', '--host', '0.0.0.0',
                            '--port', os.environ.get('PORT', '8000'), '--workers', '1', '--no-access-log'])


if __name__ == '__main__':
    main()
