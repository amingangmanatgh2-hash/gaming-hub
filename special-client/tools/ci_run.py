"""Run a CI command; expose failure detail as a GitHub check annotation.

Retains the original exit status. Useful where the external log storage is not
reachable but GitHub's checks API is. Never use this for secret-bearing commands.
"""
import subprocess
import sys

result = subprocess.run(sys.argv[1:], stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT, text=True, errors="replace")
print(result.stdout)
if result.returncode:
    detail = result.stdout[-16000:].replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::error title=Command failed::{detail}")
raise SystemExit(result.returncode)
