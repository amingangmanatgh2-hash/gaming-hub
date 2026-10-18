import json
from zipfile import ZipFile

import pytest
from special_client.core.clientmod import install_client_mod


def archive(path, **changes):
    meta = {"id": "specialclient", "environment": "client", "depends": {"minecraft": "1.20.1"}}
    meta.update(changes)
    with ZipFile(path, "w") as jar:
        jar.writestr("fabric.mod.json", json.dumps(meta))
        jar.writestr("dev/specialclient/SpecialClient.class", b"test-fixture-not-executable")
    return path


def test_install(tmp_path):
    src = archive(tmp_path / "client.jar")
    target = install_client_mod(src, tmp_path / "game", "1.20.1", "fabric")
    assert target.read_bytes() == src.read_bytes()
    assert not list(target.parent.glob("*.tmp"))


@pytest.mark.parametrize("version,loader", [("1.21", "fabric"), ("1.20.1", "forge")])
def test_incompatible(tmp_path, version, loader):
    with pytest.raises(ValueError, match="requires"):
        install_client_mod(tmp_path / "missing.jar", tmp_path, version, loader)


def test_wrong_mod(tmp_path):
    src = archive(tmp_path / "other.jar", id="anothermod")
    with pytest.raises(ValueError, match="compatible"):
        install_client_mod(src, tmp_path, "1.20.1", "fabric")


def test_duplicate(tmp_path):
    (tmp_path / "mods").mkdir()
    archive(tmp_path / "mods" / "old-name.jar")
    src = archive(tmp_path / "new.jar")
    with pytest.raises(ValueError, match="existing"):
        install_client_mod(src, tmp_path, "1.20.1", "fabric")


def test_invalid_archive(tmp_path):
    src = tmp_path / "bad.jar"
    src.write_bytes(b"not a zip")
    with pytest.raises(ValueError, match="Invalid"):
        install_client_mod(src, tmp_path, "1.20.1", "fabric")
