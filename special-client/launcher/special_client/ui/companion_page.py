"""Optional companion: ephemeral chat, explicit API consent and confirmed local actions."""
from __future__ import annotations

import threading

from PySide6.QtCore import QTimer, Signal
from PySide6.QtWidgets import (QCheckBox, QComboBox, QFormLayout, QHBoxLayout,
                               QLabel, QLineEdit, QMessageBox, QPushButton,
                               QPlainTextEdit, QVBoxLayout, QWidget)
from ..core.companion import (PROVIDERS, ChatClient, CompanionError, Mailbox,
                              SecretStore, endpoint)


class CompanionPage(QWidget):
    completed = Signal(object)

    def __init__(self, window):
        super().__init__()
        self.win = window
        self.svc = window.service
        self.secrets = SecretStore(self.svc.app_dir)
        self.history = []
        self.busy = False
        self.generation = 0
        self.pending = None
        self.speech = None
        self.completed.connect(self._completed)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 12, 24, 12)
        self.enabled = QCheckBox("Enable external API chat (optional; provider may charge / retain messages)")
        self.enabled.setChecked(bool(self.svc.config.get("companion_enabled")))
        outer.addWidget(self.enabled)
        form = QFormLayout()
        self.provider = QComboBox()
        for label, value in [("OpenAI", "openai"), ("Groq", "groq"), ("Custom OpenAI-compatible", "custom")]:
            self.provider.addItem(label, value)
        self.provider.setCurrentIndex(max(0, self.provider.findData(self.svc.config.get("companion_provider", "openai"))))
        self.base = QLineEdit(self.svc.config.get("companion_endpoint", PROVIDERS["openai"][0]))
        self.model = QLineEdit(self.svc.config.get("companion_model", PROVIDERS["openai"][1]))
        self.key = QLineEdit()
        self.key.setEchoMode(QLineEdit.Password)
        self.key.setPlaceholderText("Enter key here only; blank preserves key for the SAME endpoint")
        form.addRow("Provider", self.provider)
        form.addRow("HTTPS API base", self.base)
        form.addRow("Model (availability varies)", self.model)
        form.addRow("API key", self.key)
        outer.addLayout(form)
        self.provider.currentIndexChanged.connect(self._provider_changed)
        controls = QHBoxLayout()
        for title, fn in [("Save API settings", self._save), ("Delete saved key", self._delete_key), ("Clear chat", self._clear)]:
            button = QPushButton(title)
            button.clicked.connect(fn)
            controls.addWidget(button)
        self.speak = QCheckBox("Read replies aloud (system voice; OFF by default)")
        controls.addWidget(self.speak)
        outer.addLayout(controls)
        note = QLabel("Only typed chat/history is sent to your selected provider. No screenshots, world scan, microphone or tokens are sent. "
                      "Model actions require approval here. Game collection is private-singleplayer only; keep this launcher open.")
        note.setWordWrap(True)
        outer.addWidget(note)
        self.log = QPlainTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumBlockCount(300)
        outer.addWidget(self.log, 1)
        row = QHBoxLayout()
        self.input = QLineEdit()
        self.input.setMaxLength(4000)
        self.input.setPlaceholderText("Chat with your companion… / emerald or diamond collection needs confirmation")
        self.input.returnPressed.connect(self._send)
        row.addWidget(self.input, 1)
        self.send = QPushButton("Send")
        self.send.clicked.connect(self._send)
        row.addWidget(self.send)
        outer.addLayout(row)
        actions = QHBoxLayout()
        for title, action in [("Collect emerald + return", "collect_emerald"), ("Collect diamond + return", "collect_diamond"), ("STOP", "stop")]:
            button = QPushButton(title)
            button.clicked.connect(lambda checked=False, a=action: self._dispatch(a, confirm=a != "stop"))
            actions.addWidget(button)
        self.approve = QPushButton("Approve proposed action")
        self.approve.setEnabled(False)
        self.approve.clicked.connect(self._approve)
        actions.addWidget(self.approve)
        outer.addLayout(actions)
        self.status = QLabel("No API needed for local action buttons. No task starts automatically.")
        self.status.setWordWrap(True)
        outer.addWidget(self.status)
        self.timer = QTimer(self, interval=500)
        self.timer.timeout.connect(self._poll)
        self.timer.start()

    def _provider_changed(self):
        preset = PROVIDERS.get(self.provider.currentData())
        if preset:
            self.base.setText(preset[0])
            self.model.setText(preset[1])
        self.key.clear()

    def _save(self):
        try:
            base = endpoint(self.base.text())
            if not self.model.text().strip():
                raise CompanionError("A model name is required.")
            if self.key.text().strip():
                self.secrets.save(base, self.key.text())
            for name, value in {"enabled": self.enabled.isChecked(), "provider": self.provider.currentData(),
                                "endpoint": base, "model": self.model.text().strip()}.items():
                self.svc.config.set("companion_" + name, value)
            self.svc.config.save()
            self.key.clear()
            self._clear()
            self.status.setText("Saved. Key available for this endpoint: " + str(bool(self.secrets.get(base))))
        except (CompanionError, OSError):
            self.status.setText("Could not save. Check HTTPS endpoint, model and key. No key was printed.")

    def _delete_key(self):
        self.secrets.clear()
        self.key.clear()
        self.status.setText("Saved key deleted. External chat needs a new key.")

    def _clear(self):
        self.generation += 1
        self.history = []
        self.log.clear()
        self.pending = None
        self.approve.setEnabled(False)
        if self.speech:
            self.speech.stop()

    def _send(self):
        text = self.input.text().strip()
        if text:
            self.input.clear()
            self._ask(text)

    def _ask(self, text, mailbox=None, request=None):
        if self.busy:
            if request:
                mailbox.reply(request, "Companion is busy; try again shortly.")
            return
        if not self.svc.config.get("companion_enabled"):
            message = "API chat is disabled. Configure Companion settings in the launcher, or use local action buttons."
            self.log.appendPlainText(message)
            if request:
                mailbox.reply(request, message)
            return
        base = self.svc.config.get("companion_endpoint", "")
        model = self.svc.config.get("companion_model", "")
        key = self.secrets.get(base)
        if not key:
            self.status.setText("No key for this endpoint. Enter it in the password field and Save.")
            if request:
                mailbox.reply(request, "No API key configured for this endpoint; configure it in the launcher.")
            return
        self.history.append({"role": "user", "content": text[:4000]})
        self.history = self.history[-16:]
        self.log.appendPlainText("You: " + text[:4000])
        messages = list(self.history)
        context = (mailbox, request, self.svc.layout.game_dir, self.generation,
                   Mailbox(self.svc.layout.game_dir).state().get("session"))
        self.busy = True
        self.send.setEnabled(False)
        self.pending = None
        self.approve.setEnabled(False)

        def work():
            try:
                result = ChatClient().ask(base, model, key, messages)
            except Exception:
                result = {"text": "Chat failed. Check API settings, connectivity, model and quota. No action executed.", "actions": []}
            self.completed.emit((result, context))
        threading.Thread(target=work, daemon=True).start()

    def _completed(self, payload):
        result, (mailbox, request, game_dir, generation, session) = payload
        self.busy = False
        self.send.setEnabled(True)
        if generation != self.generation:
            if request:
                mailbox.reply(request, "Chat was reset; old response discarded.")
            return
        text = result["text"] or "An action was proposed; it has NOT run. Approve it in the launcher if intended."
        self.log.appendPlainText("Companion: " + text)
        self.history.append({"role": "assistant", "content": text})
        if (result["actions"] and self.svc.layout.game_dir == game_dir and session
                and Mailbox(game_dir).state().get("session") == session):
            self.pending = (result["actions"][0], game_dir, session)
            self.approve.setEnabled(True)
            self.status.setText("Proposed (NOT executed): " + self.pending[0] + ". Approve or ignore.")
            text += "\nAction NOT executed. Approve in launcher: " + self.pending[0]
        if request:
            mailbox.reply(request, text)
        if self.speak.isChecked():
            try:
                if self.speech is None:
                    from PySide6.QtTextToSpeech import QTextToSpeech
                    if not QTextToSpeech.availableEngines():
                        raise RuntimeError()
                    self.speech = QTextToSpeech(self)
                self.speech.say(result["text"])
            except Exception:
                self.speak.setChecked(False)
                self.status.setText("No working system speech engine; text chat remains available.")

    def _approve(self):
        if (self.pending and self.pending[1] == self.svc.layout.game_dir
                and Mailbox(self.pending[1]).state().get("session") == self.pending[2]):
            action = self.pending[0]
            self.pending = None
            self.approve.setEnabled(False)
            self._dispatch(action, confirm=True)

    def _dispatch(self, action, confirm=True):
        if confirm and QMessageBox.question(self, "Start private practice task?",
                "Experimental movement may fall. Use a safe test world. Start " + action + "?") != QMessageBox.Yes:
            return
        try:
            Mailbox(self.svc.layout.game_dir).send(action)
            self.status.setText("Command sent; waiting for the game's status. F8 stops locally.")
        except (CompanionError, OSError) as exc:
            self.status.setText(str(exc))

    def _poll(self):
        mailbox = Mailbox(self.svc.layout.game_dir)
        state = mailbox.state()
        if state:
            self.status.setText("Game: " + str(state.get("task", "idle"))[:220])
        request = mailbox.take_chat()
        if request:
            self._ask(request["text"], mailbox, request)

    def on_shown(self):
        pass
