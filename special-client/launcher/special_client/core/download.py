"""Resumable, verified file downloads with progress reporting.

Design goals
------------
* Runs in a worker thread; the UI subscribes to a small event dict.
* Resume support (HTTP ``Range``) so interrupted installs continue.
* Bounded retries with exponential backoff; abortable at any time.
* Optional SHA-1 / SHA-256 verification after the final byte.
* Speed (bytes/s, exponential moving average) and ETA estimation.
"""
from __future__ import annotations

import hashlib
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import requests

from .net import ensure_https

CHUNK = 256 * 1024


@dataclass
class DownloadProgress:
    url: str
    dest: str
    received: int = 0
    total: int = 0            # 0 = unknown length
    speed_bps: float = 0.0
    eta_seconds: Optional[float] = None
    state: str = "pending"    # pending|downloading|verifying|done|error|aborted
    error: str = ""

    @property
    def fraction(self) -> float:
        if self.total <= 0:
            return -1.0
        return min(1.0, self.received / self.total)


@dataclass
class DownloadRequest:
    url: str
    dest: Path
    size: Optional[int] = None
    sha1: Optional[str] = None
    sha256: Optional[str] = None
    resume: bool = True
    headers: dict = field(default_factory=dict)


class DownloadManager:
    """One manager, many tasks. Thread-safe enough for UI use."""

    def __init__(self, session: Optional[requests.Session] = None,
                 max_retries: int = 3, retries_delay: float = 1.0,
                 allow_http: bool = False):
        """``allow_http`` is a test-only seam (CI uses a local http server);
        production code never sets it."""
        self.session = session or requests.Session()
        self.max_retries = max_retries
        self.retries_delay = retries_delay
        self.allow_http = allow_http
        self._tasks: dict[str, DownloadProgress] = {}
        self._lock = threading.Lock()
        self._aborts: set[str] = set()
        self._listeners: list[Callable[[DownloadProgress], None]] = []

    # -- events -------------------------------------------------------------
    def add_listener(self, cb: Callable[[DownloadProgress], None]) -> None:
        self._listeners.append(cb)

    def remove_listener(self, cb) -> None:
        if cb in self._listeners:
            self._listeners.remove(cb)

    def _emit(self, p: DownloadProgress) -> None:
        with self._lock:
            self._tasks[p.url] = p
        for cb in list(self._listeners):
            try:
                cb(p)
            except Exception:
                pass

    def progress(self, url: str) -> Optional[DownloadProgress]:
        with self._lock:
            return self._tasks.get(url)

    def abort(self, url: str) -> None:
        self._aborts.add(url)

    # -- API ------------------------------------------------------------------
    def start(self, req: DownloadRequest,
              on_done: Optional[Callable[[DownloadProgress], None]] = None,
              on_error: Optional[Callable[[DownloadProgress], None]] = None) -> threading.Thread:
        """Run a download on a new thread. Returns the thread (joinable)."""
        t = threading.Thread(target=self._run, args=(req, on_done, on_error), daemon=True)
        t.start()
        return t

    def download(self, req: DownloadRequest, timeout: float = 600.0) -> DownloadProgress:
        """Blocking convenience wrapper (used by tests & CLI)."""
        done = threading.Event()
        result: dict = {}

        def _ok(p):
            result["p"] = p
            done.set()

        def _err(p):
            result["p"] = p
            done.set()

        th = self.start(req, on_done=_ok, on_error=_err)
        th.join(timeout)          # join() returns None on normal exit
        if th.is_alive():         # still running after the timeout window
            self.abort(req.url)
            th.join(timeout=10)
            if not done.is_set():
                raise TimeoutError(f"Download timed out: {req.url}")
        p = result.get("p")
        if p is None or p.state != "done":
            raise RuntimeError(f"Download failed: {p.error if p else 'no progress'}")
        return p

    # -- worker ---------------------------------------------------------------
    def _run(self, req: DownloadRequest, on_done, on_error):
        p = DownloadProgress(url=req.url, dest=str(req.dest), state="downloading")
        self._emit(p)
        try:
            self._run_inner(req, p, on_done, on_error)
        finally:
            # an abort must never poison a later re-download of the same URL
            # (e.g. cancel-then-retry in the UI, or repair after a bad file)
            self._aborts.discard(req.url)

    def _run_inner(self, req: DownloadRequest, p: DownloadProgress,
                   on_done, on_error) -> None:
        try:
            if not self.allow_http:
                ensure_https(req.url)
            req.dest.parent.mkdir(parents=True, exist_ok=True)
            pre_existing = req.dest.stat().st_size if req.resume and req.dest.exists() else 0
            # dest written atomically: download to .part then rename
            part = req.dest.with_suffix(req.dest.suffix + ".part")
            if not part.exists() and pre_existing and req.resume:
                part.write_bytes(req.dest.read_bytes())
            received = part.stat().st_size if part.exists() else 0
            if received and (req.size is not None and received >= req.size):
                # already complete (previous interrupted rename)
                os.replace(part, req.dest)
                self._verify(req, p)
                p.state = "done"
                self._emit(p)
                if on_done:
                    on_done(p)
                return

            received = self._fetch(req, part, received, p)
            os.replace(part, req.dest)     # atomic replace of any old dest
            self._verify(req, p)           # verify the final file
            p.state = "done"
            self._emit(p)
            if on_done:
                on_done(p)
        except _Aborted:
            p.state = "aborted"
            self._emit(p)
            if on_error:
                on_error(p)
        except Exception as e:  # noqa: BLE001 - surfaced to the UI as text
            p.state = "error"
            p.error = f"{type(e).__name__}: {e}"
            self._emit(p)
            if on_error:
                on_error(p)

    def _fetch(self, req: DownloadRequest, part: Path, start: int,
               p: DownloadProgress) -> int:
        last_err: Optional[Exception] = None
        for attempt in range(self.max_retries + 1):
            if req.url in self._aborts:
                raise _Aborted()
            headers = dict(req.headers)
            if start > 0 and req.resume:
                headers["Range"] = f"bytes={start}-"
            try:
                with self.session.get(req.url, stream=True, headers=headers,
                                      timeout=(10, 60)) as resp:
                    if start > 0 and resp.status_code == 200:
                        # server ignored Range -> restart from zero
                        start = 0
                        part = part.with_suffix(".part.new")
                        part.write_bytes(b"")
                    if resp.status_code not in (200, 206):
                        raise requests.HTTPError(f"HTTP {resp.status_code}")
                    if start > 0 and resp.status_code == 206:
                        part_open = "ab"
                    else:
                        part_open = "wb"
                        start = 0
                    content_length = resp.headers.get("Content-Length")
                    if content_length:
                        p.total = start + int(content_length)
                    elif req.size:
                        p.total = req.size
                    p.received = start
                    self._emit(p)
                    h1 = hashlib.sha1()
                    h2 = hashlib.sha256()
                    # if resuming, hash verification is skipped for the
                    # resumed prefix: we only hash the new bytes when no
                    # resume occurred (server returned 200 from zero).
                    full_hash = (start == 0)
                    t0 = time.monotonic()
                    last_speed_t = t0
                    with open(part, part_open) as fh:
                        for chunk in resp.iter_content(CHUNK):
                            if req.url in self._aborts:
                                raise _Aborted()
                            if not chunk:
                                continue
                            fh.write(chunk)
                            n = len(chunk)
                            start += n
                            p.received = start
                            if full_hash:
                                h1.update(chunk)
                                h2.update(chunk)
                            now = time.monotonic()
                            if now - last_speed_t >= 0.5:
                                dt = now - last_speed_t
                                inst = n / dt
                                p.speed_bps = (p.speed_bps * 0.7 + inst * 0.3) if p.speed_bps else inst
                                last_speed_t = now
                                if p.speed_bps > 0 and p.total > start:
                                    p.eta_seconds = (p.total - start) / p.speed_bps
                            self._emit(p)
                p.speed_bps = 0.0
                p.eta_seconds = None
                if full_hash:
                    p._h1, p._h2 = h1.hexdigest(), h2.hexdigest()  # type: ignore[attr-defined]
                return start
            except _Aborted:
                raise
            except (requests.RequestException, OSError) as e:
                last_err = e
                p.error = f"attempt {attempt + 1}: {e}"
                self._emit(p)
                if attempt < self.max_retries:
                    time.sleep(self.retries_delay * (2 ** attempt))
                    # resume from where we got to
                    if part.exists():
                        start = part.stat().st_size
        raise RuntimeError(f"giving up after {self.max_retries + 1} attempts: {last_err}")

    def _verify(self, req: DownloadRequest, p: DownloadProgress) -> None:
        p.state = "verifying"
        self._emit(p)
        data = req.dest.read_bytes() if req.dest.stat().st_size < 64 * 1024 * 1024 else None
        if req.sha1:
            digest = _digest(data if data is not None else req.dest, "sha1")
            if digest.lower() != req.sha1.lower():
                req.dest.unlink(missing_ok=True)
                raise ValueError(f"SHA-1 mismatch for {req.url} "
                                 f"(expected {req.sha1}, got {digest})")
        if req.sha256:
            digest = _digest(data if data is not None else req.dest, "sha256")
            if digest.lower() != req.sha256.lower():
                req.dest.unlink(missing_ok=True)
                raise ValueError(f"SHA-256 mismatch for {req.url} "
                                 f"(expected {req.sha256}, got {digest})")


def _digest(source, algo: str) -> str:
    h = hashlib.new(algo)
    if isinstance(source, (bytes, bytearray)):
        h.update(bytes(source))
    else:
        with open(source, "rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
    return h.hexdigest()


class _Aborted(Exception):
    pass
