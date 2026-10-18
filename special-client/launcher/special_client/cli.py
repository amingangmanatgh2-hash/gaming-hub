"""Headless CLI: repair, offline checks, cape generation, dry-run launch.

Useful for scripting, CI, and troubleshooting without the GUI:

    python -m special_client.cli versions
    python -m special_client.cli offline 1.20.1
    python -m special_client.cli repair 1.20.1
    python -m special_client.cli caps
    python -m special_client.cli dryrun 1.20.1 --ram 4096
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import APP_NAME
from .core import net
from .core.java import detect_java_runtimes, pick_java
from .core.launch import check_offline_readiness
from .core.manifest import load_manifest
from .core.paths import DirLayout
from .core.auth import make_offline_session


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="special-client",
                                description=f"{APP_NAME} headless CLI")
    p.add_argument("--home", default=str(Path.home() / ".special-client"),
                   help="launcher home dir")
    p.add_argument("--game-dir", default=None)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("versions")
    sp = sub.add_parser("offline")
    sp.add_argument("version")
    sp.add_argument("--name", default="Player")
    sp = sub.add_parser("repair")
    sp.add_argument("version")
    sp = sub.add_parser("install-client-mod")
    sp.add_argument("jar", type=Path)
    sp.add_argument("--minecraft", required=True)
    sp.add_argument("--loader", required=True, choices=["fabric"])
    sub.add_parser("caps")
    sp = sub.add_parser("dryrun")
    sp.add_argument("version")
    sp.add_argument("--ram", type=int, default=4096)
    sp.add_argument("--name", default="Player")
    args = p.parse_args(argv)

    home = Path(args.home)
    home.mkdir(parents=True, exist_ok=True)
    config_path = home / "launcher-config.json"
    from .core.config import Config
    config = Config(config_path)
    game_dir = Path(args.game_dir or config.get("game_dir"))
    layout = DirLayout(game_dir)
    layout.ensure_all()
    session = net.make_session()

    if args.cmd == "install-client-mod":
        from .core.clientmod import install_client_mod
        try:
            print(install_client_mod(args.jar, game_dir, args.minecraft, args.loader))
        except (ValueError, OSError) as exc:
            print(str(exc), file=sys.stderr)
            return 2
        return 0

    if args.cmd == "versions":
        m = load_manifest(layout.client_cache, session)
        for e in m.releases()[:15]:
            print(f"{e.id}\t{e.type}\t{e.time}")
        return 0

    if args.cmd == "offline":
        runtimes = detect_java_runtimes(config.get("java_path"))
        java = pick_java(runtimes, args.version, config.get("java_path"))
        off = make_offline_session(args.name)
        rep = check_offline_readiness(layout, args.version, java, off)
        print(json.dumps({
            "launchable": rep.launchable,
            "version_installed": rep.version_installed,
            "client_jar_ok": rep.client_jar_ok,
            "libraries": f"{rep.libraries_ok}/{rep.libraries_total}",
            "assets": f"{rep.assets_ok}/{rep.assets_total}",
            "java_ok": rep.java_ok,
            "blockers": rep.blockers,
            "notes": rep.notes,
        }, indent=2))
        return 0 if rep.launchable else 1

    if args.cmd == "repair":
        from .core.launch import LaunchService
        ls = LaunchService(layout, session)
        m = load_manifest(layout.client_cache, session)
        entry = m.by_id(args.version)
        if entry is None:
            print(f"version {args.version} not in manifest", file=sys.stderr)
            return 2
        v = ls.fetch_version_json(entry)
        report = ls.repair(v, progress=lambda s, f, d:
                           print(f"  {s}: {d}"))
        print(json.dumps({
            "files_checked": report.files_checked,
            "files_downloaded": report.files_downloaded,
            "files_repaired": report.files_repaired,
            "errors": report.errors,
        }, indent=2))
        return 0 if report.ok else 1

    if args.cmd == "caps":
        from .core.capes import texture
        out = layout.client_capes
        out.mkdir(parents=True, exist_ok=True)
        for pid in texture.PALETTES:
            img = texture.generate_cape(pid)
            img.save(out / f"special-{pid}.png")
            print(f"wrote {out / f'special-{pid}.png'}")
        return 0

    if args.cmd == "dryrun":
        from .core.mcversion import LaunchSpec
        from .core.launch import LaunchService
        ls = LaunchService(layout, session)
        m = load_manifest(layout.client_cache, session)
        entry = m.by_id(args.version)
        if entry is None:
            print(f"version {args.version} not in manifest", file=sys.stderr)
            return 2
        v = ls.fetch_version_json(entry)
        jar = layout.instance_version_jar(entry.id)
        if not jar.exists():
            print(f"client jar for {entry.id} is not installed — run "
                  f"'install' (Launch in the UI) first.", file=sys.stderr)
            return 3
        runtimes = detect_java_runtimes(config.get("java_path"))
        java = pick_java(runtimes, entry.id, config.get("java_path"))
        off = make_offline_session(args.name)
        spec = LaunchSpec(
            game_dir=layout.game_dir,
            java_path=java.path if java else "java",
            version=v,
            assets_root=layout.assets,
            libraries_dir=layout.libraries,
            natives_dir=layout.instance_natives(entry.id),
            primary_jar=jar,
            auth=off.to_launch_vars(),
            ram_mb=args.ram,
        )
        cmd = spec.java_command()
        print("# java command (dry run, not executed):")
        for c in cmd:
            print("  " + c)
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
