"""Crash-log parsing and human-friendly error diagnosis.

Scans launcher-captured game output + Minecraft crash reports for the
known failure classes and produces actionable guidance.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Diagnosis:
    kind: str           # ok | crash | oom | auth | missing_library | gpu | unknown
    summary: str
    detail: str = ""
    suggestion: str = ""
    timestamp: float = field(default_factory=time.time)


_PATTERNS = [
    ("oom", re.compile(
        r"OutOfMemoryError|Java heap space|GC overhead limit|Unable to create the Java Virtual Machine",
        re.IGNORECASE)),
    ("auth", re.compile(
        r"Invalid session|Authentication error|Failed to verify username|Not authorized|"
        r"java\.lang\.IllegalArgumentException: Null or empty username|Invalid credentials|"
        r"Failed to login", re.IGNORECASE)),
    ("missing_library", re.compile(
        r"java\.lang\.NoClassDefFoundError|java\.lang\.ClassNotFoundException|UnsatisfiedLinkError|"
        r"java\.lang\.NoSuchMethodError", re.IGNORECASE)),
    ("gpu", re.compile(
        r"does not support a valid graphics card|Failed to initialize GLFW|"
        r"Failed to create the Display|OpenGL error|GLFW error|Could not init "
        r"video mode|PIX_OUT_OF_MEMORY|driver (?:problem|failure|error)|"
        r"fallback to software rendering",
        re.IGNORECASE)),
    ("crash", re.compile(
        r"Report saved to|crash-reports|Minecraft has crashed|Exception in thread \"main\"|"
        r"Unexpected error|Game crashed", re.IGNORECASE)),
]


def diagnose(text: str) -> Diagnosis:
    """Analyse a chunk of game log text and return the best diagnosis."""
    for kind, rx in _PATTERNS:
        m = rx.search(text)
        if m:
            line = _line_around(text, m.start())
            return Diagnosis(kind=kind, summary=_summary(kind),
                             detail=line[:400], suggestion=_suggestion(kind, line))
    return Diagnosis(kind="ok", summary="No crash signatures found.")


def _line_around(text: str, pos: int) -> str:
    start = text.rfind("\n", 0, pos) + 1
    end = text.find("\n", pos)
    if end == -1:
        end = len(text)
    return text[start:end].strip()


def _summary(kind: str) -> str:
    return {
        "oom": "Out of memory — the game ran out of allocated RAM.",
        "auth": "Authentication failure.",
        "missing_library": "A required class or native library is missing.",
        "gpu": "Graphics / GPU driver problem.",
        "crash": "The game crashed.",
        "ok": "Healthy.",
        "unknown": "Unknown failure.",
    }.get(kind, "Unknown failure.")


def _suggestion(kind: str, line: str) -> str:
    if kind == "oom":
        return ("Increase the RAM allocation in the Play page (and close "
                "memory-heavy apps), or reduce render distance. On 4 GB "
                "systems run the Potato preset.")
    if kind == "auth":
        return ("Your session expired or the account has no Minecraft Java "
                "license. Re-login in the Play page. Offline sessions only "
                "work where the server allows them.")
    if kind == "missing_library":
        return ("Run 'Repair' on the Play page to re-verify libraries and "
                "assets. If you changed the Java version, use the Java "
                "recommended for this Minecraft version.")
    if kind == "gpu":
        return ("Update your GPU drivers. If you use a laptop with dual "
                "graphics, force the discrete GPU for the launcher/game. "
                "Check the full log for the exact error.")
    if kind == "crash":
        return ("Open the Logs page for the full log and crash report "
                "location. A crash report is also saved in the game "
                "directory under crash-reports/.")
    return "Open the Logs page for details."


def parse_crash_reports(crash_dir: Path, limit: int = 10) -> list:
    """List newest crash reports (plain text) in a crash-reports dir."""
    out = []
    if not crash_dir.exists():
        return out
    files = sorted(crash_dir.glob("crash-*.txt"),
                   key=lambda f: f.stat().st_mtime, reverse=True)[:limit]
    for f in files:
        head = ""
        try:
            head = f.read_text(errors="replace")[:600]
        except OSError:
            pass
        out.append({"file": f.name, "preview": head,
                    "mtime": f.stat().st_mtime})
    return out


def tail_log(log_path: Path, max_chars: int = 60000) -> str:
    if not log_path.exists():
        return ""
    try:
        data = log_path.read_text(errors="replace")
        return data[-max_chars:]
    except OSError:
        return ""
