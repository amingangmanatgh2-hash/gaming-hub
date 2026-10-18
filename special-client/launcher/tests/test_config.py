"""Configuration & profile handling: atomicity, corruption recovery, CRUD."""
import json
import os

import pytest

from special_client.core.config import Config, ProfileStore


def test_defaults_applied(tmp_path):
    c = Config(tmp_path / "config.json")
    assert c.get("ram_mb") == 4096
    assert c.get("theme") == "studio-graphite"


def test_set_get_save_load(tmp_path):
    p = tmp_path / "config.json"
    c = Config(p)
    c.set("ram_mb", 8192)
    c.set("custom_key", "value")
    c.save()
    c2 = Config(p)
    assert c2.get("ram_mb") == 8192
    assert c2.get("custom_key") == "value"
    # untouched defaults still present
    assert c2.get("theme") == "studio-graphite"


def test_atomic_write_no_partial_file(tmp_path):
    p = tmp_path / "config.json"
    c = Config(p)
    c.set("a", 1)
    c.save()
    # no leftover tmp files
    assert not (tmp_path / "config.json.tmp").exists()
    data = json.loads(p.read_text())
    assert data["a"] == 1


def test_corrupt_config_quarantined(tmp_path):
    p = tmp_path / "config.json"
    p.write_text("{not valid json!!")
    c = Config(p)
    # starts with defaults instead of crashing
    assert c.get("ram_mb") == 4096
    # bad file preserved under a .corrupt-* name
    bad = [f for f in tmp_path.iterdir() if ".corrupt-" in f.name]
    assert len(bad) == 1


@pytest.mark.skipif(os.name == "nt", reason="POSIX mode bits do not model Windows ACLs")
def test_config_file_permissions(tmp_path):
    p = tmp_path / "config.json"
    c = Config(p)
    c.save()
    mode = oct(os.stat(p).st_mode & 0o777)
    assert mode == "0o600"


class TestProfiles:
    def test_default_profile_created(self, tmp_path):
        store = ProfileStore(tmp_path / "profiles.json")
        assert store.active == "Default"
        assert store.get("Default") is not None

    def test_crud_roundtrip(self, tmp_path):
        store = ProfileStore(tmp_path / "profiles.json")
        p = store.create("PvP", version_id="1.8.9", ram_mb=2048,
                         loader="fabric")
        assert p.name == "PvP"
        store.set_active("PvP")
        store2 = ProfileStore(tmp_path / "profiles.json")
        assert store2.active == "PvP"
        got = store2.get("PvP")
        assert got.version_id == "1.8.9"
        assert got.ram_mb == 2048
        store2.delete("PvP")
        store3 = ProfileStore(tmp_path / "profiles.json")
        assert "PvP" not in [x.name for x in store3.profiles]
        # a default profile always exists
        assert store3.profiles

    def test_duplicate_names_rejected(self, tmp_path):
        store = ProfileStore(tmp_path / "profiles.json")
        try:
            store.create("Default")
            assert False, "expected ValueError"
        except ValueError:
            pass

    def test_duplicate_profile(self, tmp_path):
        store = ProfileStore(tmp_path / "profiles.json")
        store.create("A", version_id="1.20.1", ram_mb=4096)
        b = store.duplicate("A", "B")
        assert b.version_id == "1.20.1"
        assert b.ram_mb == 4096
        assert store.get("A").name == "A"

    def test_profile_unknown_fields_ignored(self, tmp_path):
        p = tmp_path / "profiles.json"
        p.write_text(json.dumps({
            "profiles": [{"name": "X", "bogus_field": 1, "ram_mb": 3000}],
            "active": "X",
        }))
        store = ProfileStore(p)
        assert store.get("X").ram_mb == 3000

    def test_corrupt_profiles_file(self, tmp_path):
        p = tmp_path / "profiles.json"
        p.write_text("garbage")
        store = ProfileStore(p)
        assert store.profiles  # recreated with Default
