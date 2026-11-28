#!/usr/bin/env bash
# Renders vehicle models to PNG without a GPU:  tools/model-preview/run.sh <outdir> sports supercar ...
# Needs: KOTLIN_LIB (dir with kotlin-compiler.jar + kotlin-stdlib.jar), ANDROID_JAR, JAVA.
set -e -o pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../../app/src/main/java/com/amin/racing3d/render"
cls="${TMPDIR:-/tmp}/model-preview-classes"
rm -rf "$cls"; mkdir -p "$cls"
L="$KOTLIN_LIB"
"$JAVA" -Xmx2g -cp "$L/kotlin-compiler.jar:$L/kotlin-stdlib.jar:$L/trove4j.jar:$L/kotlin-reflect.jar:$L/kotlin-script-runtime.jar:$L/annotations-13.0.jar" \
  org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-jdk -nowarn -jvm-target 1.8 -cp "$ANDROID_JAR:$L/kotlin-stdlib.jar" -d "$cls" \
  "$src/Models.kt" "$src/MeshBuilder.kt" "$src/GlCore.kt" "$here/Preview.kt" 2>&1 | grep -v '^WARNING' || true
out="$1"; shift
"$JAVA" -cp "$cls:$L/kotlin-stdlib.jar" PreviewKt "$out" "$@"
