"""Crash log diagnosis classification."""

from special_client.core.diagnostics import (diagnose,
                                             parse_crash_reports, tail_log)


def test_oom():
    d = diagnose("java.lang.OutOfMemoryError: Java heap space\n...")
    assert d.kind == "oom"
    assert "RAM" in d.suggestion or "memory" in d.suggestion.lower()


def test_auth():
    d = diagnose("Authentication error - invalid session")
    assert d.kind == "auth"


def test_missing_class():
    d = diagnose('Exception in thread "main" java.lang.NoClassDefFoundError: '
                 'org/lwjgl/System')
    assert d.kind == "missing_library"


def test_gpu():
    d = diagnose("LWJGL: The current platform does not support a valid "
                 "graphics card (NVIDIA driver issue)")
    assert d.kind == "gpu"


def test_crash_report():
    d = diagnose("Report saved to crash-reports/crash-2024-01-01.log\n"
                 "Minecraft has crashed!")
    assert d.kind == "crash"


def test_clean_log():
    d = diagnose("Setting user: Player\nLWJGL Version: 3.3.1\nDone (1.2s)!")
    assert d.kind == "ok"


def test_crash_reports_listing(tmp_path):
    import os
    d = tmp_path / "crash-reports"
    d.mkdir()
    old = d / "crash-2024-01-01_10.00.00-server.txt"
    new = d / "crash-2024-06-01_10.00.00-client.txt"
    old.write_text("old crash")
    new.write_text("new crash")
    # pin mtimes explicitly so ordering is deterministic
    os.utime(old, (1704067200, 1704067200))
    os.utime(new, (1717200000, 1717200000))
    reports = parse_crash_reports(d)
    assert len(reports) == 2
    # newest first
    assert "2024-06-01" in reports[0]["file"]
    assert "old crash" in reports[1]["preview"]


def test_tail_log(tmp_path):
    p = tmp_path / "log.txt"
    p.write_text("a\n" * 5000)
    t = tail_log(p, max_chars=100)
    assert len(t) <= 100
    assert t.rstrip().endswith("a")
    assert tail_log(tmp_path / "nope.txt") == ""
