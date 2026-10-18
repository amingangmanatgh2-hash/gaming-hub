"""Performance presets and RAM recommendation.

Presets map to vanilla ``options.txt`` keys so they work with or without
mods (with the performance mod stack, the same keys are honoured — Sodium
reads the vanilla options for render distance etc.). No FPS promises are
made; presets are *recommended starting points* for different hardware
tiers.
"""
from __future__ import annotations

from dataclasses import dataclass, field

PRESETS = {
    "potato": {
        "label": "Potato",
        "description": "Minimum hardware: 4 GB RAM, Intel HD Graphics.",
        "ram_mb": 2048,
        "options": {
            "renderDistance": "4",
            "simulationDistance": "4",
            "entityDistanceScaling": "0.5",
            "graphics": "fast",
            "renderClouds": "false",
            "guiScale": "2",
            "maxFps": "60",
            "biomeBlendRadius": "2",
            "entityShadows": "false",
            "ao": "off",
            "particles": "minimal",
            "backgroundBlurr": "false",
        },
    },
    "low": {
        "label": "Low",
        "description": "Entry-level hardware: 4–8 GB RAM, iGPU.",
        "ram_mb": 3072,
        "options": {
            "renderDistance": "6",
            "simulationDistance": "6",
            "entityDistanceScaling": "0.75",
            "graphics": "fast",
            "renderClouds": "false",
            "guiScale": "2",
            "maxFps": "90",
            "biomeBlendRadius": "2",
            "entityShadows": "false",
            "ao": "off",
            "particles": "decreased",
            "backgroundBlurr": "false",
        },
    },
    "balanced": {
        "label": "Balanced",
        "description": "Mainstream hardware: 8 GB RAM, dGPU or iGPU.",
        "ram_mb": 4096,
        "options": {
            "renderDistance": "10",
            "simulationDistance": "10",
            "entityDistanceScaling": "1.0",
            "graphics": "fast",
            "renderClouds": "true",
            "guiScale": "3",
            "maxFps": "120",
            "biomeBlendRadius": "2",
            "entityShadows": "true",
            "ao": "semi",
            "particles": "all",
            "backgroundBlurr": "false",
        },
    },
    "high": {
        "label": "High",
        "description": "Performance hardware: 16 GB+ RAM, modern dGPU.",
        "ram_mb": 6144,
        "options": {
            "renderDistance": "14",
            "simulationDistance": "14",
            "entityDistanceScaling": "1.0",
            "graphics": "pretty",
            "renderClouds": "true",
            "guiScale": "3",
            "maxFps": "240",
            "biomeBlendRadius": "3",
            "entityShadows": "true",
            "ao": "full",
            "particles": "all",
            "backgroundBlurr": "true",
        },
    },
}


@dataclass
class PresetApplyResult:
    written: dict = field(default_factory=dict)
    skipped: dict = field(default_factory=dict)
    options_path: str = ""


def recommended_ram_mb(total_system_ram_mb: int) -> int:
    """Recommend a game allocation that never starves the OS.

    Heuristics (documented in the UI):
    * always leave at least 1 GB for the OS + desktop,
    * 4 GB systems  -> 2 GB max (the game + Windows must fit),
    * 8 GB systems  -> 4 GB,
    * 16 GB systems -> 6 GB,
    * 32 GB+        -> 8 GB cap (more rarely helps; avoids OOM on mods).
    """
    total = max(1024, int(total_system_ram_mb))
    if total <= 4096:
        return 2048
    if total <= 8192:
        return 4096
    if total <= 16384:
        return 6144
    return 8192


def apply_preset(preset: str, options_path, *, existing: dict | None = None,
                 overrides: dict | None = None, mc_version: str = "1.20.1") -> PresetApplyResult:
    """Merge a preset into an options dict.

    ``existing`` models the current options.txt (key → value string) so we
    never clobber user settings outside the preset's keys.
    """
    if preset not in PRESETS:
        raise KeyError(f"unknown preset {preset!r}")
    p = PRESETS[preset]
    base = dict(existing or {})
    result = PresetApplyResult(options_path=str(options_path))
    for key, value in p["options"].items():
        if key in base:
            result.skipped[key] = base[key]
        base[key] = value
        result.written[key] = value
    for key, value in (overrides or {}).items():
        base[key] = str(value)
        result.written[key] = str(value)
    graphics = base.pop("graphics", None)
    if graphics is not None:
        base["graphicsMode"] = "0" if graphics == "fast" else "1"
        base["fancyGraphics"] = "false" if graphics == "fast" else "true"
    base["particles"] = {"minimal": "2", "decreased": "1", "all": "0"}.get(base.get("particles"), base.get("particles", "0"))
    from ..versions import compare
    ao = base.get("ao", "off")
    base["ao"] = ("false" if ao == "off" else "true") if compare(mc_version, "1.13") >= 0 else {"off":"0", "semi":"1", "full":"2"}.get(ao, ao)
    result.written["__options__"] = _format_options(base)
    return result


def preset_ram_mb(preset: str, system_total_mb: int) -> int:
    """Preset RAM, clamped by what the machine can actually spare."""
    p = PRESETS.get(preset)
    if not p:
        return 4096
    want = p["ram_mb"]
    cap = recommended_ram_mb(system_total_mb)
    return min(want, cap)


def _format_options(options: dict) -> str:
    """Render options dict in vanilla options.txt order-ish, one per line."""
    order = [k for k in ("renderDistance", "simulationDistance", "entityDistanceScaling",
                         "graphics", "ao", "particles", "renderClouds", "guiScale",
                         "maxFps", "biomeBlendRadius", "entityShadows", "backgroundBlurr")]
    lines = []
    for k in order:
        if k in options:
            lines.append(f"{k}:{options[k]}")
    for k, v in options.items():
        if k not in order and k != "__options__":
            lines.append(f"{k}:{v}")
    return "\n".join(lines) + "\n"
