"""End-to-end install + repair against the local HTTP fixture server.

Exercises the real code paths: version json fetch, client jar download with
sha1, library download with sha1, native extraction, asset index + object
downloads, and repair of corrupted files.
"""
import json


from special_client.core.download import DownloadManager
from special_client.core.launch import LaunchError, LaunchService
from special_client.core.paths import DirLayout


class _Entry:
    def __init__(self, id, url):
        self.id = id
        self.url = url
        self.type = "release"
        self.time = ""
        self.sha1 = ""


def _service(tmp_path, version_raw, http_server):
    import requests as r
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    dm = DownloadManager(r.Session(), allow_http=True)
    svc = LaunchService(layout, r.Session(), dm,
                        objects_url=http_server["base"] + "/objects")
    return svc, layout


def test_full_install(tmp_path, version_1_20_1, http_server):
    entry = _Entry("1.20.1", http_server["base"] + "/versions/1.20.1.json")
    # serve the version json itself
    http_server["files"]["/versions/1.20.1.json"] = \
        json.dumps(version_1_20_1).encode()

    svc, layout = _service(tmp_path, version_1_20_1, http_server)
    steps = []
    version = svc.install_version(
        entry, progress=lambda s, f, d: steps.append(s))
    assert version.id == "1.20.1"

    # client jar downloaded & verified
    jar = layout.instance_version_jar("1.20.1")
    assert jar.exists()
    assert jar.read_bytes() == http_server["files"]["/versions/1.20.1.jar"]

    # platform-filtered libraries: the helper matching THIS OS is installed,
    # the other one must not be (the rules in the fixture pair allow/disallow)
    from special_client.core.mcversion import LaunchEnv
    os_name = LaunchEnv.detect().os_name
    win = os_name == "windows"
    libs = layout.libraries
    assert (libs / "org/testfw/core-lib/1.0.0/core-lib-1.0.0.jar").exists()
    assert (libs / "org/testfw/windows-helper/2.0.0/windows-helper-2.0.0.jar"
            ).exists() is win
    assert (libs / "org/testfw/linux-helper/2.0.0/linux-helper-2.0.0.jar"
            ).exists() is not win
    assert (libs / "org/testfw/common/3.0.0/common-3.0.0.jar").exists()

    # natives extracted (platform-specific file)
    natives = layout.instance_natives("1.20.1")
    native_name = "lwjgl.dll" if os_name == "windows" else "liblwjgl.so"
    assert (natives / native_name).exists()
    assert not (natives / "MANIFEST.MF").exists()

    # assets: index + both objects
    assert (layout.asset_indexes / "test-10.json").exists()
    assert (layout.asset_objects / "aa" / "aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00"
            ).exists()
    assert (layout.asset_objects / "00" / "00112233445566778899aabbccddeeff00112233"
            ).exists()
    assert "client jar" in steps and "libraries" in steps and "assets" in steps

    # second install is a no-op (files already valid)
    before = _count_bytes(layout)
    svc.install_version(entry)
    assert _count_bytes(layout) == before


def test_install_verifies_sha1_and_rejects_corruption(
        tmp_path, version_1_20_1, http_server):
    entry = _Entry("1.20.1", http_server["base"] + "/versions/1.20.1.json")
    http_server["files"]["/versions/1.20.1.json"] = \
        json.dumps(version_1_20_1).encode()
    # corrupt the served client jar → sha1 mismatch must fail the install
    original = http_server["files"]["/versions/1.20.1.jar"]
    http_server["files"]["/versions/1.20.1.jar"] = b"CORRUPTED-JAR-CONTENT!"
    svc, layout = _service(tmp_path, version_1_20_1, http_server)
    try:
        import pytest
        with pytest.raises(Exception) as ei:
            svc.install_version(entry)
        assert "SHA-1 mismatch" in str(ei.value)
    finally:
        http_server["files"]["/versions/1.20.1.jar"] = original


def test_repair_redownloads_corrupted_file(tmp_path, version_1_20_1,
                                           http_server):
    entry = _Entry("1.20.1", http_server["base"] + "/versions/1.20.1.json")
    http_server["files"]["/versions/1.20.1.json"] = \
        json.dumps(version_1_20_1).encode()
    svc, layout = _service(tmp_path, version_1_20_1, http_server)
    svc.install_version(entry)

    # corrupt one library + one asset
    lib = layout.libraries / "org/testfw/common/3.0.0/common-3.0.0.jar"
    lib.write_bytes(b"corrupted")
    asset = layout.asset_objects / "aa" / \
        "aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00"
    asset.write_bytes(b"!!")

    report = svc.repair(svc.fetch_version_json(entry))
    assert report.files_checked > 0
    assert report.files_downloaded >= 2
    assert lib.read_bytes() == http_server["files"]["/libs/common-3.0.0.jar"]
    assert asset.read_bytes() == http_server["files"][
        "/objects/aa/aa11bb22cc33dd44ee55ff66aa77bb88cc99dd00"]

    # repair is idempotent: nothing to do now
    report2 = svc.repair(svc.fetch_version_json(entry))
    assert report2.files_downloaded == 0


def test_repair_never_touches_user_data(tmp_path, version_1_20_1,
                                        http_server):
    entry = _Entry("1.20.1", http_server["base"] + "/versions/1.20.1.json")
    http_server["files"]["/versions/1.20.1.json"] = \
        json.dumps(version_1_20_1).encode()
    svc, layout = _service(tmp_path, version_1_20_1, http_server)
    svc.install_version(entry)

    world = layout.saves / "My World"
    world.mkdir(parents=True)
    (world / "level.dat").write_bytes(b"world data")
    (layout.resource_packs / "pack.zip").write_bytes(b"pack")

    lib = layout.libraries / "org/testfw/common/3.0.0/common-3.0.0.jar"
    lib.write_bytes(b"corrupted")
    svc.repair(svc.fetch_version_json(entry))

    assert (world / "level.dat").read_bytes() == b"world data"
    assert (layout.resource_packs / "pack.zip").read_bytes() == b"pack"


def test_missing_client_download_info_fails(tmp_path, http_server):
    bad = {"id": "x", "type": "release", "mainClass": "M",
           "libraries": [], "assetIndex": {"id": "i"}, "downloads": {}}
    import requests as r
    layout = DirLayout(tmp_path)
    layout.ensure_all()
    dm = DownloadManager(r.Session(), allow_http=True)
    svc = LaunchService(layout, r.Session(), dm)
    from special_client.core.mcversion import save_version_json
    save_version_json(bad, layout.instance_version_json("x"))
    try:
        svc.install_version(_Entry("x", ""))
        assert False, "expected LaunchError"
    except LaunchError:
        pass


def _count_bytes(layout) -> int:
    total = 0
    for d in (layout.versions, layout.libraries, layout.assets):
        for f in d.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
    return total
