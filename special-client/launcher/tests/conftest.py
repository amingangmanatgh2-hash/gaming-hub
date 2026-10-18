"""Shared fixtures: a local HTTP file server + rendered version jsons.

The version fixtures use ``__SERVER__`` and ``__SHA_*__`` placeholders;
``conftest`` renders them against a real local server so download/install
tests exercise the *real* code paths (HTTP, sha1, resume, extract) without
any external network.
"""
from __future__ import annotations

import hashlib
import io
import json
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


def _sha1(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()


def _make_zip(entries: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for name, content in entries.items():
            zf.writestr(name, content)
    return buf.getvalue()


def build_server_files() -> dict:
    """Mapping of url-path -> (bytes, sha1_key)."""
    files: dict[str, bytes] = {}

    # --- libraries ---------------------------------------------------------
    files["/libs/core-lib-1.0.0.jar"] = b"corelib-artifact!!"
    files["/libs/core-lib-natives-win.jar"] = _make_zip({
        "META-INF/MANIFEST.MF": "Manifest-Version: 1.0\n",
        "lwjgl.dll": b"WINNATIVEBYTES00",
    })
    files["/libs/core-lib-natives-linux.jar"] = _make_zip({
        "META-INF/MANIFEST.MF": "Manifest-Version: 1.0\n",
        "liblwjgl.so": b"LINUXNATIVEBYTES",
    })
    files["/libs/linux-helper-2.0.0.jar"] = b"linux-helper-jar!!"
    files["/libs/windows-helper-2.0.0.jar"] = b"windows-helper-jar!"
    files["/libs/common-3.0.0.jar"] = b"common-jar-1.20.1!!"

    files["/libs/legacy-core-0.9.0.jar"] = b"legacy-core-artifact!"
    files["/libs/legacy-core-win.jar"] = _make_zip({
        "META-INF/MANIFEST.MF": "Manifest-Version: 1.0\n",
        "legacy.dll": b"LEGACWIN00000000",
    })
    files["/libs/legacy-core-linux.jar"] = _make_zip({
        "liblegacy.so": b"LEGACLIN00000000",
    })
    files["/libs/legacy-common-0.9.0.jar"] = b"legacy-common-jar!!"

    # --- client jars ---------------------------------------------------------
    files["/versions/1.20.1.jar"] = b"CLIENT-JAR-1.20.1-CONTENT"
    files["/versions/1.20.1-server.jar"] = b"SERVER-JAR-1.20.1-CONTENT"
    files["/versions/1.8.9.jar"] = b"CLIENT-JAR-1.8.9-CONTENT"

    # --- asset indexes ----------------------------------------------------------
    def index(objects: dict) -> bytes:
        return json.dumps({"objects": objects}).encode()

    files["/assets/test-10.json"] = index({
        "textures/blocks/stone.png": {
            "hash": "aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00",
            "size": 8,
        },
        "sounds/record/13.png": {
            "hash": "00112233445566778899aabbccddeeff00112233",
            "size": 9,
        },
    })
    files["/assets/test-8.json"] = index({
        "textures/items/dirt.png": {
            "hash": "ffffeeeeddddccccbbbbaaaa99998888777766665555",
            "size": 7,
        },
    })

    # asset objects served under /objects/<2>/<hash>
    for path in ("/assets/test-10.json", "/assets/test-8.json"):
        for name, meta in json.loads(files[path])["objects"].items():
            h = meta["hash"]
            files[f"/objects/{h[:2]}/{h}"] = b"x" * meta["size"]

    return files


class _Handler(BaseHTTPRequestHandler):
    files: dict = {}

    def log_message(self, *a):  # silence
        pass

    def do_GET(self):  # noqa: N802
        if self.path in self.files:
            data = self.files[self.path]
            start = 0
            rng = self.headers.get("Range")
            if rng and rng.startswith("bytes="):
                start = int(rng.split("=")[1].split("-")[0])
            body = data[start:]
            code = 206 if start else 200
            self.send_response(code)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Accept-Ranges", "bytes")
            if start:
                self.send_header(
                    "Content-Range",
                    f"bytes {start}-{len(data) - 1}/{len(data)}")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()


@pytest.fixture(scope="session")
def http_server():
    files = build_server_files()
    handler = type("H", (_Handler,), {"files": files})
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    yield {"base": base, "files": files}
    srv.shutdown()


@pytest.fixture()
def sha_map(http_server) -> dict:
    """{served file name: sha1hex} for all served files."""
    return _sha_map(http_server["files"])


def _key(p: str) -> str:
    # full file name (incl. extension) — stems collide (1.20.1.jar / 1.20.1.json)
    return p.rsplit("/", 1)[-1]


def _sha_map(files: dict) -> dict:
    return {_key(p): _sha1(d) for p, d in files.items()}


def render_version(path: Path, base: str, files: dict) -> dict:
    """Substitute __SERVER__, __SHA_key__ and __SIZE_key__ placeholders."""
    import re
    sha_map = _sha_map(files)
    sizes = {_key(p): len(d) for p, d in files.items()}
    text = path.read_text()
    text = text.replace("__SERVER__", base)
    text = re.sub(r"__SHA_([A-Za-z0-9][A-Za-z0-9._-]*)__",
                  lambda m: sha_map.get(m.group(1), "0" * 40), text)
    text = re.sub(r"__SIZE_([A-Za-z0-9][A-Za-z0-9._-]*)__",
                  lambda m: str(sizes.get(m.group(1), 0)), text)
    return json.loads(text)


@pytest.fixture()
def version_1_20_1(http_server) -> dict:
    return render_version(FIXTURES / "version-1.20.1.json",
                          http_server["base"], http_server["files"])


@pytest.fixture()
def version_1_8_9(http_server) -> dict:
    return render_version(FIXTURES / "version-1.8.9.json",
                          http_server["base"], http_server["files"])
