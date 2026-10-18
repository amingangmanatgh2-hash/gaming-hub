"""Authentication: Microsoft account (device-code OAuth) and offline sessions.

Microsoft flow (endpoints verified against the documented services):

1.  Device code:  POST https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode
    poll:         POST https://login.microsoftonline.com/consumers/oauth2/v2.0/token
2.  Xbox Live:    POST https://user.auth.xboxlive.com/user/authenticate
3.  XSTS:         POST https://xsts.auth.xboxlive.com/xsts/authorize
4.  MC launch:    POST https://api.minecraftservices.com/launcher/login
5.  Profile:      GET  https://api.minecraftservices.com/minecraft/profile

Security notes
--------------
* The MSA client id is a *public* identifier (no secret); by default the
  well-known public client id used across open-source launchers
  (``00000000402b5328``). Users may override it with their own Azure
  public-client registration (Settings → Microsoft client id).
* Tokens are stored on disk with mode 0600 under ``special/auth``.
* Nothing here ever receives or transmits a Microsoft password.
* Offline sessions use the deterministic ``OfflinePlayer:<name>`` UUID
  (Java ``UUID.nameUUIDFromBytes`` semantics, namespace DNS, v3) — identical
  to what the vanilla launcher's offline mode produces. They do NOT grant
  access to online-mode servers and never bypass Microsoft authentication
  for online play; servers decide whether to accept them.
"""
from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

from . import net

MSA_DEVICE_CODE_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode"
MSA_TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token"
XBL_AUTHENTICATE_URL = "https://user.auth.xboxlive.com/user/authenticate"
XSTS_AUTHORIZE_URL = "https://xsts.auth.xboxlive.com/xsts/authorize"
MC_LAUNCHER_LOGIN_URL = "https://api.minecraftservices.com/launcher/login"
MC_PROFILE_URL = "https://api.minecraftservices.com/minecraft/profile"

MSA_SCOPES = "XboxLive.SignIn XboxLive.offline_access"
DEFAULT_MSA_CLIENT_ID = "00000000402b5328"


class AuthError(RuntimeError):
    pass


@dataclass
class AuthSession:
    """A session that can be used to launch the game."""
    kind: str                      # "microsoft" | "offline"
    player_name: str
    uuid: str
    access_token: str = ""         # empty for offline
    xuid: str = ""
    user_type: str = "msa"
    refresh_token: str = ""
    token_obtained_at: float = 0.0
    expires_in: int = 0

    @property
    def is_microsoft(self) -> bool:
        return self.kind == "microsoft"

    def to_launch_vars(self) -> dict:
        return {
            "player_name": self.player_name,
            "uuid": self.uuid,
            "access_token": self.access_token,
            "xuid": self.xuid,
            "user_type": "msa" if self.is_microsoft else "mojang",
        }


def offline_uuid(player_name: str) -> str:
    """Deterministic offline UUID, byte-compatible with Java's
    ``UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(UTF_8))``.

    (Java's nameUUIDFromBytes is a *namespaceless* MD5 v3 over the raw
    bytes — not ``UUID.uuid3`` with a namespace — so it is implemented
    here directly. Verified: Notch → b50ad385-829d-3141-a216-7e7d7539ba7f.)
    """
    import hashlib
    raw = ("OfflinePlayer:" + player_name).encode("utf-8")
    d = bytearray(hashlib.md5(raw).digest())
    d[6] = (d[6] & 0x0F) | 0x30   # version 3
    d[8] = (d[8] & 0x3F) | 0x80   # variant (IETF)
    return str(uuid.UUID(bytes=bytes(d)))


def make_offline_session(player_name: str) -> AuthSession:
    if not player_name or len(player_name) < 3 or len(player_name) > 16:
        raise AuthError("Offline name must be 3-16 characters.")
    if not all(c.isalnum() or c == "_" for c in player_name):
        raise AuthError("Offline name may only contain letters, digits and '_'.")
    return AuthSession(kind="offline", player_name=player_name,
                       uuid=offline_uuid(player_name))


# --------------------------------------------------------------------------- #
# Microsoft flow                                                              #
# --------------------------------------------------------------------------- #

