"""Explicit, local installation of the SPECIAL CLIENT Fabric mod.

No executable code is loaded from the archive. The caller must select a trusted
build; metadata checks establish compatibility, NOT publisher authenticity.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import tempfile
from zipfile import ZipFile, BadZipFile


def install_client_mod(source: Path, game_dir: Path, minecraft: str,
                       loader: str) -> Path:
    if minecraft != "1.20.1" or loader.lower() != "fabric":
        raise ValueError("SPECIAL CLIENT mod requires Minecraft 1.20.1 + Fabric")
    source, game_dir = Path(source), Path(game_dir)
    try:
        with ZipFile(source) as jar:
            info = jar.getinfo("fabric.mod.json")
            if info.file_size > 64 * 1024:
                raise ValueError("Mod metadata exceeds size limit")
            meta = json.loads(jar.read(info))
            if (not isinstance(meta, dict) or meta.get("id") != "specialclient"
                    or meta.get("environment") != "client"
                    or meta.get("depends", {}).get("minecraft") != "1.20.1"):
                raise ValueError("Not a compatible SPECIAL CLIENT mod")
            if "dev/specialclient/SpecialClient.class" not in jar.namelist():
                raise ValueError("Archive does not contain compiled client classes")
    except (BadZipFile, KeyError, json.JSONDecodeError, AttributeError) as exc:
        raise ValueError("Invalid Fabric mod archive") from exc
    mods = game_dir / "mods"
    mods.mkdir(parents=True, exist_ok=True)
    target = mods / "special-client.jar"
    # Refuse to leave a second copy with a different filename installed.
    for other in mods.glob("*.jar"):
        if other == target:
            continue
        try:
            with ZipFile(other) as jar:
                if json.loads(jar.read("fabric.mod.json")).get("id") == "specialclient":
                    raise ValueError(f"Remove existing SPECIAL CLIENT mod first: {other.name}")
        except (BadZipFile, KeyError, json.JSONDecodeError, AttributeError):
            continue
    fd, temporary = tempfile.mkstemp(prefix=".special-client-", suffix=".tmp", dir=mods)
    try:
        with os.fdopen(fd, "wb") as out, source.open("rb") as inp:
            shutil.copyfileobj(inp, out)
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return target
