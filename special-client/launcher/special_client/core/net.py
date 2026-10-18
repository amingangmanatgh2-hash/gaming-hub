"""Shared HTTP session.

All network access goes through :func:`make_session` so that:

* only HTTPS is ever used (plain HTTP raises immediately),
* a consistent User-Agent identifies SPECIAL CLIENT,
* timeouts are bounded (no endless requests — important for offline use),
* redirect handling is on (all endpoints we use honour them safely).
"""
from __future__ import annotations

import requests
from urllib.parse import urlparse

from .. import APP_NAME, __version__

USER_AGENT = f"{APP_NAME}/{__version__} (+https://github.com/special-client)"


class InsecureURLError(RuntimeError):
    pass


def ensure_https(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise InsecureURLError(f"Only HTTPS URLs are allowed, got: {url!r}")
    return url


def make_session(
    *,
    user_agent: str = USER_AGENT,
    timeout: float = 30.0,
    verify: bool = True,
) -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": user_agent})
    s.verify = verify
    s.trust_env = False  # ignore proxy env vars from the host environment
    s.request = _bounded_request(s, timeout)
    return s


def _bounded_request(session, timeout):
    """Wrap Session.request so *timeout* applies even to bare calls."""

    def request(method, url, **kwargs):
        ensure_https(url)
        kwargs.setdefault("timeout", timeout)
        return session.request(method, url, **kwargs)

    return request


class NetworkError(RuntimeError):
    """Raised for transport-level failures (offline, timeout, TLS...)."""


class ApiError(NetworkError):
    def __init__(self, status: int, message: str, url: str = ""):
        super().__init__(f"HTTP {status} for {url}: {message}")
        self.status = status
        self.url = url


def get_json(session, url, *, params=None, headers=None) -> object:
    try:
        resp = session.get(url, params=params, headers=headers)
    except requests.RequestException as e:
        raise NetworkError(f"GET {url} failed: {e}") from e
    if resp.status_code == 404:
        raise ApiError(404, "Not found", url)
    if resp.status_code >= 400:
        raise ApiError(resp.status_code, resp.text[:300], url)
    try:
        return resp.json()
    except ValueError as e:
        raise NetworkError(f"GET {url} returned invalid JSON: {e}") from e


def post_json(session, url, *, payload=None, headers=None) -> object:
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if headers:
        h.update(headers)
    try:
        resp = session.post(url, json=payload, headers=h)
    except requests.RequestException as e:
        raise NetworkError(f"POST {url} failed: {e}") from e
    if resp.status_code >= 400:
        raise ApiError(resp.status_code, resp.text[:500], url)
    try:
        return resp.json()
    except ValueError as e:
        raise NetworkError(f"POST {url} returned invalid JSON: {e}") from e


def is_online(session, probe: str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
              timeout: float = 6.0) -> bool:
    """Cheap connectivity probe used to decide online vs. offline behaviour.

    Returns True/False; never raises.
    """
    try:
        session.get(probe, timeout=timeout, stream=True)
        return True
    except requests.RequestException:
        return False
