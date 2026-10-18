# Compatibility / validation boundaries

| Minecraft | Typical runtime | Launcher metadata paths | SPECIAL Fabric mod |
|---|---|---|---|
| 1.8.9–1.16.5 | Java 8 | Vanilla; available loaders depend on upstream | No |
| 1.17 | Java 16 (17 may work with compatible mods) | Java picker currently uses 17 | No |
| 1.18–1.20.4 | Java 17 | Vanilla / loader sources | **1.20.1 + Fabric only** |
| 1.20.5–1.20.6 | **Java 21** | Java picker uses 21 | No |
| 1.21+ | Java 21; consult release metadata for newer releases | Metadata-dependent, not live validated | No |

The launcher uses Java 17 as a practical 1.17 fallback (the original release
requires Java 16). Loader/mod requirements can be stricter than vanilla. Prefer
official release metadata and loader documentation. No version/loader combination
was end-to-end launched in this environment.

Fabric / Quilt / Forge / NeoForge installer integrations in Python do not imply
that mods are interchangeable. Never mix loader-specific jars. NeoForge's versions
use its own numbering, not Minecraft's full ID. The custom Fabric module cannot
run on Forge/NeoForge or older combat versions like 1.8.9.

Suggested **maximum game allocations**, not minimum hardware or FPS promises:
4GB system RAM → 2GB; 8GB → 4GB; 16GB → 6GB; 32GB+ → 8GB. Leave memory for Windows
and the launcher. Integrated GPUs share system RAM. On 4GB systems and HDDs use
low render/simulation distance, no shaders, restrained resource packs and a small
compatible mod set. Disable unused overlays; benchmark before/after changes.
