"""In-game stats bridge.

The in-game module (SPECIAL CLIENT for Fabric) writes a small JSON file
every second while the game runs:

    <game_dir>/special/config/game-stats.json
    {
      "version": 1,
      "fps": 240,
      "frame_ms_avg": 4.2,
      "frame_ms_worst": 38.0,
      "ping_ms": 34,            # -1 when not on a server
      "updated": 1736999999
    }

The launcher reads it (with mtime caching) for the performance dashboard.
The file is created by the game, never by the launcher, so a stale file
from a previous session is detected via ``updated`` and ignored.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

STALE_AFTER_SECONDS = 10


@dataclass
class GameStats:
    fps: int = 0
    frame_ms_avg: float = 0.0
    frame_ms_worst: float = 0.0
    ping_ms: int = -1
    updated: float = 0.0

    @property
    def fresh(self) -> bool:
        return (time.time() - self.updated) < STALE_AFTER_SECONDS


class StatsBridge:
    def __init__(self, game_dir: Path):
        self.path = Path(game_dir) / "special" / "config" / "game-stats.json"
        self._cache: GameStats | None = None
        self._cache_mtime = 0.0

    def read(self, force: bool = False) -> GameStats | None:
        if not self.path.exists():
            return None
        try:
            mtime = self.path.stat().st_mtime
            if not force and self._cache is not None and mtime == self._cache_mtime:
                return self._cache
            data = json.loads(self.path.read_text())
            stats = GameStats(
                fps=int(data.get("fps", 0)),
                frame_ms_avg=float(data.get("frame_ms_avg", 0.0)),
                frame_ms_worst=float(data.get("frame_ms_worst", 0.0)),
                ping_ms=int(data.get("ping_ms", -1)),
                updated=float(data.get("updated", time.time())),
            )
            self._cache = stats
            self._cache_mtime = mtime
            return stats
        except (json.JSONDecodeError, OSError, ValueError):
            return None