@dataclass
class DeviceCodeInfo:
    device_code: str
    user_code: str
    verification_uri: str
    message: str
    expires_in: int
    interval: int


class MicrosoftAuth:
    def __init__(self, session, client_id: str = DEFAULT_MSA_CLIENT_ID):
        self.session = session
        self.client_id = client_id

    # -- 1. device code ------------------------------------------------------
    def request_device_code(self) -> DeviceCodeInfo:
        resp = self.session.post(
            MSA_DEVICE_CODE_URL,
            data={"client_id": self.client_id, "scope": MSA_SCOPES},
            headers={"Content-Type": "application/x-www-form-urlencoded",
                     "Accept": "application/json"},
        )
        if resp.status_code >= 400:
            raise AuthError(f"Microsoft device code request failed "
                            f"(HTTP {resp.status_code}): {resp.text[:300]}")
        d = resp.json()
        for k in ("device_code", "user_code", "verification_uri"):
            if not d.get(k):
                raise AuthError(f"Microsoft device code response missing {k!r}")
        return DeviceCodeInfo(
            device_code=d["device_code"],
            user_code=d["user_code"],
            verification_uri=d["verification_uri"],
            message=d.get("message", ""),
            expires_in=int(d.get("expires_in", 900)),
            interval=int(d.get("interval", 5)),
        )

    def poll_device_code(self, info: DeviceCodeInfo,
                         on_wait: Optional[Callable[[int], None]] = None,
                         should_abort: Optional[Callable[[], bool]] = None) -> dict:
        """Block until the user completes the browser step. Returns token dict."""
        deadline = time.time() + info.expires_in
        interval = max(1, info.interval)
        while time.time() < deadline:
            if should_abort and should_abort():
                raise AuthError("Login cancelled.")
            resp = self.session.post(
                MSA_TOKEN_URL,
                data={"client_id": self.client_id,
                      "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                      "device_code": info.device_code},
                headers={"Content-Type": "application/x-www-form-urlencoded",
                         "Accept": "application/json"},
            )
            if resp.status_code == 200:
                d = resp.json()
                if d.get("access_token"):
                    return d
                raise AuthError(f"Microsoft token response malformed: {str(d)[:200]}")
            try:
                err = resp.json()
            except ValueError:
                err = {"error": "invalid_response"}
            code = err.get("error", "")
            if code == "authorization_pending":
                if on_wait:
                    on_wait(int(deadline - time.time()))
                time.sleep(interval)
                continue
            if code == "slow_down":
                interval += 2
                time.sleep(interval)
                continue
            if code in ("expired_token", "authorization_declined"):
                raise AuthError(f"Microsoft login failed: {err.get('error_description', code)}")
            raise AuthError(f"Microsoft token poll failed: {code} "
                            f"{err.get('error_description', '')}")
        raise AuthError("Device code expired before login completed.")

    def refresh(self, refresh_token: str) -> dict:
        resp = self.session.post(
            MSA_TOKEN_URL,
            data={"client_id": self.client_id,
                  "grant_type": "refresh_token",
                  "refresh_token": refresh_token},
            headers={"Content-Type": "application/x-www-form-urlencoded",
                     "Accept": "application/json"},
        )
        if resp.status_code >= 400:
            raise AuthError(f"Token refresh failed (HTTP {resp.status_code}): {resp.text[:300]}")
        d = resp.json()
        if not d.get("access_token"):
            raise AuthError("Token refresh returned no access token.")
        return d

    # -- 2-4. Xbox Live → XSTS → Minecraft ------------------------------------
    def _xbox_user(self, msa_token: str) -> tuple:
        payload = {
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": f"d={msa_token}",
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT",
        }
        d = net.post_json(self.session, XBL_AUTHENTICATE_URL, payload=payload,
                          headers={"x-xbl-contract-version": "1"})
        token = d.get("Token")
        uhs = self._uhs(d)
        if not token or not uhs:
            raise AuthError(f"Xbox Live authentication failed: {str(d)[:200]}")
        return token, uhs

    def _xsts(self, xbl_token: str) -> tuple:
        payload = {
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbl_token],
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT",
        }
        d = net.post_json(self.session, XSTS_AUTHORIZE_URL, payload=payload,
                          headers={"x-xbl-contract-version": "1"})
        token = d.get("Token")
        uhs = self._uhs(d)
        if not token or not uhs:
            raise AuthError(f"XSTS authorization failed: {str(d)[:200]}")
        return token, uhs

    def _uhs(self, xbox_response: dict) -> str:
        """Extract the UHS user id from an XBL response.

        ``xui`` is an array of claims; the first claim is itself an array
        whose first element is the UHS string (older responses used
        ``{"uhs": ...}`` objects — both shapes are handled).
        """
        claims = (xbox_response.get("DisplayClaims") or {}).get("xui") or []
        try:
            first = claims[0]
        except (IndexError, TypeError):
            return ""
        if isinstance(first, dict):
            return str(first.get("uhs", ""))
        if isinstance(first, (list, tuple)) and first:
            return str(first[0])
        return ""

    def _mc_login(self, uhs: str, xsts_token: str) -> str:
        payload = {
            "xtoken": f"XBL3.0 x={uhs};{xsts_token}",
            "platform": "PC_LAUNCHER",
        }
        d = net.post_json(self.session, MC_LAUNCHER_LOGIN_URL, payload=payload)
        token = d.get("access_token")
        if not token:
            raise AuthError(f"Minecraft login failed: {str(d)[:200]}")
        return token

    def _profile(self, mc_token: str) -> dict:
        resp = self.session.get(MC_PROFILE_URL,
                                headers={"Authorization": f"Bearer {mc_token}"})
        if resp.status_code == 404:
            return {}
        if resp.status_code >= 400:
            raise AuthError(f"Profile fetch failed (HTTP {resp.status_code})")
        return resp.json()

    # -- high level -------------------------------------------------------------
    def login_from_tokens(self, msa_token: dict) -> AuthSession:
        """Complete the chain given a fresh MSA token dict (device or refresh)."""
        msa_access = msa_token["access_token"]
        xbl_token, uhs = self._xbox_user(msa_access)
        xsts_token, uhs2 = self._xsts(xbl_token)
        if uhs2 != uhs:
            raise AuthError("XSTS user hash mismatch — aborted for safety.")
        mc_token = self._mc_login(uhs, xsts_token)
        profile = self._profile(mc_token)
        name = profile.get("name", "Player")
        puuid = profile.get("id") or offline_uuid(name)
        return AuthSession(
            kind="microsoft",
            player_name=name,
            uuid=puuid,
            access_token=mc_token,
            xuid=uhs,
            user_type="msa",
            refresh_token=msa_token.get("refresh_token", ""),
            token_obtained_at=time.time(),
            expires_in=int(msa_token.get("expires_in", 86400)),
        )


