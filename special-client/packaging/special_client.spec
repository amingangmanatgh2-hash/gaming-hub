# Run from special-client/: pyinstaller packaging/special_client.spec --noconfirm
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files

root = Path(SPECPATH).parent
assets = collect_data_files('special_client')
common = dict(pathex=[str(root / 'launcher')], datas=assets,
              hiddenimports=["special_client.ui." + page for page in ("play_page", "mods_page", "perf_page", "capes_page", "profiles_page", "settings_page", "logs_page", "companion_page", "servers_page")], hookspath=[], runtime_hooks=[],
              excludes=['tkinter', 'pytest', 'PySide6.QtWebEngineCore', 'PySide6.QtWebEngineWidgets'])
gui = Analysis([str(root / 'packaging/gui_entry.py')], **common)
cli = Analysis([str(root / 'packaging/cli_entry.py')], **common)
gui_exe = EXE(PYZ(gui.pure), gui.scripts, [], exclude_binaries=True,
              name='SPECIAL_CLIENT', console=False,
              icon=str(root / 'launcher/special_client/assets/icon.ico'))
cli_exe = EXE(PYZ(cli.pure), cli.scripts, [], exclude_binaries=True,
              name='SPECIAL_CLIENT_CLI', console=True,
              icon=str(root / 'launcher/special_client/assets/icon.ico'))
coll = COLLECT(gui_exe, cli_exe, gui.binaries, gui.datas, cli.binaries, cli.datas,
               strip=False, upx=False, name='SPECIAL_CLIENT')
