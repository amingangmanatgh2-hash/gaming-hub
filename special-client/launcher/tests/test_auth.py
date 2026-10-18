"""Authentication: offline sessions (vanilla-compatible UUIDs), token store."""
import os

import pytest

from special_client.core import auth
from special_client.core.auth import (AccountStore, AuthError,
                                      MicrosoftAuth, make_offline_session,
                                      offline_uuid)


class TestOffline:
    def test_notch_uuid_matches_vanilla(self):
        # Java: UUID.nameUUIDFromBytes("OfflinePlayer:Notch".getBytes(UTF_8))
        assert offline_uuid("Notch") == "b50ad385-829d-3141-a216-7e7d7539ba7f"

    def test_deterministic(self):
        assert offline_uuid("Steve_42") == offline_uuid("Steve_42")
        assert offline_uuid("Steve_42") != offline_uuid("Steve42")

    def test_is_valid_uuid_v3(self):
        import uuid
        u = uuid.UUID(offline_uuid("Jeb_"))
        assert u.version == 3

    def test_name_validation(self):
        for bad in ("", "ab", "x" * 17, "bad name", "bad/name"):
            with pytest.raises(AuthError):
                make_offline_session(bad)

    def test_valid_session(self):
        s = make_offline_session("ValidName")
        assert s.kind == "offline"
        assert s.player_name == "ValidName"
        assert s.uuid == offline_uuid("ValidName")
        assert s.access_token == ""
        v = s.to_launch_vars()
        assert v["user_type"] == "mojang"


class TestAccountStore:
    def test_add_get_remove(self, tmp_path):
        store = AccountStore(tmp_path)
        store.add(_session("Steve"), "uhs-1")
        assert store.list_names() == ["Steve"]
        rec = store.get("Steve")
        assert rec["refresh_token"] == "refresh-1"
        assert rec["xuid"] == "uhs-1"
        store.remove("Steve")
        assert store.list_names() == []

    @pytest.mark.skipif(os.name == "nt", reason="POSIX mode bits do not model Windows ACLs")
    def test_file_permissions(self, tmp_path):
        store = AccountStore(tmp_path)
        store.add(_session("Alice"), "uhs-2")
        mode = oct(os.stat(store.file).st_mode & 0o777)
        assert mode == "0o600"

    def test_corrupt_store_recovers(self, tmp_path):
        store = AccountStore(tmp_path)
        store.add(_session("Bob"), "uhs-3")
        store.file.write_text("corrupted")
        store2 = AccountStore(tmp_path)
        assert store2.list_names() == []

    def test_persistence_roundtrip(self, tmp_path):
        s1 = AccountStore(tmp_path)
        s1.add(_session("Cara"), "uhs-4")
        s2 = AccountStore(tmp_path)
        assert s2.get("Cara") is not None


def _session(name):
    from special_client.core.auth import AuthSession
    return AuthSession(kind="microsoft", player_name=name,
                       uuid=offline_uuid(name), access_token="mc-token",
                       refresh_token="refresh-1")


class TestMicrosoftFlowShape:
    """Endpoint constants match the documented services."""

    def test_endpoints(self):
        assert auth.MSA_DEVICE_CODE_URL == \
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode"
        assert auth.MSA_TOKEN_URL == \
            "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
        assert auth.XBL_AUTHENTICATE_URL == \
            "https://user.auth.xboxlive.com/user/authenticate"
        assert auth.XSTS_AUTHORIZE_URL == \
            "https://xsts.auth.xboxlive.com/xsts/authorize"
        assert auth.MC_LAUNCHER_LOGIN_URL == \
            "https://api.minecraftservices.com/launcher/login"
        assert auth.MC_PROFILE_URL == \
            "https://api.minecraftservices.com/minecraft/profile"
        assert auth.MSA_SCOPES == "XboxLive.SignIn XboxLive.offline_access"

    def test_xbl_body_shape(self):
        """The XBL request body must carry the d=<jwt> RpsTicket."""
        m = MicrosoftAuth(session=None)
        # exercise the private builder via monkeypatched session
        captured = {}

        class FakeSession:
            def post(self, url, **kw):
                captured["url"] = url
                captured["body"] = kw.get("json")
                raise RuntimeError("stop")

        m.session = FakeSession()
        try:
            m._xbox_user("msa-jwt-token")
        except RuntimeError:
            pass
        assert captured["url"] == auth.XBL_AUTHENTICATE_URL
        body = captured["body"]
        assert body["Properties"]["RpsTicket"] == "d=msa-jwt-token"
        assert body["RelyingParty"] == "http://auth.xboxlive.com"
        assert body["TokenType"] == "JWT"

    def test_uhs_extraction(self):
        m = MicrosoftAuth(session=None)
        resp = {"DisplayClaims": {"xui": [["12345", "name", 0], []]}}
        assert m._uhs(resp) == "12345"
        assert m._uhs({"DisplayClaims": {}}) == ""


@pytest.mark.skipif(os.name != "nt", reason="Windows DPAPI integration")
def test_windows_tokens_encrypted(tmp_path):
    store = AccountStore(tmp_path)
    store.add(_session("Protected"), "uhs")
    assert b"refresh-1" not in store.file.read_bytes()
    assert store.file.read_bytes().startswith(b"SPECIAL-DPAPI-1\n")
    assert AccountStore(tmp_path).get("Protected")["refresh_token"] == "refresh-1"
