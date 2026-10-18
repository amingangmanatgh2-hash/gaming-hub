"""Performance dashboard: live FPS / frame time / RAM / CPU / ping,
presets, and crash diagnostics entry point."""
from __future__ import annotations

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QComboBox, QHBoxLayout, QMessageBox,
                               QPushButton, QVBoxLayout, QWidget)
from ..core.perf.presets import PRESETS, preset_ram_mb, apply_preset
from ..core.diagnostics import parse_crash_reports
from .widgets import (LabeledSlider, StatTile, SparkGraph, card, dim_label,
                      section_title)


class PerfPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.win = window
        self.svc = window.service
        self._hist = []
        self._build()
        self._timer = QTimer(self, timeout=self._tick, interval=2000)
        self._timer.start()

    # ------------------------------------------------------------------ #
    def _build(self) -> None:
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 18, 24, 18)
        outer.setSpacing(12)

        # stat tiles
        tiles = QHBoxLayout()
        self.t_fps = StatTile("FPS (in-game)", "—")
        self.t_frame = StatTile("Frame time avg", "—")
        self.t_ram = StatTile("Game RAM", "—")
        self.t_cpu = StatTile("Game CPU", "—")
        self.t_ping = StatTile("Ping", "—")
        for t in (self.t_fps, self.t_frame, self.t_ram, self.t_cpu,
                  self.t_ping):
            tiles.addWidget(t, 1)
        outer.addLayout(tiles)

        # graphs row
        graphs = QHBoxLayout()
        self.fps_graph = SparkGraph("FPS", 300,
                                    QColor(self.win.t.accent))
        self.frame_graph = SparkGraph("Frame time (ms)", 60,
                                      QColor(self.win.t.accent2))
        graphs.addWidget(self.fps_graph, 1)
        graphs.addWidget(self.frame_graph, 1)
        outer.addLayout(graphs, 1)

        self.game_state = dim_label(
            "Start the game to see live in-game telemetry (published by the "
            "SPECIAL CLIENT in-game module) plus process CPU/RAM from the "
            "launcher. No FPS promises: presets are starting points, not "
            "guarantees.")
        self.game_state.setWordWrap(True)
        outer.addWidget(self.game_state)

        # presets
        pres = card()
        pv = QVBoxLayout(pres)
        pv.setSpacing(8)
        pv.addWidget(section_title("PERFORMANCE PRESET"))
        prow = QHBoxLayout()
        self.preset_box = QComboBox()
        for key, p in PRESETS.items():
            if key != "custom":
                self.preset_box.addItem(p["label"], key)
        self.preset_box.currentIndexChanged.connect(self._preset_changed)
        self.preset_note = dim_label(PRESETS["balanced"]["description"])
        self.preset_note.setWordWrap(True)
        self.ram_custom = LabeledSlider(1024, 16384, 512, " MB")
        self.ram_custom.setValue(4096)
        btn_apply = QPushButton("Apply to instance options.txt")
        btn_apply.setObjectName("PrimaryButton")
        btn_apply.clicked.connect(self._apply_preset)
        btn_crash = QPushButton("View crash reports…")
        btn_crash.setObjectName("GhostButton")
        btn_crash.clicked.connect(self._view_crash_reports)
        prow.addWidget(self.preset_box, 2)
        prow.addWidget(self.ram_custom, 3)
        prow.addWidget(btn_apply, 2)
        prow.addWidget(btn_crash, 1)
        pv.addLayout(prow)
        pv.addWidget(self.preset_note)
        mrow = QHBoxLayout()
        self.mem_note = dim_label(
            "Allocation guidance: the launcher recommends a game allocation "
            "that leaves ≥1 GB for Windows. 4 GB system → 2 GB · "
            "8 GB → 4 GB · 16 GB → 6 GB · 32 GB+ → 8 GB.")
        self.mem_note.setWordWrap(True)
        mrow.addWidget(self.mem_note, 1)
        pv.addLayout(mrow)
        outer.addWidget(pres)

        # mod diagnostics
        diag = card()
        dv = QVBoxLayout(diag)
        dv.setSpacing(8)
        dv.addWidget(section_title("MOD COMPATIBILITY DIAGNOSTICS"))
        self.diag_text = dim_label("Not scanned.")
        self.diag_text.setWordWrap(True)
        btn_diag = QPushButton("Scan mods")
        btn_diag.setObjectName("GhostButton")
        btn_diag.clicked.connect(self._scan)
        dv.addWidget(btn_diag, 0, Qt.AlignLeft)
        dv.addWidget(self.diag_text)
        outer.addWidget(diag)
        outer.addStretch(1)

    # ------------------------------------------------------------------ #
    def on_shown(self) -> None:
        self._tick()

    def _tick(self) -> None:
        if not self.isVisible():
            return
        sample = self.svc.monitor.sample()
        stats = self.svc.stats_bridge.read()
        if sample is None and stats is None:
            self.game_state.setText(
                "Game not running (no process with this game directory "
                "found). Launch from the Play page to populate this "
                "dashboard.")
            for t in (self.t_fps, self.t_frame, self.t_ram, self.t_cpu,
                      self.t_ping):
                t.set_value("—")
            self.fps_graph.clear()
            self.frame_graph.clear()
            return
        # process side (always available while the game runs)
        if sample is not None:
            self.t_ram.set_value(f"{sample.ram_mb:.0f} MB")
            self.t_cpu.set_value(f"{sample.cpu_percent:.0f}%")
            self.game_state.setText(
                f"Process {sample.pid} · {sample.ram_mb:.0f} MB · "
                f"{sample.cpu_percent:.0f}% CPU"
                + (f" · FPS {stats.fps}" if stats and stats.fresh else
                   " · in-game FPS: waiting for the in-client stats bridge"
                   if not (stats and stats.fresh) else ""))
        # in-game side (via the stats bridge file)
        if stats is not None and stats.fresh:
            self.t_fps.set_value(str(stats.fps))
            self.t_frame.set_value(f"{stats.frame_ms_avg:.1f} ms")
            if stats.ping_ms >= 0:
                self.t_ping.set_value(f"{stats.ping_ms} ms")
            else:
                self.t_ping.set_value("—")
            self.fps_graph.push(stats.fps)
            self.frame_graph.push(stats.frame_ms_avg)
        elif stats is not None:
            self.game_state.setText(
                "In-game stats file is stale — is the SPECIAL CLIENT in-game "
                "module installed for this instance? (Performance tiles for "
                "process RAM/CPU still work.)")

    # ------------------------------------------------------------------ #
    def _preset_changed(self, _i) -> None:
        key = self.preset_box.currentData()
        if key:
            self.preset_note.setText(PRESETS[key]["description"])

    def _apply_preset(self) -> None:
        key = self.preset_box.currentData() or "balanced"
        import psutil
        total = int(psutil.virtual_memory().total / (1024 * 1024))
        ram = preset_ram_mb(key, total)
        options_path = self.svc.layout.game_dir / "options.txt"
        existing = {}
        if options_path.exists():
            try:
                for line in options_path.read_text().splitlines():
                    if ":" in line:
                        k, v = line.split(":", 1)
                        existing[k.strip()] = v.strip()
            except OSError:
                pass
        play = self.win._pages["play"]
        selected = play.selected_version()
        result = apply_preset(key, options_path, existing=existing, mc_version=selected.id if selected else "1.20.1")
        import shutil
        if options_path.exists():
            shutil.copy2(options_path, options_path.with_suffix(".txt.special-backup"))
        options_path.write_text(result.written["__options__"])
        self.win._pages["play"].ram.setValue(ram)
        self.svc.config.set("perf_preset", key)
        self.svc.config.save()
        self.mem_note.setText(
            f"Applied preset {PRESETS[key]['label']} to {options_path} and "
            f"recommended {ram} MB allocation "
            f"(system total {total} MB). The next launch will use these "
            f"settings; keep the Play-page RAM slider at {ram} MB or higher "
            f"for mods.")
        QMessageBox.information(
            self, "SPECIAL CLIENT",
            f"Preset {PRESETS[key]['label']} applied.\n\n"
            f"{len(result.written) - 1} options updated in options.txt.\n"
            f"Recommended game allocation: {ram} MB.\n\n"
            "Changes take effect on the next launch.")

    def _scan(self) -> None:
        play = self.win._pages["play"]
        entry = play.selected_version()
        mc = entry.id if entry else self.svc.config.get("version_id")
        d = play.loader_box.currentData()
        loader = "vanilla"
        if d and d[0] == "loader":
            from .mods_page import _loader_kind
            loader = _loader_kind(d[1])
        if loader == "vanilla":
            self.diag_text.setText(
                "No loader installed — mod diagnostics require a mod loader "
                "(install Fabric on the Mods page).")
            return
        try:
            mods = self.svc.mod_manager.inventory(mc, loader)
            conflicts = self.svc.mod_manager.detect_conflicts()
            lines = []
            perf = [m for m in mods if m.category == "performance"]
            lines.append(f"{len(mods)} mods installed for {mc} ({loader}).")
            if perf:
                lines.append("Performance stack: "
                             + ", ".join(m.name for m in perf if m.state == "installed"))
            if conflicts["warnings"]:
                lines.append("⚠ " + " | ".join(conflicts["warnings"]))
            else:
                lines.append("No duplicate mod IDs detected.")
            for m in mods:
                if m.notes and m.state == "installed":
                    lines.append(f"• {m.name}: {'; '.join(m.notes)}")
            self.diag_text.setText("\n".join(lines))
        except Exception as e:  # noqa: BLE001
            self.diag_text.setText(f"scan failed: {e}")

    def _view_crash_reports(self) -> None:
        from ..core.diagnostics import diagnose
        crash_dir = self.svc.layout.game_dir / "crash-reports"
        reports = parse_crash_reports(crash_dir)
        msg = QMessageBox(self)
        msg.setWindowTitle("Crash reports")
        if not reports:
            msg.setText("No crash reports found in "
                        f"{crash_dir}.")
            msg.exec()
            return
        text = ""
        for r in reports[:3]:
            text += f"=== {r['file']} ===\n{r['preview']}\n\n"
        last = reports[0]
        d = diagnose(last["preview"])
        text = f"Newest crash: {last['file']}\n{d.summary}\n→ {d.suggestion}\n\n" + text
        msg.setText(text)
        msg.exec()
