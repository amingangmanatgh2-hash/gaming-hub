"""Explicit local vanilla Java server hosting. No tunnel, firewall changes or offline-auth bypass."""
from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess

from .download import DownloadRequest


class ServerError(RuntimeError):
    pass


class ServerHost:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.process = None
        self.directory = None

    @property
    def running(self):
        return self.process is not None and self.process.poll() is None

    def install(self, entry, launch_service, *, accepted_eula=False):
        if not accepted_eula:
            raise ServerError("Read and explicitly accept the Minecraft EULA before installing a server.")
        if self.running:
            raise ServerError("Stop the current server first.")
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", entry.id) or entry.id in (".", ".."):
            raise ServerError("Invalid version ID")
        version = launch_service.fetch_version_json(entry)
        download = version.raw.get("downloads", {}).get("server")
        if not download or not download.get("sha1"):
            raise ServerError("Official metadata has no verified vanilla server download for this version.")
        directory = self.root / entry.id
        directory.mkdir(parents=True, exist_ok=True)
        launch_service.downloads.download(DownloadRequest(url=download["url"], dest=directory / "server.jar",
                                                        size=download.get("size"), sha1=download["sha1"]))
        (directory / "eula.txt").write_text("# Accepted explicitly in SPECIAL CLIENT\neula=true\n", encoding="utf-8")
        props = directory / "server.properties"
        if not props.exists():
            props.write_text("online-mode=true\nserver-port=25565\nserver-ip=\nmax-players=8\nview-distance=6\nsimulation-distance=4\nmotd=SPECIAL FRIENDS\n", encoding="utf-8")
        (directory / "special-server.json").write_text(json.dumps({"version": entry.id,
                "java": version.java_version.major_version}), encoding="utf-8")
        self.directory = directory
        return directory

    def start(self, java: str, ram_mb: int = 1024):
        if self.running:
            raise ServerError("Server already running")
        if self.directory is None or not (self.directory / "server.jar").is_file():
            raise ServerError("Install/select a server first")
        if not java or not 512 <= ram_mb <= 4096:
            raise ServerError("Select a valid Java executable and RAM between 512 and 4096 MB")
        # Do not silently turn off authentication in an existing user-edited configuration.
        props = (self.directory / "server.properties").read_text(encoding="utf-8")
        if any(re.sub(r"\s+", "", line.lower()) == "online-mode=false" for line in props.splitlines()):
            raise ServerError("This hosting UI requires online-mode=true; restore authentication before starting.")
        with (self.directory / "console.log").open("ab") as log:
            self.process = subprocess.Popen([java, "-Xms512M", f"-Xmx{ram_mb}M", "-jar", "server.jar", "nogui"],
                    cwd=self.directory, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return self.process.pid

    def stop(self):
        if self.running:
            self.process.stdin.write(b"stop\n")
            self.process.stdin.flush()
            try:
                self.process.wait(timeout=30)
            except subprocess.TimeoutExpired as exc:
                raise ServerError("Server did not stop in 30 seconds. Check console; it was NOT force-killed.") from exc

    def tail(self):
        if self.directory is None:
            return "No server selected."
        try:
            with (self.directory / "console.log").open("rb") as log:
                log.seek(0, 2)
                log.seek(max(0, log.tell() - 4096))
                return log.read().decode("utf-8", errors="replace")
        except OSError:
            return "No console output yet."
