#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_JSON="${ROOT_DIR}/apps/web/package.json"

APP_VERSION="$(
  node -e "const pkg = require(process.argv[1]); console.log(pkg.version || '0.0.0')" "${PACKAGE_JSON}"
)"
GIT_SHA="$(git -C "${ROOT_DIR}" rev-parse --short HEAD)"
BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

export APP_VERSION
export GIT_SHA
export BUILD_TIME

printf 'export APP_VERSION=%q\n' "${APP_VERSION}"
printf 'export GIT_SHA=%q\n' "${GIT_SHA}"
printf 'export BUILD_TIME=%q\n' "${BUILD_TIME}"
