"""Version parsing, ordering and support-range tests."""
from special_client.core.versions import (SUPPORTED_MIN, compare,
                                          is_supported, version_key)


def test_release_ordering():
    assert compare("1.8", "1.9") < 0
    assert compare("1.8", "1.8") == 0
    assert compare("1.9", "1.8") > 0
    assert compare("1.12.2", "1.20.1") < 0
    assert compare("1.20.1", "1.21.4") < 0
    assert compare("1.21.4", "1.21.99") < 0


def test_two_part_versions():
    # 1.8 and 1.8.0 are the same ordering-wise (1.8 is a real manifest id)
    assert compare("1.8", "1.8.9") < 0
    assert version_key("1.8").parts == (1, 8, 0, "")


def test_snapshot_ids():
    assert version_key("25w03a").kind == "snapshot"
    assert version_key("25w03b").parts > version_key("25w03a").parts
    assert compare("24w31a", "25w03a") < 0
    assert compare("25w02a", "25w03a") < 0
    # snapshots sort after the latest 1.x releases
    assert compare("1.21.4", "25w03a") < 0
    assert compare("25w03a", "1.21.4") > 0


def test_supported_range():
    assert is_supported("1.8")
    assert is_supported("1.8.9")
    assert is_supported("1.12.2")
    assert is_supported("1.20.1")
    assert is_supported("1.21.4")
    assert not is_supported("1.7.10")
    # snapshot ids are considered supported (they are 1.21+ era)
    assert compare("25w03a", SUPPORTED_MIN) >= 0


def test_java_1205_boundary():
    from special_client.core.java import required_java_major
    assert required_java_major("1.20.4") == 17
    assert required_java_major("1.20.5") == 21
    assert required_java_major("1.20.6") == 21
