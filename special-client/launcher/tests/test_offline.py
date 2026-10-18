"""Offline launch validation: honest readiness reporting."""

from special_client.core.java import JavaRuntime
from special_client.core.launch import check_offline_readiness
from special_client.core.paths import DirLayout
from special_client.core.mcversion import save_version_json
from special_client.core.auth import make_offline_session


FAKE_JAVA = JavaRuntime(path="/usr/bin/java", major=17,
                        version_string="17.0.10", source="test")


def _install_full(layout: DirLayout, version_raw: dict) -> None:
    """Create a fully-installed version on disk (files without real hashes)."""
    vid = version_raw["id"]
    save_version_json(version_raw, layout.instance_version_json(vid))
    layout.instance_version_jar(vid).parent.mkdir(parents=True, exist_ok=True)
    layout.instance_version_jar(vid).write_bytes(b"jar")
    for lib in version_raw.get("libraries", []):
        name = lib["name"]
        g, a, v = name.split(":")
        dest = layout.libraries / g.replace(".", "/") / a / v / \
            f"{a}-{v}.jar"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"lib")
        if lib.get("natives"):
            for os_name, clf in lib["natives"].items():
                cdest = layout.libraries / g.replace(".", "/") / a / v / \
                    f"{a}-{v}-{clf}.jar"
                cdest.write_bytes(b"native")
    # asset index + objects
    import json as _json
    idx = version_raw["assetIndex"]
    layout.asset_indexes.mkdir(parents=True, exist_ok=True)
    objects = {"a.png": {"hash": "abcd1234", "size": 4},
               "b.png": {"hash": "ef567890", "size": 4}}
    (layout.asset_indexes / f"{idx['id']}.json").write_text(
        _json.dumps({"objects": objects}))
    for meta in objects.values():
        h = meta["hash"]
        p = layout.asset_objects / h[:2] / h
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"xxxx"[:meta["size"]])


def test_fully_installed_is_launchable_offline(tmp_path, version_1_20_1):
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    _install_full(layout, version_1_20_1)
    rep = check_offline_readiness(layout, "1.20.1", FAKE_JAVA,
                                  make_offline_session("Tester"))
    assert rep.version_installed
    assert rep.client_jar_ok
    assert rep.libraries_ok == rep.libraries_total
    assert rep.assets_ok == 2
    assert rep.java_ok
    assert rep.launchable is True
    assert rep.blockers == []


def test_uninstalled_version_never_claimed_available(tmp_path):
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    rep = check_offline_readiness(layout, "1.20.1", FAKE_JAVA, None)
    assert rep.launchable is False
    assert any("not installed" in b for b in rep.blockers)


def test_missing_library_reported(tmp_path, version_1_20_1):
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    _install_full(layout, version_1_20_1)
    # remove one library
    victim = next(layout.libraries.rglob("*.jar"))
    victim.unlink()
    rep = check_offline_readiness(layout, "1.20.1", FAKE_JAVA,
                                  make_offline_session("Tester"))
    assert rep.launchable is False
    assert rep.libraries_ok == rep.libraries_total - 1
    assert any("library" in b.lower() for b in rep.blockers)


def test_missing_assets_reported(tmp_path, version_1_20_1):
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    _install_full(layout, version_1_20_1)
    # object files are stored as objects/<first-2>/<full-hash>
    (layout.asset_objects / "ab" / "abcd1234").unlink()
    rep = check_offline_readiness(layout, "1.20.1", FAKE_JAVA,
                                  make_offline_session("Tester"))
    assert rep.launchable is False
    assert any("asset" in b.lower() for b in rep.blockers)


def test_no_java_blocks(tmp_path, version_1_20_1):
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    _install_full(layout, version_1_20_1)
    rep = check_offline_readiness(layout, "1.20.1", None,
                                  make_offline_session("Tester"))
    assert rep.launchable is False
    assert any("Java" in b for b in rep.blockers)


def test_no_account_blocks(tmp_path, version_1_20_1):
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    _install_full(layout, version_1_20_1)
    rep = check_offline_readiness(layout, "1.20.1", FAKE_JAVA, None)
    assert rep.launchable is False
    assert any("account" in b.lower() for b in rep.blockers)


def test_ms_session_without_token_blocks_offline(tmp_path, version_1_20_1):
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    _install_full(layout, version_1_20_1)
    from special_client.core.auth import AuthSession
    ms = AuthSession(kind="microsoft", player_name="M",
                     uuid="u", access_token="")   # stale, no refresh offline
    rep = check_offline_readiness(layout, "1.20.1", FAKE_JAVA, ms)
    assert rep.launchable is False
    assert any("token" in b.lower() for b in rep.blockers)


def test_offline_session_note_present(tmp_path, version_1_20_1):
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    _install_full(layout, version_1_20_1)
    rep = check_offline_readiness(layout, "1.20.1", FAKE_JAVA,
                                  make_offline_session("Tester"))
    assert any("Offline" in n or "offline" in n for n in rep.notes)
