#!/usr/bin/env python3
"""Static, dependency-free checks for the installable SApay iPhone PWA."""
from pathlib import Path
import json
import re

public = Path(__file__).resolve().parents[1] / "public"
html = (public / "index.html").read_text()
manifest = json.loads((public / "manifest.webmanifest").read_text())
worker = (public / "service-worker.js").read_text()
registration = (public / "sw-register.js").read_text()

assert manifest["display"] == "standalone", "PWA must open without Safari chrome"
assert manifest["start_url"] == "/" and manifest["scope"] == "/"
assert manifest["name"] and manifest["short_name"]
assert 'rel="manifest"' in html and '/manifest.webmanifest' in html
assert 'rel="apple-touch-icon"' in html
assert 'apple-mobile-web-app-capable' in html
assert '/service-worker.js' in registration
assert '/sw-register.js' in html
assert "url.pathname.startsWith('/api/')" in worker, "Never cache financial API responses"
assert "request.method !== 'GET'" in worker, "Never cache non-GET requests"
assert "networkFirst(event" in worker, "Shell should prefer fresh content"

for icon in manifest["icons"]:
    path = public / icon["src"].lstrip("/")
    assert path.is_file(), f"Missing PWA icon: {path}"
for path in re.findall(r"['\"](/[^'\"]+)['\"]", worker.split("const APP_SHELL =", 1)[1].split("];", 1)[0]):
    assert (public / path.lstrip("/")).is_file() or path == "/", f"Missing offline shell file: {path}"

print("SApay iPhone PWA static readiness: PASS")