# --------------------------------------------------------------------------- #
# Token store                                                                 #
# --------------------------------------------------------------------------- #

class AccountStore:
    """Persistent tokens: per-user DPAPI on Windows; 0600 on POSIX."""

    def __init__(self, auth_dir: Path):
        self.auth_dir = Path(auth_dir)
        self.file = self.auth_dir / "accounts.json"

    def _load(self) -> dict:
        if self.file.exists():
            try:
                from .credentials import unprotect
                return __import__("json").loads(unprotect(self.file.read_bytes()))
            except Exception:
                pass
        return {}

    def _save(self, data: dict) -> None:
        self.auth_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.file.with_suffix(".tmp")
        from .credentials import protect
        payload = __import__("json").dumps(data, indent=2).encode("utf-8")
        tmp.write_bytes(protect(payload))
        os.chmod(tmp, 0o600)
        os.replace(tmp, self.file)
        os.chmod(self.file, 0o600)

    def add(self, session: AuthSession, xbl_uhs: str) -> None:
        data = self._load()
        data[session.player_name] = {
            "refresh_token": session.refresh_token,
            "xuid": session.xuid or xbl_uhs,
            "updated": int(time.time()),
        }
        self._save(data)

    def get(self, name: str) -> Optional[dict]:
        return self._load().get(name)

    def remove(self, name: str) -> None:
        data = self._load()
        data.pop(name, None)
        self._save(data)

    def list_names(self) -> list:
        return sorted(self._load().keys())
