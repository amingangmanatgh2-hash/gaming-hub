"""Small explicit hosting panel; networking requirements are visible, not faked."""
from PySide6.QtCore import QTimer, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, QCheckBox,
                               QPushButton, QLineEdit, QSpinBox, QPlainTextEdit)
from ..core.server import ServerHost


class ServersPage(QWidget):
    def __init__(self, window):
        super().__init__()
        self.win, self.svc = window, window.service
        self.host = ServerHost(self.svc.layout.game_dir / "servers")
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 18, 24, 18)
        title = QLabel("FRIENDS / VANILLA SERVER")
        title.setObjectName("PageTitle")
        outer.addWidget(title)
        note = QLabel("Uses the Minecraft version selected on Play. Separate worlds under <game>/servers/. "
                      "Friends on your LAN use your LAN IP:25565. Internet access requires explicit router port-forwarding "
                      "or a separately configured trusted VPN/tunnel; this app does NOT open ports or configure a tunnel. "
                      "Keep online-mode authentication enabled. Hosting consumes additional CPU/RAM.")
        note.setWordWrap(True)
        outer.addWidget(note)
        row = QHBoxLayout()
        self.java = QLineEdit(self.svc.config.get("java_path") or "java")
        self.java.setPlaceholderText("Java executable matching selected server version")
        row.addWidget(self.java, 1)
        self.ram = QSpinBox()
        self.ram.setRange(512, 4096)
        self.ram.setSingleStep(256)
        self.ram.setValue(1024)
        self.ram.setSuffix(" MB")
        row.addWidget(self.ram)
        outer.addLayout(row)
        self.eula = QCheckBox("I have read and accept the Minecraft EULA for this server")
        outer.addWidget(self.eula)
        buttons = QHBoxLayout()
        for label, fn in [("Read EULA ↗", lambda: QDesktopServices.openUrl(QUrl("https://www.minecraft.net/eula"))),
                          ("Install selected version", self.install), ("Start server", self.start), ("Stop server", self.stop)]:
            b = QPushButton(label)
            b.clicked.connect(fn)
            buttons.addWidget(b)
        outer.addLayout(buttons)
        self.state = QLabel("Not running. Use a test world first; back up server worlds before changes.")
        self.state.setWordWrap(True)
        outer.addWidget(self.state)
        self.log = QPlainTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumBlockCount(250)
        outer.addWidget(self.log, 1)
        self.busy = False
        self.timer = QTimer(self, interval=2500)
        self.timer.timeout.connect(self._poll)
        self.timer.start()

    def install(self):
        entry = self.win._pages["play"].selected_version()
        if self.busy or not entry:
            self.state.setText("Select a real version on Play first, or wait for the current task.")
            return
        if not self.eula.isChecked():
            self.state.setText("Read the EULA and explicitly check acceptance first.")
            return
        root = self.svc.layout.game_dir / "servers"
        if self.host.running:
            self.state.setText("Stop current server before installing/changing directories.")
            return
        self.host.root = root
        self.busy = True
        self.state.setText("Downloading official verified server JAR…")
        def done(directory):
            self.busy = False
            self.state.setText(f"Installed at {directory}. Set matching Java, then Start. Wait for Done in console before connecting.")
        def failed(error):
            self.busy = False
            self.state.setText(error)
        self.svc.run_async(lambda p: self.host.install(entry, self.svc.launch_service, accepted_eula=True), on_ok=done, on_err=failed)

    def start(self):
        if self.busy:
            return
        try:
            pid = self.host.start(self.java.text().strip(), self.ram.value())
            self.state.setText(f"Java process {pid} started; server readiness is NOT confirmed until console says Done.")
        except (OSError, RuntimeError) as exc:
            self.state.setText(str(exc))

    def stop(self):
        if self.busy:
            return
        self.busy = True
        self.state.setText("Requesting graceful stop…")
        def done(_):
            self.busy = False
            self.state.setText("Server stopped.")
        def failed(error):
            self.busy = False
            self.state.setText(error)
        self.svc.run_async(lambda p: self.host.stop(), on_ok=done, on_err=failed)

    def _poll(self):
        if self.isVisible():
            text = self.host.tail()
            if self.log.toPlainText() != text:
                self.log.setPlainText(text)

    def on_shown(self):
        self._poll()
