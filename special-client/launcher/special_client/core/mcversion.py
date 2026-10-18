"""Minecraft version JSON model.

Implements the documented version-file format used by Mojang launchers:

* rule evaluation (``os.name`` / ``os.arch`` / features),
* library resolution to maven-style paths under ``libraries/``,
* native (platform classifier) extraction,
* legacy ``minecraftArguments`` (1.8.9 and older) and modern
  ``arguments.game`` / ``arguments.jvm`` (1.13+) expansion,
* classpath assembly,
* custom-profile merging (``inheritsFrom``-style composition used to add
  Fabric / Quilt / NeoForge loader on top of a vanilla version).

Reference: the official launcher's version-file documentation and the
``fabric-meta`` profile builder (which this package mirrors).
"""
from __future__ import annotations

import json
import platform
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# --------------------------------------------------------------------------- #
# Rule evaluation                                                             #
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class LaunchEnv:
    os_name: str = "windows"      # windows | linux | osx
    arch: str = "x86_64"          # x86_64 | x86 | arm64
    features: dict = field(default_factory=dict)

    @classmethod
    def detect(cls) -> "LaunchEnv":
        system = platform.system().lower()
        os_name = {"windows": "windows", "linux": "linux", "darwin": "osx"}.get(system, "linux")
        arch = platform.machine().lower()
        if arch in ("amd64", "x86_64"):
            arch = "x86_64"
        elif arch in ("i386", "i686", "x86"):
            arch = "x86"
        elif arch in ("arm64", "aarch64"):
            arch = "arm64"
        else:
            arch = "x86_64"
        return cls(os_name=os_name, arch=arch, features={
            "is_demo_user": False,
            "has_custom_resolution": False,
        })


def rule_allowed(rules: Optional[list], env: LaunchEnv) -> bool:
    """Evaluate Mojang-style rules. Default: allowed unless disallowed."""
    allowed = True
    for rule in rules or []:
        if _rule_matches(rule, env):
            allowed = rule.get("action", "allow") == "allow"
    return allowed


def _rule_matches(rule: dict, env: LaunchEnv) -> bool:
    os_ = rule.get("os")
    if os_:
        if os_.get("name") and os_["name"] != env.os_name:
            return False
        if os_.get("arch") and os_["arch"] != env.arch:
            return False
    features = rule.get("features")
    if features:
        for key, value in features.items():
            if env.features.get(key) != value:
                return False
    return True


# --------------------------------------------------------------------------- #
# Library model                                                               #
# --------------------------------------------------------------------------- #

@dataclass
class Library:
    name: str                       # group:artifact[:version] or group:artifact:version:classifier
    url: Optional[str] = None
    natives: Optional[dict] = None  # {os_name: classifier}
    rules: Optional[list] = None
    extract: Optional[dict] = None  # {"exclude": ["META-INF/"]}
    downloads: Optional[dict] = None
    checksum_verified: bool = False

    def allowed(self, env: LaunchEnv) -> bool:
        return rule_allowed(self.rules, env)

    def maven_path(self) -> Path:
        """Path inside ``libraries/`` for the main artifact."""
        parts = self.name.split(":")
        g, a = parts[0].replace(".", "/"), parts[1]
        v = parts[2] if len(parts) > 2 and parts[2] else "dev"
        c = parts[3] if len(parts) > 3 and parts[3] else ""
        fn = f"{a}-{v}" + (f"-{c}" if c else "") + ".jar"
        return Path(g) / a / v / fn

    def classifier_path(self, classifier: str) -> Path:
        parts = self.name.split(":")
        g, a = parts[0].replace(".", "/"), parts[1]
        v = parts[2] if len(parts) > 2 and parts[2] else "dev"
        return Path(g) / a / v / f"{a}-{v}-{classifier}.jar"

    def download_url(self, classifier: Optional[str] = None) -> Optional[str]:
        if not self.downloads:
            return None
        if classifier:
            art = (self.downloads.get("classifiers") or {}).get(classifier) or {}
        else:
            art = self.downloads.get("artifact") or {}
        return art.get("url")

    def sha1(self, classifier: Optional[str] = None) -> Optional[str]:
        if not self.downloads:
            return None
        if classifier:
            art = (self.downloads.get("classifiers") or {}).get(classifier) or {}
        else:
            art = self.downloads.get("artifact") or {}
        return art.get("sha1")

    def size(self, classifier: Optional[str] = None) -> Optional[int]:
        if not self.downloads:
            return None
        if classifier:
            art = (self.downloads.get("classifiers") or {}).get(classifier) or {}
        else:
            art = self.downloads.get("artifact") or {}
        return art.get("size")

    def native_classifier(self, env: LaunchEnv) -> Optional[str]:
        if not self.natives:
            return None
        return self.natives.get(env.os_name)


