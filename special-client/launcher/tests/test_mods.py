"""Mod manager: inventory, mod-id detection, conflicts, backup/restore,
import/export, catalog compatibility."""
import io
import json
import zipfile

import pytest

from special_client.core.mods.catalog import (bundle_slugs, entry_by_slug,
                                              for_mc)
from special_client.core.mods.manager import ModManager, read_mod_id
from special_client.core.paths import DirLayout


def _fabric_jar(mod_id: str, data: bytes = b"mod-bytes") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("fabric.mod.json", json.dumps({"id": mod_id,
                                                   "version": "1.0"}))
        zf.writestr("mod.class", data.decode() if data.isascii() else b"x")
    return buf.getvalue()


def _forge_jar(mod_id: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("mcmod.info", json.dumps([{"modid": mod_id}]))
    return buf.getvalue()


class TestCatalog:
    def test_known_good_pins(self):
        e = entry_by_slug("sodium")
        assert e.known_good_for("1.20.1") == "0.5.10"
        # nearest lower pin for an unknown MC
        assert e.known_good_for("1.21.9") is not None

    def test_support_filtering(self):
        mods_1201 = for_mc("1.20.1", "fabric")
        slugs = {m.slug for m in mods_1201}
        assert "sodium" in slugs and "iris" in slugs
        # forge cannot take fabric-only mods
        assert for_mc("1.20.1", "forge") == []

    def test_bundle_includes_dependencies(self):
        slugs = bundle_slugs("balanced", "1.20.1", "fabric")
        assert "sodium" in slugs
        assert "indium" in slugs  # required by iris (iris not in balanced)

    def test_bundle_respects_support(self):
        # iris requires sodium+indium; all supported on 1.20.1
        slugs = bundle_slugs("high", "1.20.1", "fabric")
        assert "iris" in slugs and "sodium" in slugs


class TestModId:
    def test_fabric(self, tmp_path):
        j = tmp_path / "m.jar"
        j.write_bytes(_fabric_jar("mymod"))
        assert read_mod_id(j) == "mymod"

    def test_forge(self, tmp_path):
        j = tmp_path / "m.jar"
        j.write_bytes(_forge_jar("forgemod"))
        assert read_mod_id(j) == "forgemod"

    def test_invalid_jar(self, tmp_path):
        j = tmp_path / "bad.jar"
        j.write_bytes(b"not a zip")
        assert read_mod_id(j) is None


class TestManager:
    def _mm(self, tmp_path):
        layout = DirLayout(tmp_path)
        layout.ensure_all()
        import requests
        return ModManager(layout, requests.Session())

    def test_import_inventory_enable_disable(self, tmp_path):
        mm = self._mm(tmp_path)
        d = mm.mods_dir()
        (d / "sodium-0.5.10.jar").write_bytes(_fabric_jar("sodium"))
        inv = mm.inventory("1.20.1", "fabric")
        sod = next(m for m in inv if m.slug == "sodium")
        assert sod.state == "installed"
        assert sod.mod_id == "sodium"
        assert sod.version == "0.5.10"
        mm.set_enabled("sodium", False)
        assert not (d / "sodium-0.5.10.jar").exists()
        assert (d / "disabled" / "sodium-0.5.10.jar").exists()
        mm.set_enabled("sodium", True)
        assert (d / "sodium-0.5.10.jar").exists()

    def test_duplicate_mod_detection(self, tmp_path):
        mm = self._mm(tmp_path)
        d = mm.mods_dir()
        (d / "sodium-0.5.10.jar").write_bytes(_fabric_jar("sodium"))
        (d / "sodium-0.5.9.jar").write_bytes(_fabric_jar("sodium"))
        conf = mm.detect_conflicts()
        assert "sodium" in conf["duplicates"]
        assert len(conf["duplicates"]["sodium"]) == 2
        assert any("Multiple versions" in w for w in conf["warnings"])

    def test_no_false_conflicts(self, tmp_path):
        mm = self._mm(tmp_path)
        d = mm.mods_dir()
        (d / "sodium-0.5.10.jar").write_bytes(_fabric_jar("sodium"))
        (d / "lithium-0.11.2.jar").write_bytes(_fabric_jar("lithium"))
        conf = mm.detect_conflicts()
        assert conf["duplicates"] == {}
        assert conf["warnings"] == []

    def test_backup_restore_roundtrip(self, tmp_path):
        mm = self._mm(tmp_path)
        d = mm.mods_dir()
        (d / "sodium-0.5.10.jar").write_bytes(_fabric_jar("sodium"))
        (d / "disabled" / "iris-1.6.19.jar").write_bytes(_fabric_jar("iris"))
        backup = mm.backup("test")
        assert backup.exists()
        # simulate changes
        (d / "sodium-0.5.10.jar").unlink()
        (d / "extra.jar").write_bytes(_fabric_jar("extra"))
        mm.restore(backup)
        assert (d / "sodium-0.5.10.jar").exists()
        assert (d / "disabled" / "iris-1.6.19.jar").exists()
        assert not (d / "extra.jar").exists()
        # pre-restore backup was auto-created
        assert len(mm.list_backups()) >= 2

    def test_export_import_roundtrip(self, tmp_path):
        mm = self._mm(tmp_path)
        d = mm.mods_dir()
        (d / "sodium-0.5.10.jar").write_bytes(_fabric_jar("sodium"))
        out = tmp_path / "profile.zip"
        mm.export_profile(out)
        # clear and re-import
        (d / "sodium-0.5.10.jar").unlink()
        mm2 = self._mm(tmp_path)
        installed = mm2.import_profile(out)
        assert "sodium-0.5.10.jar" in installed
        assert (d / "sodium-0.5.10.jar").exists()

    def test_import_custom_jar(self, tmp_path):
        mm = self._mm(tmp_path)
        src = tmp_path / "custom-1.0.jar"
        src.write_bytes(_fabric_jar("custommod"))
        name = mm.import_jar(src)
        assert name == "custom-1.0.jar"
        inv = mm.inventory("1.20.1", "fabric")
        custom = [m for m in inv if m.mod_id == "custommod"]
        assert len(custom) == 1
        assert custom[0].category == "custom"

    def test_install_rejects_unsupported_mc(self, tmp_path):
        mm = self._mm(tmp_path)
        # entityculling supports 1.20.1+; not 1.8
        with pytest.raises(Exception) as ei:
            mm.install("entityculling", "1.8.9", "fabric")
        assert "does not support" in str(ei.value)
