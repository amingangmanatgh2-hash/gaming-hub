"""Curated mod catalog with version-compatibility mapping.

The catalog is a *known-good* pin list used for offline installs and as a
fallback when the Modrinth API is unreachable. When online, the manager
prefers the latest version reported by Modrinth for the selected
Minecraft + loader combination; the catalog pin is the safety net.

Only reputable, widely-used projects are listed. Their licenses are
respected (see the license field per entry).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModEntry:
    slug: str                 # Modrinth project slug
    name: str
    category: str             # performance | shader | api | utility
    loaders: tuple            # ("fabric",) etc.
    mc_versions: tuple        # supported MC major.minor.minor (inclusive range endpoints)
    known_good: dict          # {mc_version: version_string} pins
    dependencies: tuple = ()  # slugs required
    description: str = ""
    license: str = ""
    optional: bool = False

    def known_good_for(self, mc: str) -> str | None:
        # exact match first, then closest lower supported pin
        if mc in self.known_good:
            return self.known_good[mc]
        best = None
        for v in sorted(self.known_good):
            if _le(v, mc) and (best is None or _le(best[0], v)):
                best = (v, self.known_good[v])
        return best[1] if best else None

    def supports(self, mc: str, loader: str) -> bool:
        if loader not in self.loaders:
            return False
        lo, hi = self.mc_versions
        return _ge(mc, lo) and _le(mc, hi)


def _le(a: str, b: str) -> bool:
    from ..versions import compare
    return compare(a, b) <= 0


def _ge(a: str, b: str) -> bool:
    from ..versions import compare
    return compare(a, b) >= 0


#: The catalog. Pins are verified-stable releases (Modrinth) for each MC.
CATALOG: list = [
    ModEntry(
        slug="fabric-api",
        name="Fabric API",
        category="api",
        loaders=("fabric",),
        mc_versions=("1.20.1", "1.21.99"),
        known_good={"1.20.1": "0.92.2+1.20.1", "1.21.1": "0.115.0+1.21.1"},
        description="Common API used by most Fabric mods.",
        license="Apache-2.0",
    ),
    ModEntry(
        slug="sodium",
        name="Sodium",
        category="performance",
        loaders=("fabric",),
        mc_versions=("1.20.1", "1.21.99"),
        known_good={"1.20.1": "0.5.10", "1.21.1": "0.5.10"},
        description="Renderer optimization; measure your own FPS/frametimes, no gain guaranteed.",
        license="Check upstream version-specific license",
    ),
    ModEntry(
        slug="lithium",
        name="Lithium",
        category="performance",
        loaders=("fabric",),
        mc_versions=("1.20.1", "1.21.99"),
        known_good={"1.20.1": "0.11.2", "1.21.1": "0.14.1"},
        description="Game logic optimizations (entities, blocks, redstone).",
        license="Check upstream version-specific license",
    ),
    ModEntry(
        slug="ferritecore",
        name="FerriteCore",
        category="performance",
        loaders=("fabric",),
        mc_versions=("1.20.1", "1.21.99"),
        known_good={"1.20.1": "6.0.3", "1.21.1": "6.0.3"},
        description="Reduces memory usage of NBT data significantly.",
        license="Apache-2.0",
    ),
    ModEntry(
        slug="immediatelyfast",
        name="ImmediatelyFast",
        category="performance",
        loaders=("fabric",),
        mc_versions=("1.20.1", "1.21.99"),
        known_good={"1.20.1": "1.2.14", "1.21.1": "1.2.21"},
        description="Fixes expensive rendering operations (atlases, etc.).",
        license="Check upstream version-specific license",
    ),
    ModEntry(
        slug="entityculling",
        name="Entity Culling",
        category="performance",
        loaders=("fabric", "quilt"),
        mc_versions=("1.20.1", "1.21.99"),
        known_good={"1.20.1": "1.6.2", "1.21.1": "1.7.0"},
        description="Skips rendering entities you cannot see.",
        license="Check upstream version-specific license",
    ),
    ModEntry(
        slug="modernfix",
        name="ModernFix",
        category="performance",
        loaders=("fabric", "quilt"),
        mc_versions=("1.20.1", "1.21.99"),
        known_good={"1.20.1": "5.14.4", "1.21.1": "5.20.1"},
        description="Collection of modernization and startup optimizations.",
        license="Check upstream version-specific license",
    ),
    ModEntry(
        slug="iris",
        name="Iris Shaders",
        category="shader",
        loaders=("fabric",),
        mc_versions=("1.20.1", "1.21.99"),
        known_good={"1.20.1": "1.6.19", "1.21.1": "1.8.4"},
        dependencies=("sodium", "indium"),
        description="OpenGL shader support with low overhead.",
        license="Check upstream version-specific license",
    ),
    ModEntry(
        slug="indium",
        name="Indium",
        category="performance",
        loaders=("fabric",),
        mc_versions=("1.20.1", "1.21.99"),
        known_good={"1.20.1": "1.0.34", "1.21.1": "1.0.34"},
        description="Sodium-compatible model rendering (required by Iris).",
        license="Check upstream version-specific license",
        optional=True,
    ),
]

#: Suggested bundles per performance preset (slug lists).
PRESET_BUNDLES = {
    "potato": ["ferritecore", "lithium"],
    "low": ["ferritecore", "lithium", "entityculling"],
    "balanced": ["sodium", "lithium", "ferritecore", "immediatelyfast",
                 "entityculling", "modernfix", "indium"],
    "high": ["sodium", "lithium", "ferritecore", "immediatelyfast",
             "entityculling", "modernfix", "indium", "iris"],
}


def entry_by_slug(slug: str) -> ModEntry | None:
    for e in CATALOG:
        if e.slug == slug:
            return e
    return None


def for_mc(mc: str, loader: str) -> list:
    return [e for e in CATALOG if e.supports(mc, loader)]


def bundle_slugs(preset: str, mc: str, loader: str) -> list:
    """Slugs recommended for a preset, filtered to what this MC supports."""
    slugs = PRESET_BUNDLES.get(preset, [])
    out = []
    for s in slugs:
        e = entry_by_slug(s)
        if e and e.supports(mc, loader):
            out.append(s)
    return out
