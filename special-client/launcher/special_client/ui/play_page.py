"""Play page: version, loader, Java, RAM, account, Launch / Install / Repair."""
from __future__ import annotations


from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (QComboBox, QHBoxLayout, QLabel,
                               QMessageBox, QPlainTextEdit, QPushButton,
                               QVBoxLayout, QWidget)
from ..core.java import required_java_major
from ..core.perf.presets import recommended_ram_mb
from .widgets import (LabeledSlider, NeonProgress, accent_card, card,
                      dim_label, section_title)


class PlayPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.win = window
        self.svc = window.service
        self._login_thread = None
        self._launching = False
        self._build()

    # ------------------------------------------------------------------ #
    def _build(self) -> None:
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 18, 24, 18)
        outer.setSpacing(14)

        # ---- version / loader row ----------------------------------------
        row = QHBoxLayout()
        c1 = card()
        v = QVBoxLayout(c1)
        v.setSpacing(6)
        v.addWidget(section_title("MINECRAFT VERSION"))
        self.version_box = QComboBox()
        self.version_box.setMinimumWidth(260)
        self.version_box.setInsertPolicy(QComboBox.NoInsert)
        v.addWidget(self.version_box)
        self.version_note = dim_label("loading version list…")
        v.addWidget(self.version_note)
        refresh_versions = QPushButton("Refresh catalogue")
        refresh_versions.clicked.connect(lambda: self.svc.request_manifest(True))
        v.addWidget(refresh_versions)

        c2 = card()
        v2 = QVBoxLayout(c2)
        v2.setSpacing(6)
        v2.addWidget(section_title("LOADER"))
        self.loader_box = QComboBox()
        self.loader_box.setMinimumWidth(220)
        v2.addWidget(self.loader_box)
        self.loader_note = dim_label("vanilla — no loader")
        v2.addWidget(self.loader_note)

        c3 = card()
        v3 = QVBoxLayout(c3)
        v3.setSpacing(6)
        v3.addWidget(section_title("JAVA"))
        self.java_box = QComboBox()
        self.java_box.setMinimumWidth(280)
        v3.addWidget(self.java_box)
        self.java_note = dim_label("scanning…")
        v3.addWidget(self.java_note)

        c4 = card()
        v4 = QVBoxLayout(c4)
        v4.setSpacing(6)
        v4.addWidget(section_title("MEMORY"))
        self.ram = LabeledSlider(1024, 16384, 512, " MB")
        rec = recommended_ram_mb(_total_ram_mb())
        self.ram.setValue(min(rec, 16384))
        v4.addWidget(self.ram)
        self.ram_note = dim_label()
        self.ram_note.setText(f"system RAM detected · recommended {rec} MB for the game")
        v4.addWidget(self.ram_note)
        btn_rec = QPushButton("Use recommended")
        btn_rec.setObjectName("GhostButton")
        btn_rec.clicked.connect(self._use_recommended_ram)
        v4.addWidget(btn_rec)

        row.addWidget(c1, 3)
        row.addWidget(c2, 2)
        row.addWidget(c3, 3)
        row.addWidget(c4, 3)
        outer.addLayout(row)

        # ---- account -------------------------------------------------------
        acc = accent_card()
        av = QVBoxLayout(acc)
        av.setSpacing(8)
        av.addWidget(section_title("ACCOUNT"))
        arow = QHBoxLayout()
        self.account_box = QComboBox()
        self.account_box.setMinimumWidth(240)
        self.account_box.currentTextChanged.connect(self._on_account)
        arow.addWidget(self.account_box, 1)
        btn_msa = QPushButton("Sign in with Microsoft")
        btn_msa.clicked.connect(self._start_msa_login)
        arow.addWidget(btn_msa)
        btn_off = QPushButton("Offline session…")
        btn_off.setObjectName("GhostButton")
        btn_off.clicked.connect(self._start_offline_login)
        arow.addWidget(btn_off)
        av.addLayout(arow)
        self.account_note = dim_label(
            "Microsoft sign-in uses the device-code flow (no password is ever "
            "entered in this app). Offline sessions use the vanilla "
            "OfflinePlayer UUID — online-mode servers may refuse them.")
        self.account_note.setWordWrap(True)
        av.addWidget(self.account_note)
        self.device_code_box = QWidget()
        dv = QVBoxLayout(self.device_code_box)
        dv.setContentsMargins(0, 0, 0, 0)
        dv.setSpacing(6)
        self.device_code_label = QLabel("")
        self.device_code_label.setStyleSheet(
            f"color: {self.win.t.accent}; font-size: 22px; font-weight: 800; "
            f"letter-spacing: 3px;")
        self.device_uri_label = QLabel("")
        self.device_uri_label.setWordWrap(True)
        self.device_uri_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        dv.addWidget(self.device_code_label)
        dv.addWidget(self.device_uri_label)
        btn_open = QPushButton("Open in browser")
        btn_open.clicked.connect(self._open_device_uri)
        btn_cancel = QPushButton("Cancel")
        btn_cancel.setObjectName("DangerButton")
        btn_cancel.clicked.connect(self._cancel_msa_login)
        brow = QHBoxLayout()
        brow.addWidget(btn_open)
        brow.addWidget(btn_cancel)
        brow.addStretch(1)
        dv.addLayout(brow)
        self.device_code_box.hide()
        av.addWidget(self.device_code_box)
        outer.addWidget(acc)

        # ---- actions ---------------------------------------------------------
        acts = QHBoxLayout()
        self.btn_launch = QPushButton("  LAUNCH")
        self.btn_launch.setObjectName("PrimaryButton")
        self.btn_launch.setMinimumHeight(52)
        self.btn_launch.setMinimumWidth(220)
        self.btn_launch.clicked.connect(self._on_launch)
        self.btn_install = QPushButton("Install / Update files")
        self.btn_install.setMinimumHeight(44)
        self.btn_install.clicked.connect(self._on_install)
        self.btn_repair = QPushButton("Repair")
        self.btn_repair.setMinimumHeight(44)
        self.btn_repair.setToolTip("Re-verifies every library & asset file and "
                                   "re-downloads anything missing or corrupt. "
                                   "Never touches saves, packs or screenshots.")
        self.btn_repair.clicked.connect(self._on_repair)
        acts.addWidget(self.btn_launch, 2)
        acts.addWidget(self.btn_install, 1)
        acts.addWidget(self.btn_repair, 1)
        outer.addLayout(acts)

        # ---- progress -----------------------------------------------------------
        self.progress = NeonProgress()
        outer.addWidget(self.progress)
        self.status_label = dim_label("")
        self.status_label.setWordWrap(True)
        outer.addWidget(self.status_label)

        # ---- offline readiness ----------------------------------------------------
        self.offline_box = QWidget()
        ov = QVBoxLayout(self.offline_box)
        ov.setContentsMargins(0, 0, 0, 0)
        ov.setSpacing(4)
        off_title = QLabel("Offline readiness")
        off_title.setStyleSheet(f"color: {self.win.t.warn}; font-weight: 700;")
        self.offline_text = dim_label("")
        self.offline_text.setWordWrap(True)
        ov.addWidget(off_title)
        ov.addWidget(self.offline_text)
        outer.addWidget(self.offline_box)
        outer.addStretch(1)

        # ---- recent log tail --------------------------------------------------------
        outer.addWidget(section_title("LAST OUTPUT"))
        self.log_tail = QPlainTextEdit()
        self.log_tail.setReadOnly(True)
        self.log_tail.setMaximumBlockCount(200)
        self.log_tail.setMaximumHeight(150)
        self.log_tail.setStyleSheet("font-family: Consolas, 'Cascadia Mono', monospace; font-size: 11px;")
        outer.addWidget(self.log_tail)

        # timers
        self._refresh_timer = QTimer(self, timeout=self._refresh_dynamic,
                                     interval=1500)
        self._refresh_timer.start()
        self._refresh_timer_2 = QTimer(self, timeout=self._refresh_offline,
                                       interval=4000)
        # Full offline integrity scans are explicit/selection-driven, not every four seconds.

        self.svc.log_line.connect(self._append_log)
        self.svc.manifest_ready.connect(lambda _: self._refresh_versions())
        self.svc.manifest_failed.connect(lambda error: self.version_note.setText("Catalogue failed; retry Refresh. " + error[:180]))
        self.version_box.currentIndexChanged.connect(lambda _: self._version_selected())

    # ------------------------------------------------------------------ #
    def on_shown(self) -> None:
        self._refresh_versions()
        self.svc.request_manifest()
        self._refresh_java()
        self._refresh_accounts()
        self._refresh_loaders()
        self._refresh_offline()

    # ------------------------------------------------------------------ #
    def _total_ram_mb(self) -> int:
        import psutil
        return int(psutil.virtual_memory().total / (1024 * 1024))

    def _use_recommended_ram(self) -> None:
        self.ram.setValue(recommended_ram_mb(_total_ram_mb()))

    # -- versions -----------------------------------------------------------
    def _refresh_versions(self, force: bool = False) -> None:
        selected = self.version_box.currentData()
        cur = selected.id if selected else self.svc.config.get("version_id")
        self.version_box.blockSignals(True)
        self.version_box.clear()
        manifest = self.svc.load_manifest()
        if manifest is None:
            from ..core.manifest import Manifest, VersionEntry
            entries = [VersionEntry(p.stem, "release", "") for p in self.svc.layout.versions.glob("*/*.json")
                       if p.stem == p.parent.name]
            manifest = Manifest(entries=entries, from_cache=True, source="installed")
        entries = manifest.sorted(only_supported=True)
        releases = [e for e in entries if e.type in ("release", "old")]
        snapshots = [e for e in entries if e.type == "snapshot"]
        self.version_box.insertItem(0, "— Releases —", None)
        for e in releases:
            self.version_box.addItem(e.id, e)
        if snapshots:
            self.version_box.insertItem(self.version_box.count(), "— Snapshots —", None)
            for e in snapshots[:40]:
                self.version_box.addItem(e.id, e)
        self.version_box.setCurrentIndex(1 if releases else 0)
        # restore selection
        if cur:
            for i in range(self.version_box.count()):
                if self.version_box.itemData(i) is not None and \
                        self.version_box.itemData(i).id == cur:
                    self.version_box.setCurrentIndex(i)
                    break
        self.version_box.blockSignals(False)
        self.version_note.setText(
            f"{len(releases)} releases · {len(snapshots)} snapshots · {manifest.source}"
            + (" (from cache)" if getattr(manifest, "from_cache", False) else ""))
        self.win.set_online_display(not manifest.from_cache, manifest.from_cache)
        if not releases:
            self.version_note.setText("No cached releases. Refresh downloads GitHub catalogue with Mojang fallback.")
        self._refresh_loaders()

    def _version_selected(self):
        entry = self.selected_version()
        if entry:
            self.svc.config.set("version_id", entry.id)
            self.svc.config.save()
        self._refresh_java()
        self._refresh_loaders()

    def selected_version(self):
        return self.version_box.currentData()

    # -- loaders -----------------------------------------------------------------
    def _refresh_loaders(self) -> None:
        cur = self.loader_box.currentData()
        self.loader_box.blockSignals(True)
        self.loader_box.clear()
        self.loader_box.addItem("Vanilla", ("vanilla", None))
        for p in self.svc.loader_service.installed_profiles():
            label = f"{p.loader_kind} {p.loader_version}  ({p.name})"
            self.loader_box.addItem(label, ("loader", p.name))
        self.loader_box.blockSignals(False)
        if cur and cur[0] == "loader":
            for i in range(self.loader_box.count()):
                d = self.loader_box.itemData(i)
                if d == cur:
                    self.loader_box.setCurrentIndex(i)
                    break
        self._update_loader_note()

    def _update_loader_note(self) -> None:
        d = self.loader_box.currentData()
        if d and d[0] == "loader":
            self.loader_note.setText(f"custom profile: {d[1]}")
        else:
            self.loader_note.setText("vanilla — no loader")
        self._refresh_offline()

    def _install_loader(self) -> None:
        mc = self.selected_version()
        if mc is None:
            QMessageBox.information(self, "SPECIAL CLIENT",
                                    "Choose a Minecraft version first.")
            return
        from . import loaders_dialog
        loaders_dialog.install_loader_for(self.svc, self, mc.id)

    def add_loader_profile(self, profile) -> None:
        label = f"{profile.loader_kind} {profile.loader_version}  ({profile.name})"
        self.loader_box.addItem(label, ("loader", profile.name))

    # -- java ------------------------------------------------------------------------
    def _refresh_java(self) -> None:
        cur = self.java_box.currentData()
        self.java_box.blockSignals(True)
        self.java_box.clear()
        if not self.svc.java_runtimes:
            self.java_box.addItem("scanning…", None)
            self.java_note.setText("detection in progress")
            self.java_box.blockSignals(False)
            return
        mc = self.selected_version()
        need = required_java_major(mc.id) if mc else 8
        self.java_box.addItem("— auto (best match) —", "auto")
        for rt in self.svc.java_runtimes:
            ok = "✓" if rt.major >= need else "✗"
            self.java_box.addItem(
                f"{ok}  Java {rt.major}  ·  {rt.vendor or rt.version_string}", rt.path)
        self.java_box.blockSignals(False)
        if cur:
            for i in range(self.java_box.count()):
                if self.java_box.itemData(i) == cur:
                    self.java_box.setCurrentIndex(i)
                    break
        note = f"selected version needs Java {need}+" if mc else "pick a version to see requirements"
        if not self.svc.java_runtimes:
            note = "no Java runtimes found — install Java (see Settings)"
        self.java_note.setText(note)

    # -- accounts --------------------------------------------------------------------------
    def _refresh_accounts(self) -> None:
        cur = self.account_box.currentText()
        self.account_box.blockSignals(True)
        self.account_box.clear()
        self.account_box.addItem("— no account —", None)
        for name in self.svc.account_names:
            self.account_box.addItem(f"Microsoft: {name}", ("msa", name))
        if self.svc.active_session:
            s = self.svc.active_session
            kind = "Microsoft" if s.is_microsoft else "Offline"
            self.account_box.addItem(f"{kind}: {s.player_name}",
                                     ("active", s.player_name))
        self.account_box.blockSignals(False)
        if cur:
            for i in range(self.account_box.count()):
                if self.account_box.itemText(i) == cur:
                    self.account_box.setCurrentIndex(i)
        self._update_account_display()

    def _update_account_display(self) -> None:
        s = self.svc.active_session
        if s:
            kind = "Microsoft" if s.is_microsoft else "Offline"
            self.win.set_account_display(f"{kind}: {s.player_name}")
        else:
            self.win.set_account_display("No account")

    def _on_account(self, text: str) -> None:
        d = self.account_box.currentData()
        if d is None:
            self.svc.active_session = None
        elif d[0] == "msa":
            # re-authenticate with the stored refresh token (online)
            self._start_msa_restore(d[1])
        elif d[0] == "active":
            pass
        self._update_account_display()

    def _start_msa_login(self) -> None:
        if self._login_thread is not None:
            return
        self.device_code_box.show()
        self.device_code_label.setText("Requesting device code…")
        self.device_uri_label.setText("")

        aborted = {"v": False}

        def on_device_code(info):
            def _show():
                self.device_code_label.setText(info.user_code)
                self.device_uri_label.setText(
                    f"1. Open {info.verification_uri}\n"
                    f"2. Enter code {info.user_code}\n"
                    f"3. Approve with your Microsoft account\n\n"
                    f"{info.message}")
                from PySide6.QtCore import QTimer
                QTimer.singleShot(0, _show)
            _show()

        def on_wait(seconds: int):
            def _upd():
                self.device_uri_label.setText(
                    f"Waiting for approval… {seconds}s left\n\n"
                    f"{self.device_uri_label.text()}")
            from PySide6.QtCore import QTimer
            QTimer.singleShot(0, _upd)

        def should_abort():
            return aborted["v"]

        def work(progress):
            return self.svc.login_microsoft_blocking(
                on_device_code, on_wait, should_abort)

        from PySide6.QtCore import QTimer
        w = self.svc.run_async(
            work,
            on_ok=lambda s: QTimer.singleShot(0, lambda: self._login_done(s)),
            on_err=lambda e: QTimer.singleShot(0, lambda: self._login_failed(e)),
        )
        self._login_thread = w

    def _login_done(self, session) -> None:
        self._login_thread = None
        self.device_code_box.hide()
        self._refresh_accounts()
        self._select_active()
        self.win.set_account_display(f"Microsoft: {session.player_name}")
        self.status_label.setText(
            f"Signed in as {session.player_name}. You now have access to "
            f"Minecraft Java Edition if your account owns it.")

    def _login_failed(self, err: str) -> None:
        self._login_thread = None
        self.device_code_box.hide()
        self.status_label.setText(f"Login failed: {err.splitlines()[0]}")

    def _cancel_msa_login(self) -> None:
        if self._login_thread is not None:
            # poll loop checks should_abort every interval
            self._cancel_flag = True
        self.device_code_box.hide()
        self.device_code_label.setText("")

    def _open_device_uri(self) -> None:
        pass  # URI shown in device_uri_label; user can copy

    def _start_msa_restore(self, name: str) -> None:
        self.status_label.setText(f"Restoring Microsoft session for {name}…")
        self.svc.run_async(
            lambda progress: self.svc.restore_microsoft(name),
            on_ok=lambda s: QTimer.singleShot(
                0, lambda: (self._refresh_accounts(), self._select_active(),
                            self.status_label.setText(
                                f"Session restored for {s.player_name}"))),
            on_err=lambda e: QTimer.singleShot(
                0, lambda: self.status_label.setText(
                    f"Could not restore {name}: {e.splitlines()[0]} — "
                    f"use Sign in with Microsoft.")),
        )

    def _start_offline_login(self) -> None:
        from .dialogs import ask_offline_name
        name = ask_offline_name(self)
        if not name:
            return
        try:
            self.svc.login_offline(name)
        except Exception as e:  # noqa: BLE001
            QMessageBox.warning(self, "SPECIAL CLIENT", str(e))
            return
        self._refresh_accounts()
        self._select_active()
        self.status_label.setText(
            f"Offline session: {name} (vanilla OfflinePlayer UUID). "
            f"Online-mode servers may refuse this account.")

    def _select_active(self) -> None:
        s = self.svc.active_session
        if s is None:
            return
        for i in range(self.account_box.count()):
            d = self.account_box.itemData(i)
            if d and d[0] == "active" and d[1] == s.player_name:
                self.account_box.setCurrentIndex(i)
                break

    # -- launch pipeline -----------------------------------------------------------------
    def _selected_loader_profile(self):
        d = self.loader_box.currentData()
        if d and d[0] == "loader":
            return d[1]
        return None

    def _on_launch(self) -> None:
        if self._launching:
            return
        entry = self.selected_version()
        if entry is None:
            QMessageBox.information(self, "SPECIAL CLIENT",
                                    "Choose a Minecraft version.")
            return
        if self.svc.active_session is None:
            QMessageBox.information(
                self, "SPECIAL CLIENT",
                "No account selected.\n\nSign in with Microsoft, or choose an "
                "offline session (Account row above).")
            return
        self._launching = True
        self.btn_launch.setEnabled(False)
        loader_profile = self._selected_loader_profile()
        ram = self.ram.value()

        def work(progress):
            # 1. install/verify
            progress("installing", 0.05, entry.id)
            self.svc.launch_service.install_version(entry, progress)
            # 2. plan
            plan = self.svc.build_launch_plan(entry.id, loader_profile, ram)
            # 3. go
            from ..core.launch import extract_natives
            spec = self.svc._launch_spec(plan)
            extract_natives(spec)
            gp = self.svc.runner.start(spec, ram, on_line=self._game_line)
            return gp

        from PySide6.QtCore import QTimer
        self.svc.run_async(
            work,
            on_ok=lambda gp: QTimer.singleShot(0, lambda: self._launched(gp)),
            on_err=lambda e: QTimer.singleShot(0, lambda: self._launch_error(e)),
        )

    def _launched(self, gp) -> None:
        self._launching = False
        self.btn_launch.setEnabled(True)
        self.progress.set_fraction(1.0)
        self.progress.set_detail("Game started")
        self.status_label.setText(
            f"Minecraft {gp.version_id} is running (pid {gp.proc.pid}). "
            f"Log: {gp.log_path}")
        if self.svc.config.get("minimize_at_launch"):
            self.win.showMinimized()

    def _launch_error(self, err: str) -> None:
        self._launching = False
        self.btn_launch.setEnabled(True)
        self.progress.set_fraction(0.0)
        self.progress.set_detail("Failed")
        self.status_label.setText(f"Launch failed: {err.splitlines()[0]}")
        QMessageBox.critical(self, "SPECIAL CLIENT — launch failed", err)

    def _game_line(self, line: str) -> None:
        from PySide6.QtCore import QTimer
        QTimer.singleShot(0, lambda l=line: self.log_tail.appendPlainText(l))

    def _append_log(self, line: str) -> None:
        from PySide6.QtCore import QTimer
        def _do():
            self.log_tail.appendPlainText(line)
            if self.log_tail.blockCount() > 500:
                self.log_tail.setPlainText(
                    self.log_tail.toPlainText()[-20000:])
        QTimer.singleShot(0, _do)

    # -- install / repair -------------------------------------------------------------------
    def _on_install(self) -> None:
        entry = self.selected_version()
        if entry is None:
            QMessageBox.information(self, "SPECIAL CLIENT",
                                    "Choose a Minecraft version.")
            return
        self.btn_install.setEnabled(False)

        def work(progress):
            return self.svc.launch_service.install_version(entry, progress)

        from PySide6.QtCore import QTimer
        self.svc.run_async(
            work,
            on_ok=lambda v: QTimer.singleShot(
                0, lambda: (self.btn_install.setEnabled(True),
                            self.progress.set_fraction(1.0),
                            self.progress.set_detail(
                                f"{v.id} installed"),
                            self.status_label.setText(
                                f"Version {v.id} installed and ready."))),
            on_err=lambda e: QTimer.singleShot(
                0, lambda: (self.btn_install.setEnabled(True),
                            QMessageBox.critical(self, "SPECIAL CLIENT", e))),
        )

    def _on_repair(self) -> None:
        entry = self.selected_version()
        if entry is None:
            QMessageBox.information(self, "SPECIAL CLIENT",
                                    "Choose a Minecraft version.")
            return
        self.btn_repair.setEnabled(False)

        def work(progress):
            v = self.svc.launch_service.fetch_version_json(entry)
            return self.svc.launch_service.repair(v, progress)

        from PySide6.QtCore import QTimer
        self.svc.run_async(
            work,
            on_ok=lambda r: QTimer.singleShot(
                0, lambda: (self.btn_repair.setEnabled(True),
                            self.progress.set_fraction(1.0),
                            self.progress.set_detail("Repair complete"),
                            self.status_label.setText(
                                f"Repair: {r.files_checked} files checked, "
                                f"{r.files_downloaded} re-downloaded, "
                                f"{r.files_repaired} repaired. "
                                f"User data (saves, packs, screenshots) untouched."))),
            on_err=lambda e: QTimer.singleShot(
                0, lambda: (self.btn_repair.setEnabled(True),
                            QMessageBox.critical(self, "SPECIAL CLIENT", e))),
        )

    # -- offline readiness -------------------------------------------------------------------
    def _refresh_offline(self) -> None:
        entry = self.selected_version()
        if entry is None:
            self.offline_box.hide()
            return
        report = self.svc.offline_report(entry.id)
        if report.launchable:
            self.offline_box.hide()
            return
        self.offline_box.show()
        self.offline_text.setText(
            "\n".join(f"• {b}" for b in report.blockers[:6])
            + ("\n\n(With internet the Install button fixes these automatically.)"
               if report.version_installed else ""))

    # -- dynamic refresh ----------------------------------------------------------------------
    def _refresh_dynamic(self) -> None:
        if not self.isVisible():
            return
        if not self.java_runtimes_ready:
            self._refresh_java()
        # keep log tail small
        pass

    @property
    def java_runtimes_ready(self) -> bool:
        return bool(self.svc.java_runtimes) or not self.svc.detect_java.is_alive()

    # -- download progress (global) ----------------------------------------------------------------
    def on_download_progress(self, p) -> None:
        if p.state in ("downloading", "verifying"):
            frac = p.fraction if p.fraction >= 0 else 0.5
            self.progress.set_fraction(frac)
            self.progress.set_detail(p.url.rsplit("/", 1)[-1],
                                     p.speed_bps, p.eta_seconds)
        elif p.state == "done":
            self.status_label.setText(f"Downloaded: {p.url.rsplit('/', 1)[-1]}")
        elif p.state == "error":
            self.status_label.setText(f"Download error: {p.error}")


def _total_ram_mb() -> int:
    try:
        import psutil
        return int(psutil.virtual_memory().total / (1024 * 1024))
    except Exception:
        return 8192
