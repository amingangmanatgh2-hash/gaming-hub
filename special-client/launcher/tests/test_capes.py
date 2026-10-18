"""SPECIAL CAPES: texture generation, import, registry persistence."""

import pytest
from PIL import Image

from special_client.core.capes import texture
from special_client.core.capes.registry import CapeRegistry


class TestTexture:
    def test_size_is_cape_format(self):
        for pid in texture.PALETTES:
            img = texture.generate_cape(pid)
            assert img.size == (64, 32)
            assert img.mode == "RGBA"

    def test_body_region_has_emblem_colors(self):
        img = texture.generate_cape("legend")
        px = img.load()
        # the body region (16,16)-(24,28) must not be a flat black fill
        colors = set()
        for y in range(16, 28):
            for x in range(16, 24):
                colors.add(px[x, y][:3])
        assert len(colors) > 5
        # cyan glow present
        assert any(g > 150 and b > 150 and r < 120 for (r, g, b) in colors)

    def test_showcase_upscale(self):
        img = texture.showcase("legend", scale=8)
        assert img.size == (64 * 8, 32 * 8)

    def test_palette_schemes_differ(self):
        a = texture.generate_cape("legend").getpixel((20, 20))
        b = texture.generate_cape("ember").getpixel((20, 20))
        assert a != b


class TestImport:
    def test_import_resizes_to_64x32(self, tmp_path):
        big = Image.new("RGBA", (128, 64), (255, 0, 0, 255))
        p = tmp_path / "big.png"
        big.save(p)
        out = texture.import_cape_artwork(p)
        assert out.size == (64, 32)


class TestRegistry:
    def test_builtin_capes_present(self, tmp_path):
        reg = CapeRegistry.load(tmp_path / "cfg", tmp_path / "caps")
        ids = {c.id for c in reg.capes}
        assert "special-legend" in ids
        assert "special-ember" in ids
        assert "special-frost" in ids

    def test_save_generates_files(self, tmp_path):
        cfg, caps = tmp_path / "cfg", tmp_path / "caps"
        reg = CapeRegistry()
        reg.self_uuid = "uuid-me"
        reg.assign_self("special-legend")
        reg.save(cfg, caps)
        assert (cfg / "cape-registry.json").exists()
        assert (caps / "special-legend.png").exists()
        assert (caps / "special-ember.png").exists()
        # roundtrip
        reg2 = CapeRegistry.load(cfg, caps)
        assert reg2.assignments.get("uuid-me") == "special-legend"
        assert reg2.self_uuid == "uuid-me"

    def test_add_custom_cape(self, tmp_path):
        cfg, caps = tmp_path / "cfg", tmp_path / "caps"
        reg = CapeRegistry()
        art = Image.new("RGBA", (64, 32), (10, 200, 10, 255))
        p = tmp_path / "art.png"
        art.save(p)
        cape = reg.add_custom(p, "My Cape")
        assert cape.builtin is False
        reg.save(cfg, caps)
        assert (caps / cape.file).exists()
        reg2 = CapeRegistry.load(cfg, caps)
        got = reg2.cape(cape.id)
        assert got is not None
        assert got.name == "My Cape"

    def test_assign_invalid_cape_raises(self, tmp_path):
        reg = CapeRegistry()
        reg.self_uuid = "u"
        with pytest.raises(KeyError):
            reg.assign_self("nope")