@dataclass
class AssetIndexRef:
    id: str
    url: str
    total_size: int = 0

    @property
    def virtual(self) -> int:
        """'legacy' == virtual 0, 'pre-1.7.3' == 2, everything newer == 3."""
        return 0 if self.id in ("legacy", "pre-1.7.3") else 3


@dataclass
class JavaVersion:
    major_version: int = 8

    @classmethod
    def from_json(cls, j: Optional[dict]) -> "JavaVersion":
        if not j:
            return cls(8)
        return cls(int(j.get("majorVersion", 8)))


@dataclass
class McVersion:
    raw: dict

    @property
    def id(self) -> str:
        return self.raw.get("id", "")

    @property
    def type(self) -> str:
        return self.raw.get("type", "release")

    @property
    def main_class(self) -> str:
        return self.raw.get("mainClass", "")

    @property
    def java_version(self) -> JavaVersion:
        return JavaVersion.from_json(self.raw.get("javaVersion"))

    @property
    def libraries(self) -> list:
        return [Library(**{k: v for k, v in lib.items() if k in Library.__dataclass_fields__})
                for lib in self.raw.get("libraries", [])]

    @property
    def asset_index(self) -> AssetIndexRef:
        ai = self.raw.get("assetIndex", {})
        return AssetIndexRef(id=ai.get("id", ""), url=ai.get("url", ""),
                             total_size=int(ai.get("totalSize", 0)))

    @property
    def assets_id(self) -> str:
        return self.raw.get("assets") or self.asset_index.id

    @property
    def is_legacy(self) -> bool:
        return "minecraftArguments" in self.raw

    @property
    def game_args_raw(self) -> list:
        return (self.raw.get("arguments") or {}).get("game", [])

    @property
    def jvm_args_raw(self) -> list:
        return (self.raw.get("arguments") or {}).get("jvm", [])

    @property
    def client_download(self) -> Optional[dict]:
        return (self.raw.get("downloads") or {}).get("client")

    @property
    def server_download(self) -> Optional[dict]:
        return (self.raw.get("downloads") or {}).get("server")

    @property
    def inherits_from(self) -> Optional[str]:
        return self.raw.get("inheritsFrom")


# --------------------------------------------------------------------------- #
# Argument expansion                                                          #
# --------------------------------------------------------------------------- #

class ArgumentError(ValueError):
    pass


def expand_game_args(version: McVersion, variables: dict) -> list:
    """Expand game arguments (legacy string or modern list) with *variables*."""
    missing = _check_variables(version.game_args_raw if not version.is_legacy
                               else version.raw.get("minecraftArguments", ""), variables)
    if missing:
        raise ArgumentError(f"missing variables for game args: {sorted(missing)}")
    if version.is_legacy:
        template = version.raw.get("minecraftArguments", "")
        return _substitute_all(template, variables)
    out: list = []
    for item in version.game_args_raw:
        if isinstance(item, str):
            out.extend(_substitute_all(item, variables))
        elif isinstance(item, dict):
            if rule_allowed(item.get("rules"), _GLOBAL_ENV):
                value = item.get("value")
                if isinstance(value, str):
                    out.extend(_substitute_all(value, variables))
                elif isinstance(value, list):
                    for v in value:
                        out.extend(_substitute_all(v, variables))
    return out


