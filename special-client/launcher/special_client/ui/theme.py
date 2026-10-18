"""SPECIAL CLIENT visual identity: dark gaming UI with neon accents.

Four built-in themes (all dark, all neon-accented) plus full QSS generation.
Colours are centralised so the whole app reskins from one place.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Theme:
    id: str
    name: str
    bg: str            # window background
    bg_elevated: str   # cards / side panel
    bg_input: str      # inputs
    border: str
    text: str
    text_dim: str
    accent: str        # primary neon
    accent_soft: str   # accent at low alpha (hex8)
    accent2: str       # secondary neon (purple)
    danger: str
    ok: str
    warn: str

    def qss(self) -> str:
        return qss(self)


THEMES: dict[str, Theme] = {
    "midnight-neon": Theme(
        id="midnight-neon", name="Midnight Neon",
        bg="#0b0d14", bg_elevated="#12151f", bg_input="#181c29",
        border="#232a3d",
        text="#e8ecf8", text_dim="#8b93ad",
        accent="#00e5ff", accent_soft="2200e5ff", accent2="#7c3aff",
        danger="#ff4d6d", ok="#3ddc84", warn="#ffb020",
    ),
    "void-purple": Theme(
        id="void-purple", name="Void Purple",
        bg="#0d0a14", bg_elevated="#151022", bg_input="#1c1530",
        border="#2c2148",
        text="#efe9ff", text_dim="#9d90c4",
        accent="#a855f7", accent_soft="33a855f7", accent2="#00e5ff",
        danger="#ff4d6d", ok="#3ddc84", warn="#ffb020",
    ),
    "carbon-cyan": Theme(
        id="carbon-cyan", name="Carbon Cyan",
        bg="#0a0f10", bg_elevated="#10181a", bg_input="#162225",
        border="#22343a",
        text="#e6f4f4", text_dim="#7fa3a8",
        accent="#2ee6c8", accent_soft="2a2ee6c8", accent2="#4d7cff",
        danger="#ff4d6d", ok="#3ddc84", warn="#ffb020",
    ),
    "ember-dark": Theme(
        id="ember-dark", name="Ember Dark",
        bg="#100b0a", bg_elevated="#1a1210", bg_input="#241815",
        border="#3a2620",
        text="#f8ece8", text_dim="#b3918a",
        accent="#ff7840", accent_soft="2aff7840", accent2="#ffd166",
        danger="#ff4d6d", ok="#3ddc84", warn="#ffb020",
    ),
}

DEFAULT_THEME = "midnight-neon"


def qss(t: Theme) -> str:
    """Full stylesheet for the application."""
    return f"""
* {{ outline: none; }}
QWidget {{
    color: {t.text};
    background: transparent;
    font-family: "Segoe UI", "Inter", "Roboto", "DejaVu Sans", sans-serif;
    font-size: 13px;
}}
QMainWindow, #RootWidget {{ background: {t.bg}; }}
#SidePanel {{ background: {t.bg_elevated}; border-right: 1px solid {t.border}; }}
#TopBar {{ background: {t.bg_elevated}; border-bottom: 1px solid {t.border}; }}
#PageTitle {{ font-size: 22px; font-weight: 700; }}
#SectionTitle {{ font-size: 13px; font-weight: 700; color: {t.text_dim};
                  letter-spacing: 1.2px; }}
#Card {{ background: {t.bg_elevated}; border: 1px solid {t.border};
         border-radius: 10px; }}
#AccentCard {{ background: qlineargradient(x1:0,y1:0,x2:1,y2:1,
              stop:0 {t.accent_soft}, stop:1 {t.bg_elevated});
         border: 1px solid {t.accent_soft}; border-radius: 10px; }}

QPushButton {{
    background: {t.bg_input}; border: 1px solid {t.border};
    border-radius: 8px; padding: 8px 16px; font-weight: 600;
}}
QPushButton:hover {{ border-color: {t.accent}; }}
QPushButton:pressed {{ background: {t.border}; }}
QPushButton:disabled {{ color: {t.text_dim}; border-color: {t.border}; }}

