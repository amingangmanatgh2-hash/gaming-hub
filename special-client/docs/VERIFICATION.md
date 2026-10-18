# Verification record

Local development checks (Linux sandbox, 2026-10-17):

- Python 3.11: **131 tests passed** using `python -m pytest tests -o addopts='' -q`
  from `launcher/`. Includes six local client-mod install tests and a Java-band
  regression for Minecraft 1.20.5/1.20.6.
- `python -m pyflakes special_client tests`: clean.
- `python -m compileall -q special_client tests`: successful.
- `python tools/make_assets.py`: successful.
- Headless `--help`: successful; empty-install offline check reports missing version
  and exits 1 as expected, without Qt or a network download.

Not verified here:

- Java compilation or JUnit (no Java runtime/toolchain installed; Fabric Maven
  access is not available within sandbox host restrictions).
- Game launch, online Microsoft authentication and real loader/download endpoints.
- Qt GUI runtime (system graphics libraries unavailable).
- Windows executable/installer, code signing, upgrade and uninstall smoke tests.
- GitHub Actions execution. Workflow files are build instructions, not evidence of
  a successful remote run. No compiled artifact or download URL is claimed.

Before release, require green Windows + Fabric jobs, then manually test clean
installation, device login, download, launch, local offline launch, mod loading,
menu controls, projectile estimates, warnings, upgrade and uninstall data retention.
