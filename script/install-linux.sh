#!/usr/bin/env bash
#
# install-linux.sh
#
# Builds and installs Desktop Claw (Electron app) system-wide on Linux.
#
#   Step 1 — Build production app (yarn build:prod) if not already built
#   Step 2 — Package app (yarn package) to generate .tar.gz and .AppImage in dist/
#   Step 3 — Run the official installer from the generated tarball
#
# The sudo password is requested with a custom prompt (`sudo -p`).
# Distro-agnostic: works on any Linux with bash, tar, sudo and coreutils.
#
# Usage:
#   ./script/install-linux.sh
#
# Requirements:
#   - bash, tar, sudo, install, mktemp, ln (present on any standard Linux)
#   - sudo rights for the current user
#   - Node.js, Yarn, and project dependencies installed
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

APP_NAME="desktop-claw"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist"

# Custom sudo password prompt. `%u` is replaced by the sudo user.
SUDO_PROMPT="[sudo] senha para %u (instalar ${APP_NAME}): "

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '>> %s\n' "$*"
}

# Preflight: required commands must exist before we do anything.
for cmd in tar sudo install mktemp ln yarn node; do
  command -v "${cmd}" >/dev/null 2>&1 || die "required command not found: ${cmd}"
done

# ---------------------------------------------------------------------------
# Step 1 — Build production app if needed
# ---------------------------------------------------------------------------

cd "${PROJECT_ROOT}"

if [ ! -f "${PROJECT_ROOT}/out/renderer.js" ] || [ ! -f "${PROJECT_ROOT}/out/main.js" ]; then
  log "Building production app (yarn build:prod) ..."
  yarn build:prod || die "build:prod failed"
else
  log "Production build already exists, skipping build:prod"
fi

# ---------------------------------------------------------------------------
# Step 2 — Package app to generate tarball and AppImage
# ---------------------------------------------------------------------------

log "Packaging app (yarn package) ..."
yarn package || die "package failed"

# Find the generated tarball (DesktopClaw-v*-linux-*.tar.gz)
TARBALL=$(find "${DIST_DIR}" -maxdepth 1 -name 'DesktopClaw-v*-linux-*.tar.gz' -type f | sort -V | tail -n1)

[ -n "${TARBALL}" ] && [ -f "${TARBALL}" ] || die "No tarball found in ${DIST_DIR} after packaging"

log "Found tarball: ${TARBALL}"

# ---------------------------------------------------------------------------
# Step 3 — Extract and run the official installer from the tarball
# ---------------------------------------------------------------------------

log "Extracting installer from tarball ..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

tar -xzf "${TARBALL}" -C "${TMP_DIR}"

# The tarball contains a directory like "desktop-claw-vX.Y.Z-linux-x86_64/"
EXTRACTED_DIR=$(find "${TMP_DIR}" -maxdepth 1 -type d -name 'desktop-claw-*' | head -n1)
[ -n "${EXTRACTED_DIR}" ] && [ -d "${EXTRACTED_DIR}" ] || die "Could not find extracted directory in tarball"

INSTALLER="${EXTRACTED_DIR}/install.sh"
[ -f "${INSTALLER}" ] || die "install.sh not found in extracted tarball"

log "Running official installer (${INSTALLER}) ..."
# The installer handles system-wide vs user install, desktop entry, icons, etc.
# Pass --prefix if you want to override install location
sudo -p "${SUDO_PROMPT}" bash "${INSTALLER}" "$@" || die "installer failed"

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

log "Verifying installation ..."
if command -v "${APP_NAME}" >/dev/null 2>&1; then
  log "Done! Run it with: ${APP_NAME}"
else
  log "Installation completed. If the command is not found, try restarting your shell or check PATH."
fi
