"""Public, local cosmetic preferences; peer sharing is explicit, not a global cape service."""
import json
from pathlib import Path
import uuid
from .capes.texture import PALETTES
from .companion import atomic_json


class CosmeticsStore:
    def __init__(self, game_dir):
        self.path = Path(game_dir) / "special/config/cosmetics.json"

    def read(self):
        try:
            if self.path.stat().st_size > 64 * 1024:
                return {"self": {}, "peers": {}}
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return {"self": self.clean(value.get("self", {})), "peers": self.peers(value.get("peers", {}))}
        except (OSError, ValueError, AttributeError, TypeError):
            return {"self": {}, "peers": {}}

    @staticmethod
    def clean(value):
        if not isinstance(value, dict):
            return {}
        return {"cape": value.get("cape") if value.get("cape") in PALETTES else "", "wings": value.get("wings") is True}

    @classmethod
    def peers(cls, data):
        if not isinstance(data, dict):
            return {}
        result = {}
        for uid, prefs in list(data.items())[:64]:
            try:
                result[str(uuid.UUID(uid))] = cls.clean(prefs)
            except (ValueError, TypeError, AttributeError):
                continue
        return result

    def set_self(self, *, cape=None, wings=None):
        value = self.read()
        if cape is not None:
            if cape not in PALETTES and cape != "":
                raise ValueError("Unknown built-in palette")
            value["self"]["cape"] = cape
        if wings is not None:
            value["self"]["wings"] = bool(wings)
        atomic_json(self.path, value)

    def export_peer(self, uid, destination):
        atomic_json(Path(destination), {"peers": {str(uuid.UUID(uid)): self.read()["self"]}})

    def import_peers(self, source):
        source = Path(source)
        if source.stat().st_size > 64 * 1024:
            raise ValueError("Cosmetic profile too large")
        incoming = self.peers(json.loads(source.read_text(encoding="utf-8")).get("peers", {}))
        value = self.read()
        value["peers"] = dict(list({**value["peers"], **incoming}.items())[-64:])
        atomic_json(self.path, value)
        return len(incoming)
