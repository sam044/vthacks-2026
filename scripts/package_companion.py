"""Create a reproducible download from reviewed extension sources (no patient data)."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
target = root / 'frontend/public/hokiecare-companion.zip'
target.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(target, 'w') as archive:
    for name in ['manifest.json', 'background.js', 'bridge.js', 'portal.js', 'README.md']:
        info = ZipInfo(name, date_time=(2026, 9, 19, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        archive.writestr(info, (root / 'companion' / name).read_text(encoding='utf-8').encode('utf-8'))
print(target)