def expand_jvm_args(version: McVersion, variables: dict, env: LaunchEnv) -> list:
    """Expand JVM arguments. Legacy versions have none from the version json."""
    out: list = []
    for item in version.jvm_args_raw:
        if isinstance(item, str):
            out.extend(_substitute_all(item, variables))
        elif isinstance(item, dict):
            if rule_allowed(item.get("rules"), env):
                value = item.get("value")
                if isinstance(value, str):
                    out.extend(_substitute_all(value, variables))
                elif isinstance(value, list):
                    for v in value:
                        out.extend(_substitute_all(v, variables))
    return out


_GLOBAL_ENV = LaunchEnv(os_name="windows", arch="x86_64")


def _check_variables(args, variables: dict) -> set:
    found = set()
    if isinstance(args, str):
        found = set(_VAR_RE.findall(args))
    elif isinstance(args, list):
        for item in args:
            if isinstance(item, str):
                found.update(_VAR_RE.findall(item))
            elif isinstance(item, dict):
                value = item.get("value")
                if isinstance(value, str):
                    found.update(_VAR_RE.findall(value))
                elif isinstance(value, list):
                    for v in value:
                        found.update(_VAR_RE.findall(str(v)))
    return {v for v in found if v not in variables}


_VAR_RE = re.compile(r"\$\{(\w+)\}")


def _substitute_all(text: str, variables: dict) -> list:
    """Substitute ``${var}`` tokens, splitting on whitespace (JVM-style args)."""
    def repl(m):
        key = m.group(1)
        if key not in variables:
            raise ArgumentError(f"unresolved variable ${{{key}}} in {text!r}")
        return str(variables[key])

    substituted = _VAR_RE.sub(repl, text)
    return substituted.split()


# --------------------------------------------------------------------------- #
# Launch command building                                                     #
# --------------------------------------------------------------------------- #

@dataclass
class LaunchSpec:
    """Everything needed to build the java command line."""
    game_dir: Path
    java_path: str
    version: McVersion
    assets_root: Path
    libraries_dir: Path
    natives_dir: Path
    primary_jar: Path
    auth: dict                      # player_name, uuid, access_token, xuid, user_type
    ram_mb: int
    extra_jvm_args: list = field(default_factory=list)
    extra_game_args: list = field(default_factory=list)
    env: LaunchEnv = field(default_factory=LaunchEnv.detect)
    launcher_name: str = "SPECIAL CLIENT"
    launcher_version: str = "1.0.0"

    def game_variables(self) -> dict:
        return {
            "auth_player_name": self.auth.get("player_name", ""),
            "version_name": self.version.id,
            "game_directory": str(self.game_dir),
            "game_assets": str(self.assets_root / "virtual" / str(self.version.asset_index.virtual)),
            "assets_root": str(self.assets_root),
            "assets_index_name": self.version.assets_id,
            "auth_uuid": self.auth.get("uuid", ""),
            "auth_access_token": self.auth.get("access_token", ""),
            "auth_xuid": self.auth.get("xuid", ""),
            "user_type": self.auth.get("user_type", "msa"),
            "version_type": self.version.type,
            "user_properties": "{}",
            "clientid": "",
        }

    def jvm_variables(self) -> dict:
        classpath = [str(self.libraries_dir / lib.maven_path())
                     for lib in self.version.libraries if lib.allowed(self.env)]
        classpath.append(str(self.primary_jar))
        return {
            "natives_directory": str(self.natives_dir),
            "launcher_name": self.launcher_name,
            "launcher_version": self.launcher_version,
            "classpath": os_pathsep().join(classpath),
            "classpath_separator": os_pathsep(),
            "library_directory": str(self.libraries_dir),
            "primary_jar": str(self.primary_jar),
            "version_name": self.version.id,
            "auth_xuid": self.auth.get("xuid", ""),
            "clientid": "",
            "accesstoken": self.auth.get("access_token", ""),
            "useragent": "",
        }

    def java_command(self) -> list:
        """Full argv for the java process."""
        cmd = [
            self.java_path,
            "-Xms512M",
            f"-Xmx{self.ram_mb}M",
            f"-Djava.library.path={self.natives_dir}",
            f"-Dminecraft.launcher.brand={self.launcher_name.lower().replace(' ', '_')}",
            f"-Dminecraft.launcher.version={self.launcher_version}",
        ]
        if self.version.java_version.major_version >= 9:
            cmd.append("-Djava.net.preferIPv6Addresses=system")
        jvm = expand_jvm_args(self.version, self.jvm_variables(), self.env)
        cmd.extend(jvm)
        cmd.extend(self.extra_jvm_args)
        cmd.append(self.version.main_class)
        game = expand_game_args(self.version, self.game_variables())
        cmd.extend(game)
        cmd.extend(self.extra_game_args)
        return cmd

    def natives_to_extract(self) -> list:
        """Libraries whose native classifier must be unzipped into natives_dir."""
        result = []
        for lib in self.version.libraries:
            if not lib.allowed(self.env):
                continue
            clf = lib.native_classifier(self.env)
            if clf:
                result.append((lib, clf))
        return result


