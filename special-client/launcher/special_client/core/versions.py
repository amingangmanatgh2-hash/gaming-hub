"""Minecraft version identification and ordering.

Handles the three id shapes Mojang uses in the version manifest:

* releases/old versions   : ``1.8.9``, ``1.20.1``, ``1.21.4``
* modern snapshots        : ``25w03a`` (year 2025, week 3, build a)
* legacy snapshots        : ``1.21.1-SNAPSHOT`` style ids (rare, still numeric)

Ordering is used by the version selector and by compatibility checks in the
mod catalog. Where a manifest entry carries a ``time`` field, the UI prefers
that timestamp; :func:`version_key` is the pure-string fallback.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_SNAP_RE = re.compile(r"^(\d{2})w(\d{2})([ab])?$")
_NUM_RE = re.compile(r"^1\.(\d+)(?:\.(\d+))?(.*)$")

#: Inclusive supported range for the launcher. 1.8 (legacy argument format)
#: through the latest 1.21.x release line; future 1.21.x ids are accepted.
SUPPORTED_MIN = "1.8"
SUPPORTED_MAX = "1.21.99"


@dataclass(frozen=True)
class VersionKey:
    """Sortable key for a version id."""
    kind: str            # "release" | "snapshot"
    parts: tuple         # release: (major, minor, patch, suffix)
                         # snapshot: (year, week, letter_rank)
    raw: str


def version_key(v: str) -> VersionKey:
    v = v.strip()
    m = _SNAP_RE.match(v)
    if m:
        year, week, letter = int(m.group(1)), int(m.group(2)), m.group(3) or "a"
        return VersionKey("snapshot", (year, week, _letter_rank(letter)), v)
    m = _NUM_RE.match(v)
    if m:
        patch = int(m.group(2)) if m.group(2) is not None else 0
        return VersionKey("release", (1, int(m.group(1)), patch, m.group(3)), v)
    # unknown shape: order after everything, deterministic
    return VersionKey("unknown", (999, 999, 999, v), v)


def _letter_rank(letter: str) -> int:
    return {"a": 0, "b": 1}.get(letter, 2)


def compare(a: str, b: str) -> int:
    """Return -1/0/1 ordering *a* and *b* by release recency."""
    ka, kb = version_key(a), version_key(b)
    # snapshots (year-based) are always newer than any 1.x release
    if ka.kind == "snapshot" and kb.kind in ("release", "unknown"):
        return 1
    if kb.kind == "snapshot" and ka.kind in ("release", "unknown"):
        return -1
    if ka.kind != kb.kind:
        return -1 if ka.kind < kb.kind else 1
    if ka.parts < kb.parts:
        return -1
    if ka.parts > kb.parts:
        return 1
    return 0


def is_supported(v: str) -> bool:
    return compare(v, SUPPORTED_MIN) >= 0 and compare(v, SUPPORTED_MAX) <= 0


def normalize(v: str) -> str:
    return v.strip()
