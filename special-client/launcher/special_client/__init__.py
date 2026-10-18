"""SPECIAL CLIENT — premium Minecraft Java Edition launcher and client.

Package layout
==============
- ``special_client.core``    : Qt-free engine (launch, mods, auth, updater, ...)
- ``special_client.ui``      : PySide6 user interface (depends on core only)
- ``special_client.cli``     : headless command line (repair, offline checks, tests)
"""

from pathlib import Path

__version__ = "1.1.0"
APP_NAME = "SPECIAL CLIENT"
APP_ID = "special-client"
BRAND = "SpecialClient"


def asset_path(name: str) -> Path:
    """Resolve a bundled asset (logo, icons, cape artwork).

    Works in both source checkouts and PyInstaller bundles: frozen apps
    use the package-relative ``__file__`` provided by PyInstaller; data
    is collected under ``special_client/assets/`` in both cases.
    """
    base = Path(__file__).resolve().parent
    return base / "assets" / name

# Public client identifier used for the Microsoft device-code flow.
# This is a well-known *public* client id used by open-source launchers for the
# "consumers" audience endpoint (documented, unprivileged). It never grants
# access to Microsoft account data beyond the Minecraft services.
MSA_CLIENT_ID = "00000000402b5328"

LAUNCHER_NAME = "SPECIAL CLIENT"
LAUNCHER_VERSION = __version__
