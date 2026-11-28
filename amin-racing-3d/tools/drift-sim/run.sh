#!/usr/bin/env bash
# Compiles game/DriftScorer.kt with the simulation and runs it. Needs kotlinc + java on PATH
# (or KOTLINC / JAVA env vars). Exit code 0 = all checks passed.
set -e
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../../app/src/main/java/com/amin/racing3d/game/DriftScorer.kt"
out="${TMPDIR:-/tmp}/drift-sim"
mkdir -p "$out"
${KOTLINC:-kotlinc} "$src" "$here/DriftSim.kt" -d "$out" 2>&1 | grep -v '^warning' || true
${JAVA:-java} -cp "$out:${KOTLIN_STDLIB:-$(dirname "$(command -v ${KOTLINC:-kotlinc})")/../lib/kotlin-stdlib.jar}" DriftSimKt
