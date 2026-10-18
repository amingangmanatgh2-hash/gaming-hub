"""Java runtime detection and validation.

Minecraft needs specific major Java versions per game version:

* 1.8 – 1.12.2 : Java 8
* 1.13 – 1.16.5: Java 8 (16.5 can also run on 8)
* 1.17 – 1.18  : Java 17
* 1.19 – 1.20.4: Java 17
* 1.20.5+      : Java 21
* 1.21+        : Java 21

Detection order (Windows first, then cross-platform):
1. explicit path from config/profile
2. ``JAVA_HOME``
3. ``java`` on PATH
4. Windows registry (HKLM/HKCU JavaSoft Runtime Environment)
5. common install locations
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

#: minimum major java version required per MC version band
def required_java_major(mc_version: str) -> int:
    v = mc_version.strip()
    m = re.match(r"^1\.(\d+)(?:\.(\d+))?", v)
    if not m:
        return 8
    minor = int(m.group(1))
    patch = int(m.group(2) or 0)
    if minor == 20 and patch >= 5:
        return 21
    if minor <= 12:
        return 8
    if minor <= 16:
        return 8
    if minor <= 20:
        return 17
    return 21


@dataclass
class JavaRuntime:
    path: str
    major: int
    version_string: str
    source: str          # config|env|path|registry|system
    vendor: str = ""

    def ok_for(self, mc_version: str) -> bool:
        return self.major >= required_java_major(mc_version)


def parse_java_version(output: str) -> tuple:
    """Return (major, full_string) from ``java -version`` output.

    Handles:
      "openjdk version \"17.0.10\" 2024-01-16"
      "java version \"1.8.0_402\""
      "openjdk version \"21.0.3\" ..."
    """
    for line in output.splitlines():
        m = re.search(r'version "([^"]+)"', line)
        if not m:
            continue
        v = m.group(1)
        parts = v.split(".")
        if parts[0] == "1" and len(parts) > 1:
            major = int(parts[1])
        else:
            try:
                major = int(parts[0])
            except ValueError:
                continue
        return major, v
    return 0, ""


def probe_java(path: str) -> JavaRuntime | None:
    """Run ``java -version`` for *path*; return runtime info or None."""
    try:
        proc = subprocess.run(
            [path, "-version"],
            capture_output=True, text=True, timeout=20,
        )
    except (OSError, subprocess.SubprocessError, FileNotFoundError):
        return None
    # java prints version to stderr
    out = (proc.stderr or "") + (proc.stdout or "")
    major, vstr = parse_java_version(out)
    if major == 0:
        return None
    vendor = ""
    for line in out.splitlines():
        if "vendor" in line or "OpenJDK" in line or "Eclipse" in line or "Temurin" in line:
            vendor = line.strip()[:60]
            break
    return JavaRuntime(path=str(Path(path).resolve()), major=major,
                       version_string=vstr, source="probe", vendor=vendor)


def detect_java_runtimes(preferred: str = "") -> list:
    """Collect all plausible java executables, best first, deduplicated."""
    candidates: list = []

    if preferred:
        candidates.append((preferred, "config"))
    if os.environ.get("JAVA_HOME"):
        jh = Path(os.environ["JAVA_HOME"])
        for sub in (jh / "bin" / "java", jh / "jre" / "bin" / "java"):
            candidates.append((str(sub), "env"))
    on_path = shutil.which("java")
    if on_path:
        candidates.append((on_path, "path"))
    candidates.extend(_registry_runtimes())
    candidates.extend(_system_runtimes())

    seen = set()
    result = []
    for path, source in candidates:
        if not path or not Path(path).exists():
            continue
        try:
            key = str(Path(path).resolve())
        except OSError:
            continue
        if key in seen:
            continue
        seen.add(key)
        rt = probe_java(path)
        if rt:
            rt.source = source
            result.append(rt)
    # prefer higher majors (newer MC) but keep all for the UI
    result.sort(key=lambda r: r.major, reverse=True)
    return result


def _registry_runtimes() -> list:
    """Windows registry entries for installed JRE/JDKs."""
    if os.name != "nt":
        return []
    out = []
    try:
        import winreg
    except ImportError:
        return []
    keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\JavaSoft\Java Runtime Environment"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\JavaSoft\Java Runtime Environment"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Eclipse Adoptium\JDK"),
    ]
    for root, sub in keys:
        try:
            base = winreg.OpenKey(root, sub)
        except OSError:
            continue
        try:
            i = 0
            while True:
                try:
                    name = winreg.EnumKey(base, i)
                except OSError:
                    break
                i += 1
                try:
                    k = winreg.OpenKey(base, name)
                    home = winreg.QueryValueEx(k, "JavaHome")[0]
                    winreg.CloseKey(k)
                except OSError:
                    continue
                exe = Path(home) / "bin" / "java.exe"
                if exe.exists():
                    out.append((str(exe), "registry"))
        finally:
            winreg.CloseKey(base)
    return out


def _system_runtimes() -> list:
    out = []
    if os.name == "nt":
        program_files = [
            Path(os.environ.get("ProgramFiles", r"C:\Program Files")),
            Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")),
            Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" if os.environ.get("LOCALAPPDATA") else None,
        ]
        vendors = ["Eclipse Adoptium", "Microsoft", "BellSoft", "Amazon",
                   "Zulu", "java", "jdk"]
        for pf in program_files:
            if not pf or not pf.exists():
                continue
            for vendor in vendors:
                base = pf / vendor
                if not base.exists():
                    continue
                for d in base.iterdir():
                    exe = d / "bin" / "java.exe"
                    if exe.exists():
                        out.append((str(exe), "system"))
    else:
        for base in (Path("/usr/lib/jvm"), Path("/opt/java"), Path.home() / ".sdkman/candidates/java"):
            if not base.exists():
                continue
            for d in base.iterdir():
                for exe in (d / "bin" / "java",):
                    if exe.exists():
                        out.append((str(exe), "system"))
    return out


def pick_java(runtimes: list, mc_version: str, preferred: str = "") -> JavaRuntime | None:
    """Choose the best runtime for a game version (newest that satisfies the min)."""
    for rt in runtimes:
        if preferred and str(Path(rt.path).resolve()) == str(Path(preferred).resolve()):
            if rt.ok_for(mc_version):
                return rt
    eligible = [rt for rt in runtimes if rt.ok_for(mc_version)]
    return eligible[0] if eligible else None
