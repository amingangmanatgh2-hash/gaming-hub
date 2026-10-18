"""Dedicated installation roots; never default to the user's vanilla .minecraft."""
from __future__ import annotations

import os
from pathlib import Path
import tempfile


def default_game_dir() -> Path:
    explicit = os.environ.get("SPECIAL_CLIENT_GAME_DIR")
    if explicit and not is_vanilla(Path(explicit)):
        return Path(explicit).expanduser()
    if os.name == "nt":
        for letter in "DEFGHIJKLMNOPQRSTUVWXYZ":
            root = Path(letter + ":/")
            if not root.is_dir():
                continue
            try:
                destination = root / "SpecialClient"
                destination.mkdir(exist_ok=True)
                with tempfile.TemporaryFile(dir=destination):
                    pass
                return destination / "game"
            except OSError:
                continue
    return Path.home() / "SpecialClient" / "game"


def is_vanilla(path: Path) -> bool:
    target = path.expanduser().resolve()
    vanilla = (Path.home() / ".minecraft").resolve()
    return target == vanilla or vanilla in target.parents
