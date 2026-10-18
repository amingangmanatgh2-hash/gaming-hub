import json
from types import SimpleNamespace
from unittest.mock import Mock
import uuid

import pytest
from special_client.core.storage import default_game_dir, is_vanilla
from special_client.core.server import ServerHost, ServerError
from special_client.core.cosmetics import CosmeticsStore


def test_dedicated_directory_not_vanilla(monkeypatch, tmp_path):
    monkeypatch.setenv("SPECIAL_CLIENT_GAME_DIR", str(tmp_path / "dedicated"))
    assert default_game_dir() == tmp_path / "dedicated"
    assert not is_vanilla(default_game_dir())


def test_server_eula_required_before_download(tmp_path):
    host = ServerHost(tmp_path)
    with pytest.raises(ServerError, match="EULA"):
        host.install(SimpleNamespace(id="1.20.1"), Mock())


def test_server_uses_verified_server_download_and_separate_root(tmp_path):
    host = ServerHost(tmp_path / "servers")
    service = Mock()
    service.fetch_version_json.return_value = SimpleNamespace(raw={"downloads": {"server": {
        "url": "https://example.com/server.jar", "sha1": "a" * 40, "size": 123}}},
        java_version=SimpleNamespace(major_version=17))
    destination = host.install(SimpleNamespace(id="1.20.1"), service, accepted_eula=True)
    assert destination == tmp_path / "servers/1.20.1"
    assert "online-mode=true" in (destination / "server.properties").read_text()
    request = service.downloads.download.call_args.args[0]
    assert request.sha1 == "a" * 40 and request.dest.name == "server.jar"
    (destination / "server.jar").write_bytes(b"fixture")
    (destination / "server.properties").write_text("online-mode=false\n")
    with pytest.raises(ServerError, match="authentication"):
        host.start("java", 1024)


def test_cosmetic_peer_share_has_no_secrets(tmp_path):
    own = CosmeticsStore(tmp_path / "own")
    own.set_self(cape="aurora", wings=True)
    public = tmp_path / "share.json"
    uid = str(uuid.uuid4())
    own.export_peer(uid, public)
    assert set(json.loads(public.read_text())) == {"peers"}
    friend = CosmeticsStore(tmp_path / "friend")
    assert friend.import_peers(public) == 1
    assert friend.read()["peers"][uid] == {"cape": "aurora", "wings": True}
    with pytest.raises(ValueError):
        own.set_self(cape="../../path")


def test_invalid_cosmetic_peers_are_ignored():
    assert CosmeticsStore.peers({"not-a-uuid": {"cape": "legend"}}) == {}
