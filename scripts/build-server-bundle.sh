#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Build the standalone server bundle that `npx @openexpert/openexpert serve` and
# `openexpert desktop` download when there is no source checkout, and write it
# (plus its checksum) to the repository root.
#
# Single source of truth for the packaging steps: both `release.yml` (automatic,
# after a publish) and `server-release.yml` (manual backfill) call this script,
# so the artefact cannot drift between them.
#
# Usage: scripts/build-server-bundle.sh [version]
#   version defaults to packages/openexpert/package.json's version.
#
# Requires the web build to exist (npm run build).
set -euo pipefail

cd "$(dirname -- "${BASH_SOURCE[0]}")/.."

VERSION="${1:-$(node -p "require('./packages/openexpert/package.json').version")}"
TARBALL="openexpert-server-${VERSION}.tar.gz"

if [ ! -f .output/server/index.mjs ]; then
  echo "no .output build found: run 'npm run build' first" >&2
  exit 1
fi

# Runtime dependencies only: the bundle runs with `node .output/server/index.mjs`.
npm prune --omit=dev --ignore-scripts

rm -rf pkg
mkdir -p pkg
cp -r .output pkg/.output
cp package.json pkg/package.json
cp -r node_modules pkg/node_modules

tar -czf "$TARBALL" -C pkg .
sha256sum "$TARBALL" > "${TARBALL}.sha256"
rm -rf pkg

echo "✓ ${TARBALL} ($(du -h "$TARBALL" | cut -f1))"
