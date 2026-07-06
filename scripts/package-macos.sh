#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="CourtBoard"
MAIN_JAR="CourtBoard-1.0-SNAPSHOT.jar"
MAIN_CLASS="org.example.Main"
PACKAGE_DIR="$ROOT_DIR/target/package"
INPUT_DIR="$ROOT_DIR/target/jpackage-input"
ICON_DIR="$ROOT_DIR/target/package-icons/macos"
ICON_FILE="$ROOT_DIR/packaging/icon/CourtBoard.icns"
ICON_GENERATOR_DIR="$ROOT_DIR/target/icon-generator"
PACKAGE_TYPE="${1:-app-image}"

cd "$ROOT_DIR"
mvn package

rm -rf "$PACKAGE_DIR" "$INPUT_DIR" "$ICON_DIR" "$ICON_GENERATOR_DIR"
mkdir -p "$PACKAGE_DIR" "$INPUT_DIR" "$ICON_DIR" "$ICON_GENERATOR_DIR" "$(dirname "$ICON_FILE")"
cp "$ROOT_DIR/target/$MAIN_JAR" "$INPUT_DIR/$MAIN_JAR"

javac -d "$ICON_GENERATOR_DIR" "$ROOT_DIR/packaging/tools/IconGenerator.java"
java -Djava.awt.headless=true -cp "$ICON_GENERATOR_DIR" IconGenerator "$ICON_FILE" --icns

run_jpackage() {
  jpackage \
    --type "$PACKAGE_TYPE" \
    --name "$APP_NAME" \
    --app-version "1.0.0" \
    --input "$INPUT_DIR" \
    --main-jar "$MAIN_JAR" \
    --main-class "$MAIN_CLASS" \
    --dest "$PACKAGE_DIR" \
    --icon "$ICON_FILE" \
    --mac-package-name "$APP_NAME"
}

if [[ "$PACKAGE_TYPE" == "app-image" ]]; then
  run_jpackage &
  JPACKAGE_PID=$!
  for _ in $(seq 1 90); do
    if ! kill -0 "$JPACKAGE_PID" 2>/dev/null; then
      wait "$JPACKAGE_PID"
      break
    fi
    sleep 1
  done
  if kill -0 "$JPACKAGE_PID" 2>/dev/null; then
    if [[ -d "$PACKAGE_DIR/$APP_NAME.app/Contents/runtime" ]]; then
      kill "$JPACKAGE_PID" 2>/dev/null || true
      wait "$JPACKAGE_PID" 2>/dev/null || true
    else
      kill "$JPACKAGE_PID" 2>/dev/null || true
      wait "$JPACKAGE_PID" 2>/dev/null || true
      echo "jpackage hat nicht innerhalb von 90 Sekunden beendet und kein vollständiges App-Image erzeugt." >&2
      exit 1
    fi
  fi
else
  run_jpackage
fi

if [[ "$PACKAGE_TYPE" == "app-image" && ! -d "$PACKAGE_DIR/$APP_NAME.app/Contents/runtime" ]]; then
  echo "App-Image wurde nicht vollständig erzeugt: $PACKAGE_DIR/$APP_NAME.app" >&2
  exit 1
fi

echo "macOS-Paket ($PACKAGE_TYPE) erzeugt in: $PACKAGE_DIR"
