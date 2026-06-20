#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
VERSION="$(node -p "require('./manifest.json').version" 2>/dev/null)"
ARCHIVE_NAME="signin-extension-v${VERSION}.zip"
ARCHIVE_PATH="$DIST_DIR/$ARCHIVE_NAME"

mkdir -p "$DIST_DIR"
rm -f "$ARCHIVE_PATH"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

PACKAGE_DIR="$tmpdir/signin-extension"
mkdir -p "$PACKAGE_DIR"

copy_path() {
  local path="$1"
  if [[ -e "$ROOT_DIR/$path" ]]; then
    mkdir -p "$PACKAGE_DIR/$(dirname "$path")"
    cp -R "$ROOT_DIR/$path" "$PACKAGE_DIR/$path"
  fi
}

copy_path "manifest.json"
copy_path "package.json"
copy_path "README.md"
copy_path "src"
copy_path "popup"
copy_path "options"

find "$PACKAGE_DIR" -name '*.bak' -delete
find "$PACKAGE_DIR" -name '.DS_Store' -delete

(
  cd "$tmpdir"
  zip -qr "$ARCHIVE_PATH" "signin-extension"
)

echo "Created $ARCHIVE_PATH"
