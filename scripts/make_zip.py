"""Builds letterboxd-cinemas-extension.zip: just the files Chrome needs, with the manifest at
the top level so "Load unpacked" works on the unzipped folder. (Uses Python's zipfile rather
than PowerShell's Compress-Archive, which writes backslash paths that break on macOS/Linux.)

    python scripts/make_zip.py
"""
import json
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "manifest.json").read_text(encoding="utf-8"))["version"]
include = ["manifest.json", "popup.html", "popup.css", "popup.js", "report.html", "report.css", "report.js"]
include += sorted(str(p.relative_to(root)).replace("\\", "/") for folder in ("lib", "icons") for p in (root / folder).rglob("*") if p.is_file())

out = root / "letterboxd-cinemas-extension.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for name in include:
        z.write(root / name, name)
print(f"{out.name}: {len(include)} files, {out.stat().st_size / 1024:.0f} KB (version {version})")
