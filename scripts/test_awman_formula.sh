#!/usr/bin/env bash
set -euo pipefail

name=prettysmartdev/tap/awman
brew style -v "$name"
brew audit --strict --online --except=version "$name"
brew install -v "$name"
brew test -v "$name"

if [ "$RUNNER_OS" = macOS ]; then
  asset=awman-macos-arm64
elif [ "$(uname -m)" = aarch64 ]; then
  asset=awman-linux-arm64
else
  asset=awman-linux-amd64
fi
expected=$(ASSET="$asset" node --input-type=module -e '
  import { readFileSync } from "node:fs";
  import { formulaDigest } from "./scripts/update_awman.mjs";
  console.log(formulaDigest(readFileSync("Formula/awman.rb", "utf8"), process.env.ASSET));
')
binary="$(brew --prefix "$name")/bin/awman"
actual=$(shasum -a 256 "$binary" | awk '{ print $1 }')
test "$actual" = "$expected"

if [ "$RUNNER_OS" = macOS ]; then
  if xattr -p com.apple.quarantine "$binary" >/dev/null 2>&1; then
    echo 'Homebrew installed a quarantined awman binary' >&2
    exit 1
  fi
fi
