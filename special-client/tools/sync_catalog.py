"""Fetch only official Minecraft version metadata. Never mirror game binaries."""
import json
import pathlib
import sys
import urllib.request
from urllib.parse import urlsplit

URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
with urllib.request.urlopen(URL, timeout=30) as response:
    data = json.load(response)
if not isinstance(data.get("versions"), list) or len(data["versions"]) < 10:
    raise RuntimeError("Refusing to replace catalogue with empty/invalid data")
for entry in data["versions"]:
    host = urlsplit(entry["url"]).hostname
    if urlsplit(entry["url"]).scheme != "https" or host not in {"piston-meta.mojang.com", "launchermeta.mojang.com"}:
        raise RuntimeError("Unexpected upstream metadata host")
if not any(e["id"] == "1.8.9" for e in data["versions"]):
    raise RuntimeError("Required legacy entry missing")
output = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "versions.json")
output.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
print(f"Validated {len(data['versions'])} official entries; latest actual release: {data['latest']['release']}")