def os_pathsep() -> str:
    import os as _os
    return _os.pathsep


def extract_natives(spec: LaunchSpec) -> None:
    """Unzip native libraries into ``spec.natives_dir`` (idempotent)."""
    spec.natives_dir.mkdir(parents=True, exist_ok=True)
    for lib, clf in spec.natives_to_extract():
        src = spec.libraries_dir / lib.classifier_path(clf)
        if not src.exists():
            continue
        exclude = set((lib.extract or {}).get("exclude", ["META-INF/"]))
        with zipfile.ZipFile(src) as zf:
            for info in zf.infolist():
                name = info.filename
                if info.is_dir():
                    continue
                if any(name.startswith(x) or f"/{x}" in f"/{name}" for x in exclude):
                    continue
                target = spec.natives_dir / name.split("/")[-1]
                if target.exists():
                    continue
                with zf.open(info) as src_fh, open(target, "wb") as dst:
                    dst.write(src_fh.read())


# --------------------------------------------------------------------------- #
# Custom version profiles (loader composition)                                #
# --------------------------------------------------------------------------- #

def merge_versions(base: dict, override: dict) -> dict:
    """Compose a custom version on top of *base* (``inheritsFrom`` semantics).

    * ``mainClass`` is replaced when present in *override*
    * ``libraries`` from *override* are prepended (loader first)
    * ``arguments.game`` / ``arguments.jvm`` are prepended
    * ``id`` comes from *override*
    """
    merged = json.loads(json.dumps(base))  # deep copy
    merged_id = override.get("id") or base.get("id")
    merged["id"] = merged_id
    if override.get("mainClass"):
        merged["mainClass"] = override["mainClass"]
    if override.get("type"):
        merged["type"] = override["type"]
    base_libs = list(base.get("libraries", []))
    merged_libs = list(override.get("libraries", [])) + base_libs
    merged["libraries"] = merged_libs
    base_args = base.get("arguments", {})
    if isinstance(base_args, dict):
        merged_args = {
            "game": list(override.get("arguments", {}).get("game", []))
                    + list(base_args.get("game", [])),
            "jvm": list(override.get("arguments", {}).get("jvm", []))
                   + list(base_args.get("jvm", [])),
        }
        # drop empties
        merged_args = {k: v for k, v in merged_args.items() if v}
        merged["arguments"] = merged_args
    elif base.get("minecraftArguments"):
        # legacy base: keep the string; prepend override game args afterwards
        merged["_prepend_game_args"] = list(override.get("arguments", {}).get("game", []))
    return merged


def version_from_raw(raw: dict) -> McVersion:
    return McVersion(raw)


def load_version_json(path: Path) -> McVersion:
    return McVersion(json.loads(path.read_text()))


def save_version_json(raw: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw, indent=2))
