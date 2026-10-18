"""SPECIAL CAPES registry.

The registry is written to ``special/config/cape-registry.json`` and every
cape texture to ``special/capes/<id>.png``. The in-game module reads the
same files, so capes chosen in the launcher appear in-game — inside
SPECIAL CLIENT. Other clients and vanilla see the standard cape rules
(vanilla only renders a cape if the server sends one).

Visibility rules (kept honest in the UI):
* rendered by SPECIAL CLIENT for the players listed in ``assignments``
  (typically just yourself),
* universal visibility would require a server-side or account-level
  cape system; we do not fake that and we do not impersonate Mojang/Microsoft
  cosmetics.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from . import texture


@dataclass
class Cape:
    id: str
    name: str
    palette: str
    file: str                 # file name in the capes dir
    builtin: bool = True
    image_data: bytes = b""   # in-memory art for custom (non-builtin) capes


@dataclass
class CapeRegistry:
    capes: list = field(default_factory=list)
    assignments: dict = field(default_factory=dict)   # uuid -> cape id
    self_uuid: str = ""

    def __post_init__(self):
        if not self.capes:
            for pid in texture.PALETTES:
                p = texture.PALETTES[pid]
                self.capes.append(Cape(id=f"special-{pid}", name=p.name,
                                       palette=pid, file=f"special-{pid}.png"))

    # -- persistence -------------------------------------------------------
    def save(self, config_dir: Path, capes_dir: Path,
             generate: bool = True) -> None:
        config_dir.mkdir(parents=True, exist_ok=True)
        capes_dir.mkdir(parents=True, exist_ok=True)
        if generate:
            for cape in self.capes:
                if cape.builtin:
                    img = texture.generate_cape(cape.palette)
                    texture.save_cape(img, capes_dir / cape.file)
                elif cape.image_data:
                    (capes_dir / cape.file).write_bytes(cape.image_data)
        payload = {
            "format": "special-capes/1",
            "self_uuid": self.self_uuid,
            "capes": [
                {"id": c.id, "name": c.name, "palette": c.palette,
                 "file": c.file, "builtin": c.builtin}
                for c in self.capes
            ],
            "assignments": self.assignments,
            "updated": int(time.time()),
        }
        path = config_dir / "cape-registry.json"
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2))
        tmp.replace(path)

    @classmethod
    def load(cls, config_dir: Path, capes_dir: Path) -> "CapeRegistry":
        path = config_dir / "cape-registry.json"
        reg = cls()
        if path.exists():
            try:
                d = json.loads(path.read_text())
                reg.self_uuid = d.get("self_uuid", "")
                reg.assignments = d.get("assignments", {})
                reg.capes = [Cape(**c) for c in d.get("capes", [])] or reg.capes
            except (json.JSONDecodeError, OSError, TypeError):
                pass
        existing = {c.id for c in reg.capes}
        for pid, palette in texture.PALETTES.items():
            if "special-" + pid not in existing:
                reg.capes.append(Cape("special-" + pid, palette.name, pid, "special-" + pid + ".png"))
        return reg

    # -- api ----------------------------------------------------------------
    def assign_self(self, cape_id: str) -> None:
        if not any(c.id == cape_id for c in self.capes):
            raise KeyError(cape_id)
        if self.self_uuid:
            self.assignments[self.self_uuid] = cape_id

    def assign(self, uuid: str, cape_id: str) -> None:
        if not any(c.id == cape_id for c in self.capes):
            raise KeyError(cape_id)
        self.assignments[uuid] = cape_id

    def unassign(self, uuid: str) -> None:
        self.assignments.pop(uuid, None)

    def cape(self, cape_id: str) -> Optional[Cape]:
        for c in self.capes:
            if c.id == cape_id:
                return c
        return None

    def add_custom(self, src, name: str) -> Cape:
        """Import user cape artwork (resized to the 64×32 format)."""
        import io
        img = texture.import_cape_artwork(src)
        buf = io.BytesIO()
        img.save(buf, "PNG")
        cid = "custom-" + name.lower().replace(" ", "-")[:20]
        while any(c.id == cid for c in self.capes):
            cid += "-2"
        cape = Cape(id=cid, name=name, palette="custom",
                    file=f"{cid}.png", builtin=False,
                    image_data=buf.getvalue())
        self.capes.append(cape)
        return cape

    def texture_path(self, cape_id: str, capes_dir: Path) -> Optional[Path]:
        c = self.cape(cape_id)
        if c is None:
            return None
        p = Path(capes_dir) / c.file
        return p if p.exists() else None
