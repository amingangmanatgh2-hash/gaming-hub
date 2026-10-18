"""Live game-process monitoring (CPU / RAM) via psutil.

FPS and frame-time are measured *inside* the game by the SPECIAL CLIENT
in-game module, which publishes them through the stats bridge (see
``statsbridge.py``). The launcher combines both sources for the
performance dashboard.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import psutil


@dataclass
class ProcessSample:
    pid: int
    cpu_percent: float = 0.0
    ram_mb: float = 0.0
    threads: int = 0
    created: float = field(default_factory=time.time)


class GameProcessMonitor:
    """Finds and samples the Minecraft java process for a given game dir."""

    def __init__(self, game_dir: str | Path):
        self.game_dir = str(Path(game_dir).resolve())
        self._proc: Optional[psutil.Process] = None
        self._last_pid: Optional[int] = None
        self._last_sample: Optional[ProcessSample] = None

    def find(self) -> Optional[psutil.Process]:
        """Locate the game process (java with our game dir in its cmdline)."""
        if self._proc is not None:
            if self._proc.is_running():
                return self._proc
            self._proc = None
        for p in psutil.process_iter(["pid", "name", "cmdline"]):
            try:
                name = (p.info.get("name") or "").lower()
                if "java" not in name and "javaw" not in name:
                    continue
                cmdline = " ".join(p.info.get("cmdline") or [])
                if self.game_dir in cmdline and "minecraft" in cmdline.lower():
                    self._proc = p
                    self._last_pid = p.pid
                    return self._proc
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return None

    def sample(self) -> Optional[ProcessSample]:
        p = self.find()
        if p is None:
            self._last_sample = None
            return None
        try:
            p.cpu_percent(None)
            mem = p.memory_info()
            self._last_sample = ProcessSample(
                pid=p.pid,
                cpu_percent=p.cpu_percent(None) or 0.0,
                ram_mb=mem.rss / (1024 * 1024),
                threads=len(p.threads()) if _can_threads(p) else 0,
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            self._last_sample = None
        return self._last_sample

    @property
    def last(self) -> Optional[ProcessSample]:
        return self._last_sample


def _can_threads(p) -> bool:
    try:
        p.threads()
        return True
    except (psutil.AccessDenied, psutil.ZombieProcess, psutil.NoSuchProcess):
        return False
