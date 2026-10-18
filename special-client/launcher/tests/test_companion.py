import json
import time
import uuid

import pytest
import requests
from special_client.core.companion import (ChatClient, CompanionError, Mailbox,
                                           SecretStore, atomic_json, endpoint)


@pytest.mark.parametrize("url", ["http://api.example.com/v1", "https://localhost/v1", "https://127.0.0.1/v1",
                                     "https://10.0.0.1/v1", "https://[::1]/v1", "https://a:b@example.com/v1",
                                     "https://example.com/v1?key=secret", "https://example.com:8443/v1"])
def test_endpoint_rejects_unsafe_forms(url):
    with pytest.raises(CompanionError):
        endpoint(url)


def test_key_bound_to_endpoint(tmp_path):
    store = SecretStore(tmp_path)
    store.save("https://api.example.com/v1", "dummy-key")
    assert store.get("https://api.example.com/v1") == "dummy-key"
    assert store.get("https://other.example.com/v1") == ""
    store.clear()
    assert store.get("https://api.example.com/v1") == ""


class Response:
    status_code = 200
    def __init__(self, data):
        self.data = data
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def iter_content(self, n):
        yield json.dumps(self.data).encode()


class Session:
    def __init__(self, data):
        self.response = Response(data)
    def post(self, url, **kwargs):
        self.url, self.kwargs = url, kwargs
        return self.response


def test_chat_sanitizes_tools_and_key():
    session = Session({"choices": [{"message": {"content": "dummy-key hello", "tool_calls": [
        {"function": {"name": "game_action", "arguments": '{"action":"collect_emerald"}'}},
        {"function": {"name": "shell", "arguments": '{"cmd":"delete"}'}}
    ]}}]})
    result = ChatClient(session).ask("https://api.example.com/v1", "test-model", "dummy-key", [{"role": "user", "content": "hello"}])
    assert result == {"text": "[redacted] hello", "actions": ["collect_emerald"]}
    assert session.kwargs["allow_redirects"] is False
    assert "world" not in session.kwargs["json"]
    assert session.url.endswith("/v1/chat/completions")


def test_no_arbitrary_action():
    session = Session({"choices": [{"message": {"content": "hi", "tool_calls": [
        {"function": {"name": "game_action", "arguments": '{"action":"run_code"}'}}
    ]}}]})
    result = ChatClient(session).ask("https://api.example.com/v1", "m", "key", [{"role": "user", "content": "hello"}])
    assert result["actions"] == []


def test_api_redirect_not_followed():
    session = Session({})
    session.response.status_code = 302
    with pytest.raises(CompanionError, match="HTTP 302"):
        ChatClient(session).ask("https://api.example.com/v1", "m", "key", [{"role": "user", "content": "hi"}])


def test_error_never_echoes_authorization():
    class Broken:
        def post(self, *args, **kwargs):
            raise requests.RequestException("secret-key and internal details")
    with pytest.raises(CompanionError) as exc:
        ChatClient(Broken()).ask("https://api.example.com/v1", "m", "secret-key", [{"role": "user", "content": "hi"}])
    assert "secret-key" not in str(exc.value)


def state(box, private=True, age=0):
    value = {"session": str(uuid.uuid4()), "updated": time.time() - age, "private_world": private}
    atomic_json(box.root / "state.json", value)
    return value


def test_mailbox_requires_live_private_session(tmp_path):
    box = Mailbox(tmp_path)
    with pytest.raises(CompanionError):
        box.send("collect_emerald")
    state(box, private=False)
    with pytest.raises(CompanionError, match="singleplayer"):
        box.send("collect_emerald")
    box.send("stop")
    assert box.read("command.json")["action"] == "stop"


def test_stale_and_unknown_rejected(tmp_path):
    box = Mailbox(tmp_path)
    state(box, age=30)
    with pytest.raises(CompanionError):
        box.send("collect_diamond")
    with pytest.raises(CompanionError):
        box.send("execute_anything")


def test_one_command_at_a_time(tmp_path):
    box = Mailbox(tmp_path)
    live = state(box)
    command_id = box.send("collect_diamond")
    assert box.read("command.json")["session"] == live["session"]
    assert box.read("command.json")["id"] == command_id
    with pytest.raises(CompanionError, match="pending"):
        box.send("collect_emerald")
    box.send("stop")
    assert box.read("command.json")["action"] == "stop"


def test_chat_request_session_and_size(tmp_path):
    box = Mailbox(tmp_path)
    live = state(box)
    request = {"session": live["session"], "id": str(uuid.uuid4()), "created": time.time(), "text": "hello"}
    atomic_json(box.root / "chat-request.json", request)
    assert box.take_chat() == request
    assert box.take_chat() == {}
    request["session"] = str(uuid.uuid4())
    atomic_json(box.root / "chat-request.json", request)
    assert box.take_chat() == {}