QPushButton#PrimaryButton {{
    background: qlineargradient(x1:0,y1:0,x2:0,y2:1,
        stop:0 {t.accent}, stop:1 {t.accent2});
    border: none; color: #06080d; font-weight: 800; font-size: 14px;
    border-radius: 10px; padding: 12px 28px;
}}
QPushButton#PrimaryButton:hover {{ opacity: 0.92; }}
QPushButton#PrimaryButton:disabled {{
    background: {t.bg_input}; color: {t.text_dim};
}}
QPushButton#DangerButton {{ background: {t.bg_input}; border: 1px solid {t.danger};
    color: {t.danger}; }}
QPushButton#GhostButton {{ background: transparent; border: 1px solid {t.border};
    color: {t.text_dim}; }}
QPushButton#GhostButton:hover {{ color: {t.text}; border-color: {t.accent}; }}

QComboBox, QSpinBox, QLineEdit, QSlider, QDoubleSpinBox {{
    background: {t.bg_input}; border: 1px solid {t.border};
    border-radius: 7px; padding: 6px 10px; selection-background-color: {t.accent};
}}
QComboBox:focus, QLineEdit:focus {{ border-color: {t.accent}; }}
QComboBox::drop-down {{ border: none; width: 22px; }}
QComboBox QAbstractItemView {{
    background: {t.bg_elevated}; border: 1px solid {t.border};
    selection-background-color: {t.accent_soft};
}}
QLineEdit {{ padding: 7px 10px; }}

QSlider::groove:horizontal {{ height: 5px; background: {t.border}; border-radius: 2px; }}
QSlider::sub-page:horizontal {{ background: {t.accent}; border-radius: 2px; }}
QSlider::handle:horizontal {{
    width: 16px; height: 16px; margin: -6px 0; border-radius: 8px;
    background: {t.text}; border: 2px solid {t.accent};
}}

QProgressBar {{
    background: {t.bg_input}; border: 1px solid {t.border};
    border-radius: 6px; text-align: center; color: {t.text};
    font-size: 11px; height: 18px;
}}
QProgressBar::chunk {{
    background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
        stop:0 {t.accent2}, stop:1 {t.accent});
    border-radius: 5px;
}}

QPlainTextEdit, QTextEdit, QListView, QTreeView, QTableWidget {{
    background: {t.bg_input}; border: 1px solid {t.border}; border-radius: 8px;
    selection-background-color: {t.accent_soft};
}}
QTableWidget {{ gridline-color: {t.border}; border-radius: 8px; }}
QHeaderView::section {{
    background: {t.bg_elevated}; color: {t.text_dim}; padding: 6px;
    border: none; border-bottom: 1px solid {t.border}; font-weight: 700;
}}
QScrollBar:vertical {{ background: transparent; width: 10px; }}
QScrollBar::handle:vertical {{ background: {t.border}; border-radius: 5px;
    min-height: 30px; }}
QScrollBar::handle:vertical:hover {{ background: {t.accent_soft}; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; width: 0; }}
QScrollBar:horizontal {{ background: transparent; height: 10px; }}
QScrollBar::handle:horizontal {{ background: {t.border}; border-radius: 5px;
    min-width: 30px; }}

QTabWidget::pane {{ border: 1px solid {t.border}; border-radius: 8px;
    background: {t.bg_elevated}; }}
QTabBar::tab {{
    background: transparent; padding: 8px 18px; color: {t.text_dim};
    border-bottom: 2px solid transparent; font-weight: 600;
}}
QTabBar::tab:selected {{ color: {t.accent}; border-bottom: 2px solid {t.accent}; }}
QCheckBox::indicator, QRadioButton::indicator {{
    width: 16px; height: 16px; border-radius: 4px;
    border: 1px solid {t.border}; background: {t.bg_input};
}}
QCheckBox::indicator:checked, QRadioButton::indicator:checked {{
    background: {t.accent}; border-color: {t.accent};
}}
QToolTip {{ background: {t.bg_elevated}; color: {t.text};
    border: 1px solid {t.accent}; padding: 6px; }}
QMenu {{ background: {t.bg_elevated}; border: 1px solid {t.border}; }}
QMenu::item:selected {{ background: {t.accent_soft}; }}
QLabel#StatusLabel {{ color: {t.text_dim}; font-size: 11px; }}
QLabel#BigNumber {{ font-size: 26px; font-weight: 800; color: {t.accent}; }}
QLabel#DimText {{ color: {t.text_dim}; }}
QSplitter::handle {{ background: {t.border}; }}
"""


def get_theme(theme_id: str) -> Theme:
    return THEMES.get(theme_id, THEMES[DEFAULT_THEME])
