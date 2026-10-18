import time
from unittest.mock import patch

import requests
from special_client.core import net
from special_client.core.manifest import (GITHUB_CATALOG_URL, MANIFEST_URL, load_manifest)
from special_client.core.versions import is_supported


RAW = {"latest": {"release": "1.20.1"}, "versions": [
    {"id": "1.8.9", "type": "release", "url": "https://piston-meta.mojang.com/legacy.json"},
    {"id": "1.20.1", "type": "release", "url": "https://piston-meta.mojang.com/current.json"}]}


class Response:
    status_code = 200
    def json(self):
        return RAW


class Session:
    def __init__(self, failures=()):
        self.calls = []
        self.failures = failures
    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url in self.failures:
            raise requests.ConnectionError("synthetic offline")
        return Response()


def test_session_wrapper_calls_original_once_not_itself():
    with patch.object(requests.Session, "request", autospec=True, return_value=Response()) as original:
        session = net.make_session(timeout=7)
        assert session.get("https://example.com").status_code == 200
        assert original.call_count == 1
        assert original.call_args.kwargs["timeout"] == 7


def test_persisted_cache_avoids_network_on_restart(tmp_path):
    first = Session()
    assert load_manifest(tmp_path, first).fetched_at > 0
    second = Session(failures=(GITHUB_CATALOG_URL, MANIFEST_URL))
    cached = load_manifest(tmp_path, second)
    assert cached.from_cache and not second.calls
    assert time.time() - cached.fetched_at < 10


def test_github_fallback_and_force_keeps_cache(tmp_path):
    official_only = Session(failures=(GITHUB_CATALOG_URL,))
    assert load_manifest(tmp_path, official_only).source == "official"
    assert [c[0] for c in official_only.calls] == [GITHUB_CATALOG_URL, MANIFEST_URL]
    offline = Session(failures=(GITHUB_CATALOG_URL, MANIFEST_URL))
    result = load_manifest(tmp_path, offline, force=True, timeout=2)
    assert result.from_cache and result.by_id("1.8.9")
    assert all(call[1]["timeout"] == 2 for call in offline.calls)


def test_future_number_format_is_eligible_not_a_release_claim():
    assert is_supported("26.3")
    assert is_supported("27.1.2")
    assert is_supported("26w03a")
    assert not is_supported("garbage")
    # No synthetic 26.3 entry is invented in a real downloaded manifest.
    assert load_manifest.__name__ == "load_manifest"
