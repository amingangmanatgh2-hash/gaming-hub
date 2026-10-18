"""Performance presets and RAM recommendation."""
from special_client.core.perf.presets import (PRESETS, apply_preset,
                                              preset_ram_mb,
                                              recommended_ram_mb)


class TestRamRecommendation:
    def test_low_end(self):
        assert recommended_ram_mb(4096) == 2048
        assert recommended_ram_mb(2048) == 2048

    def test_mid(self):
        assert recommended_ram_mb(8192) == 4096

    def test_high(self):
        assert recommended_ram_mb(16384) == 6144
        assert recommended_ram_mb(32768) == 8192

    def test_never_zero(self):
        assert recommended_ram_mb(0) > 0


class TestPresets:
    def test_all_presets_present(self):
        for key in ("potato", "low", "balanced", "high"):
            assert key in PRESETS
            p = PRESETS[key]
            assert p["ram_mb"] >= 1024
            assert "renderDistance" in p["options"]
            assert "graphics" in p["options"]

    def test_potato_is_more_conservative(self):
        pot = PRESETS["potato"]["options"]
        high = PRESETS["high"]["options"]
        assert int(pot["renderDistance"]) < int(high["renderDistance"])
        assert pot["graphics"] == "fast"
        assert high["graphics"] == "pretty"
        assert pot["entityShadows"] == "false"
        assert high["entityShadows"] == "true"

    def test_apply_preset_merges_not_clobbers(self):
        existing = {"renderDistance": "12", "fov": "110", "chatWidth": "4"}
        r = apply_preset("potato", "/tmp/options.txt", existing=existing)
        opts = r.written["__options__"]
        # preset keys applied
        assert "renderDistance:4" in opts
        # user keys preserved
        assert "fov:110" in opts
        assert "chatWidth:4" in opts

    def test_apply_preset_unknown_key_raises(self):
        import pytest
        with pytest.raises(KeyError):
            apply_preset("quantum", "/tmp/x")

    def test_preset_ram_clamped_by_system(self):
        # 'high' wants 6144, but a 4 GB system can only spare 2048
        assert preset_ram_mb("high", 4096) == 2048
        assert preset_ram_mb("high", 32768) == 6144

    def test_format_options_ordering(self):
        r = apply_preset("low", "x")
        opts = r.written["__options__"]
        # renderDistance comes before maxFps in the rendered file
        assert opts.index("renderDistance") < opts.index("maxFps")


def test_real_vanilla_colon_syntax_and_value_types():
    modern = apply_preset("potato", "options.txt", existing={"fov": "0.5"}, mc_version="1.20.1").written["__options__"]
    assert "graphicsMode:0\n" in modern
    assert "particles:2\n" in modern
    assert "ao:false\n" in modern
    assert "fov:0.5\n" in modern
    assert "=" not in modern
    legacy = apply_preset("potato", "options.txt", mc_version="1.8.9").written["__options__"]
    assert "ao:0\n" in legacy and "fancyGraphics:false\n" in legacy
