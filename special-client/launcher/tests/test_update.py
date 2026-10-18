"""Updater: manifest validation, staged verified apply, rollback."""
import hashlib
import json

import pytest

from special_client.core.updater.updater import (UpdateError,
                                                 UpdateManifest, Updater)

def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _manifest(files: list) -> dict:
    return {
        "version": "1.1.0",
        "channel": "stable",
        "min_launcher": "1.0.0",
        "changelog": "test update",
        "files": files,
    }


class TestManifestValidation:
    def test_valid_manifest(self):
        m = UpdateManifest.from_dict(_manifest([
            {"path": "a.py", "url": "https://x/a.py",
             "sha256": "ab" * 32, "size": 3}]))
        m.validate()

    def test_rejects_bad_sha256(self):
        m = UpdateManifest.from_dict(_manifest([
            {"path": "a.py", "url": "https://x/a.py", "sha256": "zz", "size": 3}]))
        with pytest.raises(UpdateError):
            m.validate()

    def test_rejects_non_https(self):
        m = UpdateManifest.from_dict(_manifest([
            {"path": "a.py", "url": "http://x/a.py", "sha256": "ab" * 32,
             "size": 3}]))
        with pytest.raises(UpdateError):
            m.validate()

    def test_rejects_path_traversal(self):
        m = UpdateManifest.from_dict(_manifest([
            {"path": "../evil.py", "url": "https://x/a.py",
             "sha256": "ab" * 32, "size": 3}]))
        with pytest.raises(UpdateError):
            m.validate()


class TestApply:
    def test_apply_verifies_and_installs(self, tmp_path, http_server):
        app = tmp_path / "app"
        (app / "cache").mkdir(parents=True)
        (app / "old.py").write_text("old")
        files = [{
            "path": "new.py",
            "url": http_server["base"] + "/libs/common-3.0.0.jar",
            "sha256": _sha256(http_server["files"]["/libs/common-3.0.0.jar"]),
            "size": len(http_server["files"]["/libs/common-3.0.0.jar"]),
        }]
        import requests
        up = Updater(app, requests.Session())
        up.downloads.allow_http = True  # local test server
        m = UpdateManifest.from_dict(_manifest(files))
        up.apply(m)
        assert (app / "new.py").read_bytes() == \
            http_server["files"]["/libs/common-3.0.0.jar"]
        marker = json.loads((app / "current-version.json").read_text())
        assert marker["version"] == "1.1.0"

    def test_tampered_file_fails_and_rolls_back(self, tmp_path, http_server):
        app = tmp_path / "app"
        (app / "cache").mkdir(parents=True)
        (app / "old.py").write_text("old content")
        data = http_server["files"]["/libs/common-3.0.0.jar"]
        files = [{
            "path": "new.py",
            "url": http_server["base"] + "/libs/common-3.0.0.jar",
            "sha256": "00" * 32,   # WRONG digest
            "size": len(data),
        }]
        import requests
        up = Updater(app, requests.Session())
        up.downloads.allow_http = True
        m = UpdateManifest.from_dict(_manifest(files))
        with pytest.raises(UpdateError) as ei:
            up.apply(m)
        assert "SHA-256 mismatch" in str(ei.value)
        # nothing from the update applied
        assert not (app / "new.py").exists()
        # original untouched
        assert (app / "old.py").read_text() == "old content"

    def test_rollback_restores_previous(self, tmp_path, http_server):
        app = tmp_path / "app"
        (app / "cache").mkdir(parents=True)
        (app / "old.py").write_text("v1")
        import requests
        up = Updater(app, requests.Session())
        up.downloads.allow_http = True
        data = http_server["files"]["/libs/common-3.0.0.jar"]
        m = UpdateManifest.from_dict(_manifest([{
            "path": "new.py",
            "url": http_server["base"] + "/libs/common-3.0.0.jar",
            "sha256": _sha256(data), "size": len(data),
        }]))
        up.apply(m)
        assert (app / "new.py").exists()
        snap = up.rollback()
        assert snap is not None
        assert not (app / "new.py").exists()
        assert (app / "old.py").read_text() == "v1"

    def test_check_uses_cache_when_offline(self, tmp_path, http_server):
        app = tmp_path / "app"
        (app / "cache").mkdir(parents=True)
        import requests

        class Session:
            def __init__(self, ok):
                self.ok = ok
            def get(self, url, **kw):
                if not self.ok:
                    raise requests.ConnectionError("offline")
                return requests.Session().get(url, **kw)

        up = Updater(app, Session(True), manifest_url=
                     http_server["base"] + "/manifest.json")
        # serve the manifest
        http_server["files"]["/manifest.json"] = json.dumps(_manifest([])
                                                            ).encode()
        state = up.check()
        assert state.update_available is True
        # now offline: cache must still work
        up.session = Session(False)
        state2 = up.check()
        assert state2 is not None
        assert state2.update_available is True
        assert state2.from_cache is True

    def test_check_returns_none_when_offline_no_cache(self, tmp_path):
        app = tmp_path / "app"
        (app / "cache").mkdir(parents=True)
        import requests

        class Session:
            def get(self, url, **kw):
                raise requests.ConnectionError("offline")

        up = Updater(app, Session(), manifest_url="https://x/manifest.json")
        assert up.check() is None
