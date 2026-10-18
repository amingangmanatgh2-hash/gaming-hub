"""Mod loader installation: Fabric, Quilt, NeoForge, Forge.

Strategy (mirrors the official installers):

* **Fabric** — query ``meta.fabricmc.net`` for the latest stable loader for
  the MC version, then download the loader's sidecar metadata JSON
  (``{artifact}-{version}.json`` on maven.fabricmc.net — the same file the
  official meta service uses) to get the exact ``mainClass`` and library
  list. Compose a custom version profile on top of the vanilla version
  (``inheritsFrom`` semantics) and persist it under ``versions/``.

* **Quilt** — same sidecar approach against the Quilt maven (best effort;
  Quilt is community-supported and the primary recommendation is Fabric).

* **NeoForge / Forge** — their mavens publish a ready-made client profile
  (``{artifact}-{version}-client.json``); we download it and compose it onto
  the vanilla version. This keeps us correct across NeoForge's format
  changes.

The composed profile is a *separate* version entry (e.g.
``1.20.1-fabric-0.16.9``), so vanilla and modded instances coexist and are
repaired independently.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .. import net
from ..download import DownloadManager
from ..paths import DirLayout

FABRIC_META = "https://meta.fabricmc.net/v2"
FABRIC_MAVEN = "https://maven.fabricmc.net"
QUILT_META = "https://meta.quiltmc.org/v3"
QUILT_MAVEN = "https://maven.quiltmc.org/repository/release"
NEOFORGE_MAVEN = "https://maven.neoforged.net/releases"
FORGE_MAVEN = "https://maven.minecraftforge.net"


class LoaderError(RuntimeError):
    pass


@dataclass
class LoaderProfile:
    name: str            # profile id, e.g. 1.20.1-fabric-0.16.9
    base_version: str    # e.g. 1.20.1
    loader_kind: str     # fabric | quilt | neoforge | forge
    loader_version: str
    raw: dict            # composed version json (ready to save)

    def version_id(self) -> str:
        return self.name


class LoaderService:
    def __init__(self, layout: DirLayout, session, downloads: Optional[DownloadManager] = None):
        self.layout = layout
        self.session = session
        self.downloads = downloads or DownloadManager(session)

    # ------------------------------------------------------------------ #
    # Fabric                                                              #
    # ------------------------------------------------------------------ #
    def fabric_latest(self, mc: str) -> dict:
        d = net.get_json(self.session, f"{FABRIC_META}/versions/loader/{mc}")
        if not d:
            raise LoaderError(f"No Fabric loader builds for {mc}")
        stable = [x for x in d if x.get("loader", {}).get("stable")]
        pick = (stable or d)[0]
        return pick

    def install_fabric(self, mc: str, base_raw: dict) -> LoaderProfile:
        pick = self.fabric_latest(mc)
        loader_maven = pick["loader"]["maven"]          # net.fabricmc:fabric-loader:1.20.1
        intermediary_maven = (pick.get("intermediary") or {}).get("maven", "")
        lv = loader_maven.split(":")[-1]

        # sidecar metadata json (same source the official meta service uses)
        g, a, v = loader_maven.split(":")
        sidecar_url = f"{FABRIC_MAVEN}/{g.replace('.', '/')}/{a}/{v}/{a}-{v}.json"
        sidecar = net.get_json(self.session, sidecar_url)

        main_class = sidecar.get("mainClass")
        if isinstance(main_class, dict):
            main_class = main_class.get("client")
        if not main_class:
            raise LoaderError("Fabric loader metadata lacks a client mainClass")

        libraries = []
        if intermediary_maven:
            ig, ia, iv = intermediary_maven.split(":")
            libraries.append({
                "name": intermediary_maven,
                "url": FABRIC_MAVEN,
                "downloads": {
                    "artifact": {
                        "url": f"{FABRIC_MAVEN}/{ig.replace('.', '/')}/{ia}/{iv}/{ia}-{iv}.jar",
                        "path": f"{ig.replace('.', '/')}/{ia}/{iv}/{ia}-{iv}.jar",
                    }
                },
            })
        common = (sidecar.get("libraries") or {}).get("common") or []
        client = (sidecar.get("libraries") or {}).get("client") or []
        for lib in common + client:
            name = lib.get("name")
            if not name:
                continue
            mg, ma, mv = name.split(":")
            url = lib.get("url") or FABRIC_MAVEN
            libraries.append({
                "name": name,
                "url": url,
                "downloads": {
                    "artifact": {
                        "url": f"{url}/{mg.replace('.', '/')}/{ma}/{mv}/{ma}-{mv}.jar",
                        "path": f"{mg.replace('.', '/')}/{ma}/{mv}/{ma}-{mv}.jar",
                    }
                },
            })

        override = {
            "id": f"{mc}-fabric-{lv}",
            "mainClass": main_class,
            "type": "release",
            "arguments": {"game": []},
            "libraries": libraries,
        }
        composed = _compose(base_raw, override)
        return LoaderProfile(
            name=override["id"], base_version=mc, loader_kind="fabric",
            loader_version=lv, raw=composed,
        )

    # ------------------------------------------------------------------ #
    # Quilt (best effort, community-supported)                            #
    # ------------------------------------------------------------------ #
    def quilt_latest(self, mc: str) -> dict:
        d = net.get_json(self.session, f"{QUILT_META}/versions/loader/{mc}")
        if not d:
            raise LoaderError(f"No Quilt loader builds for {mc}")
        return d[0]

    def install_quilt(self, mc: str, base_raw: dict) -> LoaderProfile:
        pick = self.quilt_latest(mc)
        loader_maven = pick.get("quilt_loader", {}).get("maven", "")
        if not loader_maven:
            raise LoaderError("Quilt meta did not provide a loader maven coordinate")
        qg, qa, qv = loader_maven.split(":")
        sidecar_url = (f"{QUILT_MAVEN}/{qg.replace('.', '/')}/{qa}/{qv}/{qa}-{qv}.json")
        try:
            sidecar = net.get_json(self.session, sidecar_url)
        except net.NetworkError:
            raise LoaderError(
                "Quilt loader sidecar metadata is unavailable for this build. "
                "Quilt support is community-maintained — Fabric is the "
                "recommended loader for the SPECIAL CLIENT performance stack.")
        main_class = sidecar.get("mainClass")
        if isinstance(main_class, dict):
            main_class = main_class.get("client")
        if not main_class:
            raise LoaderError("Quilt loader metadata lacks a client mainClass")
        libraries = []
        for key in ("common", "client"):
            for lib in (sidecar.get("libraries") or {}).get(key) or []:
                name = lib.get("name")
                if not name:
                    continue
                mg, ma, mv = name.split(":")
                url = lib.get("url") or QUILT_MAVEN
                libraries.append({
                    "name": name, "url": url,
                    "downloads": {"artifact": {
                        "url": f"{url}/{mg.replace('.', '/')}/{ma}/{mv}/{ma}-{mv}.jar",
                        "path": f"{mg.replace('.', '/')}/{ma}/{mv}/{ma}-{mv}.jar"}},
                })
        override = {
            "id": f"{mc}-quilt-{qv}",
            "mainClass": main_class,
            "type": "release",
            "arguments": {"game": []},
            "libraries": libraries,
        }
        composed = _compose(base_raw, override)
        return LoaderProfile(
            name=override["id"], base_version=mc, loader_kind="quilt",
            loader_version=qv, raw=composed,
        )

    # ------------------------------------------------------------------ #
    # NeoForge / Forge (ready-made client profile from their mavens)      #
    # ------------------------------------------------------------------ #
    def neoforge_versions(self, mc: str) -> list:
        meta = self._maven_metadata(
            f"{NEOFORGE_MAVEN}/net/neoforged/neoforge/maven-metadata.xml")
        return [v for v in meta if _forge_match(v, mc, "neoforge")]

    def forge_versions(self, mc: str) -> list:
        meta = self._maven_metadata(
            f"{FORGE_MAVEN}/net/minecraftforge/forge/maven-metadata.xml")
        return [v for v in meta if _forge_match(v, mc, "forge")]

    def _maven_metadata(self, url: str) -> list:
        resp = self.session.get(url)
        if resp.status_code >= 400:
            raise LoaderError(f"Cannot read loader metadata ({resp.status_code})")
        out = []
        import re
        for m in re.finditer(r"<version>([^<]+)</version>", resp.text):
            out.append(m.group(1))
        return out

    def install_neoforge(self, mc: str, base_raw: dict,
                         version: Optional[str] = None) -> LoaderProfile:
        versions = self.neoforge_versions(mc)
        if not versions:
            raise LoaderError(
                f"No NeoForge build supports Minecraft {mc}. NeoForge "
                f"covers 1.20.1+ only — use Fabric, or pick a newer "
                f"Minecraft version.")
        v = version or versions[-1]
        return self._install_maven_profile(
            mc, base_raw, "neoforge", v,
            f"{NEOFORGE_MAVEN}/net/neoforged/neoforge/{v}/neoforge-{v}-client.json")

    def install_forge(self, mc: str, base_raw: dict,
                      version: Optional[str] = None) -> LoaderProfile:
        versions = self.forge_versions(mc)
        if not versions:
            raise LoaderError(
                f"No Forge build supports Minecraft {mc}. Forge covers "
                f"up to 1.20.1 — for 1.21+ use NeoForge or Fabric.")
        v = version or versions[-1]
        return self._install_maven_profile(
            mc, base_raw, "forge", v,
            f"{FORGE_MAVEN}/net/minecraftforge/forge/{v}/forge-{v}-client.json")

    def _install_maven_profile(self, mc: str, base_raw: dict, kind: str,
                               v: str, client_json_url: str) -> LoaderProfile:
        try:
            override = net.get_json(self.session, client_json_url)
        except net.NetworkError as e:
            raise LoaderError(
                f"No client profile published for {kind} {v} on {mc} "
                f"({client_json_url}). Pick a version listed in the UI or use "
                f"Fabric, which SPECIAL CLIENT supports fully.") from e
        override.setdefault("id", f"{mc}-{kind}-{v}")
        # the published profile may already be a full version json or an
        # inheritsFrom-style override; normalise to override style
        if override.get("inheritsFrom"):
            pass
        else:
            # strip base-level fields we should inherit
            override = {
                k: v_ for k, v_ in override.items()
                if k not in ("assetIndex", "assets", "downloads", "javaVersion")
            }
        composed = _compose(base_raw, override)
        return LoaderProfile(
            name=override["id"], base_version=mc, loader_kind=kind,
            loader_version=v, raw=composed,
        )

    # ------------------------------------------------------------------ #
    # Persistence                                                         #
    # ------------------------------------------------------------------ #
    def save_profile(self, profile: LoaderProfile) -> Path:
        from ..mcversion import save_version_json
        path = self.layout.instance_version_json(profile.name)
        save_version_json(profile.raw, path)
        return path

    def installed_profiles(self) -> list:
        """All composed loader profiles present in versions/."""
        out = []
        if not self.layout.versions.exists():
            return out
        for d in self.layout.versions.iterdir():
            if not d.is_dir():
                continue
            jf = d / f"{d.name}.json"
            if not jf.exists():
                continue
            try:
                raw = json.loads(jf.read_text())
            except Exception:
                continue
            base = raw.get("inheritsFrom") or ""
            if base and raw.get("id") != base:
                kind = _kind_from_id(raw.get("id", ""))
                if kind:
                    out.append(LoaderProfile(
                        name=raw["id"], base_version=base, loader_kind=kind,
                        loader_version=raw["id"].rsplit("-", 1)[-1], raw=raw))
        return out


def _neoforge_prefix(mc: str) -> Optional[str]:
    """Map an MC version to the NeoForge maven version prefix.

    NeoForge maven versions drop the "1." and use the MC minor+patch:
    MC 1.20.1 → 20.1.x, MC 1.20.4 → 20.4.x, MC 1.21.4 → 21.4.x,
    MC 1.21   → 21.0.x. Versions with no NeoForge release (e.g. 1.20.2)
    map to a prefix that simply matches nothing.
    """
    import re
    m = re.fullmatch(r"1\.(\d+)(?:\.(\d+))?", mc)
    if not m:
        return None
    minor = int(m.group(1))
    patch = m.group(2)
    if minor == 20:
        return f"20.{patch or '1'}."
    if minor == 21:
        return f"21.{patch or '0'}."
    return None


def _forge_match(version: str, mc: str, kind: str = "forge") -> bool:
    """Match a maven version against an MC version.

    * Forge:    versions embed the MC version — '1.20.1-47.2.20'.
    * NeoForge: versions are their own scheme — '21.0.24-beta' — and map
      to the MC minor/patch via :func:`_neoforge_prefix`.
    """
    if kind == "neoforge":
        prefix = _neoforge_prefix(mc)
        return prefix is not None and version.startswith(prefix)
    return version.startswith(mc + "-")


def _kind_from_id(profile_id: str) -> Optional[str]:
    for kind in ("fabric", "quilt", "neoforge", "forge"):
        if f"-{kind}-" in profile_id:
            return kind
    return None


def _compose(base_raw: dict, override: dict) -> dict:
    from ..mcversion import merge_versions
    merged = merge_versions(base_raw, override)
    merged.pop("inheritsFrom", None)  # we have already merged
    merged.setdefault("arguments", {})
    return merged
