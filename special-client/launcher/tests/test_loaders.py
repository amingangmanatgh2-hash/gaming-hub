"""Loader (Fabric/Quilt/Forge/NeoForge) version matching.

Pure functions — no network needed. The real maven metadata parsing is
covered by the CI build; here we pin the version-scheme semantics that
used to be wrong (NeoForge versions do NOT embed the MC version).
"""
from special_client.core.mods.loaders import (_forge_match,
                                              _neoforge_prefix)


class TestNeoForgePrefix:
    def test_1_20_series(self):
        assert _neoforge_prefix("1.20.1") == "20.1."
        assert _neoforge_prefix("1.20.4") == "20.4."
        assert _neoforge_prefix("1.20.6") == "20.6."

    def test_1_21_series(self):
        assert _neoforge_prefix("1.21") == "21.0."
        assert _neoforge_prefix("1.21.1") == "21.1."
        assert _neoforge_prefix("1.21.4") == "21.4."
        assert _neoforge_prefix("1.21.9") == "21.9."

    def test_unsupported(self):
        # NeoForge does not exist for these MC versions
        assert _neoforge_prefix("1.19.4") is None
        assert _neoforge_prefix("1.8.9") is None
        assert _neoforge_prefix("garbage") is None


class TestForgeMatch:
    def test_forge_embeds_mc_version(self):
        assert _forge_match("1.20.1-47.2.20", "1.20.1", "forge") is True
        assert _forge_match("1.12.2-14.23.5.2859", "1.20.1", "forge") is False
        # must not match a prefix-only string (1.20-... is not 1.20.1)
        assert _forge_match("1.20-1.0.0", "1.20.1", "forge") is False

    def test_neoforge_uses_prefix_mapping(self):
        # real NeoForge maven versions (no MC component)
        assert _forge_match("21.0.24-beta", "1.21", "neoforge") is True
        assert _forge_match("21.4.10", "1.21.4", "neoforge") is True
        assert _forge_match("20.6.3", "1.20.6", "neoforge") is True
        # wrong minor must not match
        assert _forge_match("21.0.24-beta", "1.20.6", "neoforge") is False
        assert _forge_match("20.4.1", "1.20.1", "neoforge") is False
        # mc without any neoforge release → never matches
        assert _forge_match("21.0.24-beta", "1.19.4", "neoforge") is False

    def test_neoforge_default_kind_is_forge(self):
        # backwards-compatible default: bare call treats as forge scheme
        assert _forge_match("1.20.1-47.2.20", "1.20.1") is True
        assert _forge_match("21.0.24-beta", "1.21") is False
