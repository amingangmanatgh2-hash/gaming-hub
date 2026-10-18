"""Download manager: verification, resume, abort, speed events."""
import hashlib

import pytest

from special_client.core.download import DownloadManager, DownloadRequest


def _sha1(data):
    return hashlib.sha1(data).hexdigest()


def test_basic_download_with_sha1(tmp_path, http_server):
    data = http_server["files"]["/libs/common-3.0.0.jar"]
    dm = DownloadManager(allow_http=True)
    events = []
    dm.add_listener(lambda p: events.append(p.state))
    dest = tmp_path / "out.jar"
    p = dm.download(DownloadRequest(
        url=http_server["base"] + "/libs/common-3.0.0.jar",
        dest=dest, sha1=_sha1(data)))
    assert dest.read_bytes() == data
    assert p.state == "done"
    assert "downloading" in events


def test_sha1_mismatch_fails_and_cleans(tmp_path, http_server):
    dm = DownloadManager(allow_http=True, max_retries=0)
    dest = tmp_path / "bad.jar"
    with pytest.raises(Exception) as ei:
        dm.download(DownloadRequest(
            url=http_server["base"] + "/libs/common-3.0.0.jar",
            dest=dest, sha1="f" * 40))
    assert "SHA-1 mismatch" in str(ei.value)
    assert not dest.exists()


def test_resume_after_partial(tmp_path, http_server):
    url = http_server["base"] + "/libs/core-lib-natives-win.jar"
    data = http_server["files"]["/libs/core-lib-natives-win.jar"]
    dm = DownloadManager(allow_http=True, max_retries=0)
    dest = tmp_path / "part.jar"
    # simulate an interrupted download: first 10 bytes on disk
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data[:10])
    dm.download(DownloadRequest(url=url, dest=dest, resume=True,
                                sha1=_sha1(data)))
    assert dest.read_bytes() == data


def test_abort(tmp_path, http_server):
    url = http_server["base"] + "/libs/common-3.0.0.jar"
    dm = DownloadManager(allow_http=True, max_retries=0)
    dest = tmp_path / "ab.jar"
    states = []
    dm.add_listener(lambda p: states.append(p.state))
    t = dm.start(DownloadRequest(url=url, dest=dest))
    dm.abort(url)
    t.join(timeout=10)
    assert "aborted" in states or not dest.exists()


def test_progress_reports_speed_and_eta_shape(tmp_path, http_server):
    dm = DownloadManager(allow_http=True)
    seen = []
    dm.add_listener(lambda p: seen.append(
        (p.received, p.total, p.speed_bps >= 0,
         p.eta_seconds is None or p.eta_seconds >= 0)))
    data = http_server["files"]["/libs/core-lib-natives-win.jar"]
    dm.download(DownloadRequest(
        url=http_server["base"] + "/libs/core-lib-natives-win.jar",
        dest=tmp_path / "x.jar", sha1=_sha1(data), size=len(data)))
    assert seen and all(s[2] and s[3] for s in seen)


def test_https_enforced(tmp_path):
    dm = DownloadManager()
    dest = tmp_path / "y.jar"
    with pytest.raises(Exception):
        dm.download(DownloadRequest(
            url="http://127.0.0.1:1/nope.jar", dest=dest, resume=False))
    assert not dest.exists()


def test_retry_then_success(tmp_path, http_server):
    """Transient failure (404 once) then success via retry."""
    data = http_server["files"]["/libs/common-3.0.0.jar"]
    url = http_server["base"] + "/libs/common-3.0.0.jar"
    calls = {"n": 0}
    import requests

    dm = DownloadManager(allow_http=True, max_retries=2, retries_delay=0.05)

    orig = dm.session.get

    def flaky(url_, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            orig(url_, **kw)
            # first attempt: 404
            class FakeR:
                status_code = 404
                headers = {}
                def __enter__(self_):
                    raise requests.HTTPError("boom")
                def __exit__(self_, *a):
                    return False
            return FakeR()
        return orig(url_, **kw)

    dm.session.get = flaky
    dest = tmp_path / "r.jar"
    dm.download(DownloadRequest(url=url, dest=dest, sha1=_sha1(data)))
    assert calls["n"] >= 2
    assert dest.read_bytes() == data
