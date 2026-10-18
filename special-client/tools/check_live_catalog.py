"""CI integration check: real public metadata only, no game launch/account downloads."""
from pathlib import Path
import tempfile
from special_client.core.manifest import load_manifest
from special_client.core import net

with tempfile.TemporaryDirectory(prefix="special-catalogue-") as directory:
    catalogue = load_manifest(Path(directory), net.make_session(), timeout=15)
    assert catalogue.source == "github", "GitHub release catalogue must be reachable"
    assert catalogue.by_id("1.8.9"), "Legacy entry missing"
    latest = catalogue.by_id(catalogue.latest_release)
    assert latest is not None
    raw = net.get_json(net.make_session(), latest.url, timeout=15)
    major = raw.get("javaVersion", {}).get("majorVersion", "unknown")
    print(f"::notice title=Live catalogue::{len(catalogue.entries)} actual entries; latest official release: {latest.id}; metadata Java: {major}")
