"""Opt-in BYOK chat and narrow, session-scoped local game commands. No Qt required."""
from __future__ import annotations

import ipaddress
import json
import os
from pathlib import Path
import tempfile
import time
import uuid
from urllib.parse import urlsplit

import requests
from .credentials import protect, unprotect

PROVIDERS = {
    "openai": ("https://api.openai.com/v1", "gpt-4.1-mini"),
    "groq": ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
}
ACTIONS = {"collect_emerald", "collect_diamond", "stop"}
TOOLS = [{"type": "function", "function": {
    "name": "game_action", "description": "Propose a local practice action; requires user confirmation. Not server-wide automation.",
    "parameters": {"type": "object", "properties": {"action": {"type": "string", "enum": sorted(ACTIONS)}},
                   "required": ["action"], "additionalProperties": False},
}}]
SYSTEM = ("You are the SPECIAL CLIENT companion. Reply in the user's language. "
          "You have no map vision, world data or microphone. Never claim to have performed actions. "
          "You may propose only the provided game_action tool; it needs manual confirmation. "
          "Collection is experimental, private singleplayer only, visible dropped emerald/diamond "
          "entities on loaded, flat routes. No general server/map navigation is guaranteed. "
          "Do not invent game state. Do not request passwords or API keys in chat.")


class CompanionError(RuntimeError):
    pass


def endpoint(value: str) -> str:
    value = value.strip().rstrip("/")
    try:
        p = urlsplit(value)
        if p.scheme != "https" or not p.hostname or p.username or p.password or p.query or p.fragment:
            raise ValueError()
        if p.port not in (None, 443):
            raise ValueError()
        host = p.hostname.lower()
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            raise ValueError()
        try:
            if not ipaddress.ip_address(host).is_global:
                raise ValueError()
        except ValueError as exc:
            # A DNS hostname is allowed; a non-global IP literal is not.
            if ":" in host or host.replace(".", "").isdigit():
                raise ValueError() from exc
        if len(value) > 300:
            raise ValueError()
    except ValueError as exc:
        raise CompanionError("Use a trusted public HTTPS API base URL (no credentials/query/redirects).") from exc
    return value


def atomic_json(path: Path, value: dict) -> None:
    atomic_bytes(path, json.dumps(value, ensure_ascii=False).encode("utf-8"))


def atomic_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".companion-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
        os.replace(name, path)
        if os.name != "nt":
            os.chmod(path, 0o600)
    finally:
        Path(name).unlink(missing_ok=True)


class SecretStore:
    """Per-endpoint key binding prevents silently forwarding a saved key to a new provider."""
    def __init__(self, home: Path):
        self.path = Path(home) / "companion-key.dat"

    def save(self, base: str, key: str) -> None:
        base = endpoint(base)
        key = key.strip()
        if not key or len(key) > 2048 or any(c.isspace() for c in key):
            raise CompanionError("Enter a valid API key in the password field, not in chat.")
        atomic_bytes(self.path, protect(json.dumps({"endpoint": base, "key": key}).encode()))

    def get(self, base: str) -> str:
        try:
            data = json.loads(unprotect(self.path.read_bytes()))
            if data.get("endpoint") == endpoint(base):
                return str(data.get("key", ""))
        except (OSError, ValueError, AttributeError, CompanionError):
            pass
        return ""

    def clear(self) -> None:
        self.path.unlink(missing_ok=True)


class ChatClient:
    def __init__(self, session=None):
        self.session = session or requests.Session()

    def ask(self, base: str, model: str, key: str, messages: list) -> dict:
        base = endpoint(base)
        if not key or not model.strip() or len(model) > 150:
            raise CompanionError("Configure an API key and a model first. Local commands need no key.")
        clean = [{"role": m["role"], "content": str(m["content"])[:4000]}
                 for m in messages[-16:] if m.get("role") in ("user", "assistant")]
        if not clean:
            raise CompanionError("Enter a message first.")
        try:
            with self.session.post(base + "/chat/completions", json={
                "model": model.strip(), "messages": [{"role": "system", "content": SYSTEM}] + clean,
                "tools": TOOLS, "tool_choice": "auto", "max_tokens": 700,
            }, headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
                    timeout=(8, 45), stream=True, allow_redirects=False) as response:
                if response.status_code != 200:
                    raise CompanionError(f"API request failed (HTTP {response.status_code}); check endpoint, model, quota and key.")
                raw = bytearray()
                for part in response.iter_content(8192):
                    raw.extend(part)
                    if len(raw) > 128 * 1024:
                        raise CompanionError("API response exceeds size limit.")
                body = json.loads(raw)
            message = body["choices"][0]["message"]
            text = message.get("content") or ""
            if not isinstance(text, str):
                raise ValueError()
            actions = []
            for call in message.get("tool_calls") or []:
                if call.get("function", {}).get("name") != "game_action":
                    continue
                args = json.loads(call["function"]["arguments"])
                if set(args) == {"action"} and args["action"] in ACTIONS and args["action"] not in actions:
                    actions.append(args["action"])
            # Do not propagate accidental key echoes into UI/history.
            return {"text": text[:8000].replace(key, "[redacted]"), "actions": actions[:1]}
        except CompanionError:
            raise
        except (requests.RequestException, ValueError, KeyError, IndexError, TypeError, AttributeError):
            raise CompanionError("API connection or response failed. No game command was executed.") from None


class Mailbox:
    """Local same-user IPC, not a network endpoint or arbitrary command interpreter."""
    def __init__(self, game_dir: Path):
        self.root = Path(game_dir) / "special" / "companion"

    def read(self, name: str) -> dict:
        path = self.root / name
        try:
            if path.is_symlink() or path.stat().st_size > 32 * 1024:
                return {}
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def state(self) -> dict:
        data = self.read("state.json")
        try:
            age = time.time() - float(data["updated"])
            uuid.UUID(data["session"])
            return data if 0 <= age <= 5 else {}
        except (KeyError, ValueError, TypeError):
            return {}

    def send(self, action: str) -> str:
        if action not in ACTIONS:
            raise CompanionError("Unknown game action.")
        state = self.state()
        if not state:
            raise CompanionError("No fresh mod connection. Start the matching mod in this game directory.")
        if action != "stop" and not state.get("private_world"):
            raise CompanionError("Collection is available only in a private singleplayer practice world.")
        if action != "stop" and (self.root / "command.json").exists() and time.time() - (self.root / "command.json").stat().st_mtime < 10:
            raise CompanionError("A command is pending; wait for the game to acknowledge it.")
        uid = str(uuid.uuid4())
        atomic_json(self.root / "command.json", {"id": uid, "session": state["session"], "created": time.time(), "action": action})
        return uid

    def take_chat(self) -> dict:
        data = self.read("chat-request.json")
        if data:
            (self.root / "chat-request.json").unlink(missing_ok=True)
        try:
            state = self.state()
            age = time.time() - float(data["created"])
            uuid.UUID(data["id"])
            if (data["session"] == state.get("session") and 0 <= age <= 60
                    and isinstance(data["text"], str) and 0 < len(data["text"]) <= 4000):
                return data
        except (KeyError, ValueError, TypeError):
            pass
        return {}

    def reply(self, request: dict, text: str) -> None:
        atomic_json(self.root / "chat-response.json", {"id": request["id"], "session": request["session"], "text": text[:8000]})
