#!/bin/sh
#
# Desktop Claw installer for any Linux distribution.
#
#   curl -fsSL https://zonaro.github.io/desktop-claw/install.sh | sh
#
# Installs the latest `.tar.gz` release, or updates an existing installation in
# place. Run as root for a system-wide install under /opt, or as a regular user
# for a self-contained install under ~/.local (no sudo needed either way).
#
# The same script ships inside every tarball: running it from an extracted
# release installs that release instead of downloading a new one.
#
# Options:
#   --uninstall        Remove an existing installation and exit.
#   --version <tag>    Install a specific release tag (e.g. v26.226.437).
#   --prefix <dir>     Override where the app payload is installed.
#   --help             Show this message.

set -eu

REPO="zonaro/desktop-claw"
API="https://api.github.com/repos/${REPO}/releases"
ICON_NAME="gh-desktop-claw"
APP_NAME="desktop-claw"
CLI_NAME="desktop-claw-cli"

ACTION="install"
WANTED_TAG=""
PREFIX_OVERRIDE=""
TMPDIR_CREATED=""

log() { printf '%s\n' "$*" >&2; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '3,20p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'
  exit 0
}

cleanup() {
  if [ -n "$TMPDIR_CREATED" ] && [ -d "$TMPDIR_CREATED" ]; then
    rm -rf "$TMPDIR_CREATED"
  fi
}
trap cleanup EXIT INT TERM

while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) ACTION="uninstall" ;;
    --version)
      shift
      [ $# -gt 0 ] || die '--version needs a release tag'
      WANTED_TAG="$1"
      ;;
    --prefix)
      shift
      [ $# -gt 0 ] || die '--prefix needs a directory'
      PREFIX_OVERRIDE="$1"
      ;;
    --help | -h) usage ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

# ---------------------------------------------------------------- locations --

# Root installs go where every distro already looks; unprivileged installs stay
# inside the XDG user directories so that no step ever needs sudo.
if [ "$(id -u)" = "0" ]; then
  PREFIX="/opt/${APP_NAME}"
  BIN_DIR="/usr/local/bin"
  DATA_DIR="/usr/share"
  SCOPE="system-wide"
else
  PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/${APP_NAME}"
  BIN_DIR="${HOME}/.local/bin"
  DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
  SCOPE="for the current user"
fi

[ -z "$PREFIX_OVERRIDE" ] || PREFIX="$PREFIX_OVERRIDE"

APPS_DIR="${DATA_DIR}/applications"
ICONS_DIR="${DATA_DIR}/icons/hicolor"
DESKTOP_FILE="${APPS_DIR}/${APP_NAME}.desktop"

# ---------------------------------------------------------------- uninstall --

remove_installation() {
  rm -rf "$PREFIX"
  rm -f "${BIN_DIR}/${APP_NAME}" "${BIN_DIR}/${CLI_NAME}" "$DESKTOP_FILE"
  for size in 32x32 64x64 128x128 256x256 512x512 1024x1024; do
    rm -f "${ICONS_DIR}/${size}/apps/${ICON_NAME}.png"
  done
}

refresh_desktop_caches() {
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$ICONS_DIR" >/dev/null 2>&1 || true
  fi
}

if [ "$ACTION" = "uninstall" ]; then
  if [ ! -d "$PREFIX" ]; then
    die "no installation found at ${PREFIX}"
  fi
  remove_installation
  refresh_desktop_caches
  log "Desktop Claw removed from ${PREFIX}."
  exit 0
fi

# --------------------------------------------------------------- get source --

detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo "x86_64" ;;
    aarch64 | arm64) echo "arm64" ;;
    *) die "unsupported architecture: $(uname -m) (only x86_64 and arm64 are built)" ;;
  esac
}

fetch() {
  # fetch <url> <destination>, or <url> alone to write to stdout.
  if command -v curl >/dev/null 2>&1; then
    if [ $# -eq 2 ]; then
      curl -fsSL --retry 3 -o "$2" "$1"
    else
      curl -fsSL --retry 3 "$1"
    fi
  elif command -v wget >/dev/null 2>&1; then
    if [ $# -eq 2 ]; then
      wget -qO "$2" "$1"
    else
      wget -qO- "$1"
    fi
  else
    die "neither curl nor wget is available"
  fi
}

# The script also lives at the root of every tarball. When it is run from there,
# the payload is already next to it and there is nothing to download.
SOURCE_DIR=""
case "$0" in
  -* | "" | sh | bash | dash) ;;
  *)
    if [ -f "$0" ]; then
      candidate=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
      if [ -x "${candidate}/app/${APP_NAME}" ]; then
        SOURCE_DIR="$candidate"
      fi
    fi
    ;;
esac

if [ -z "$SOURCE_DIR" ]; then
  ARCH=$(detect_arch)

  if [ -n "$WANTED_TAG" ]; then
    RELEASE_URL="${API}/tags/${WANTED_TAG}"
  else
    RELEASE_URL="${API}/latest"
  fi

  log "Looking up the ${WANTED_TAG:-latest} Desktop Claw release…"
  RELEASE_JSON=$(fetch "$RELEASE_URL") ||
    die "could not reach the GitHub releases API"

  TAG=$(printf '%s' "$RELEASE_JSON" |
    sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
    head -n 1)
  ASSET_URL=$(printf '%s' "$RELEASE_JSON" |
    tr ',' '\n' |
    sed -n 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' |
    grep -- "-linux-${ARCH}\.tar\.gz$" |
    head -n 1)

  [ -n "$ASSET_URL" ] ||
    die "the ${TAG:-latest} release has no linux-${ARCH} tarball"

  TMPDIR_CREATED=$(mktemp -d "${TMPDIR:-/tmp}/desktop-claw.XXXXXX")
  TARBALL="${TMPDIR_CREATED}/$(basename "$ASSET_URL")"

  log "Downloading ${TAG} for ${ARCH}…"
  fetch "$ASSET_URL" "$TARBALL" || die "download failed"

  # Releases ship a .sha256 next to every artifact; check it when we can.
  if command -v sha256sum >/dev/null 2>&1; then
    if fetch "${ASSET_URL}.sha256" "${TARBALL}.sha256" 2>/dev/null; then
      expected=$(cat "${TARBALL}.sha256")
      actual=$(sha256sum "$TARBALL" | cut -d' ' -f1)
      [ "$expected" = "$actual" ] ||
        die "checksum mismatch (expected ${expected}, got ${actual})"
      log "Checksum verified."
    fi
  fi

  log "Extracting…"
  tar -xzf "$TARBALL" -C "$TMPDIR_CREATED"
  SOURCE_DIR=$(find "$TMPDIR_CREATED" -maxdepth 1 -type d -name "${APP_NAME}-*" |
    head -n 1)
  [ -n "$SOURCE_DIR" ] && [ -x "${SOURCE_DIR}/app/${APP_NAME}" ] ||
    die "the tarball does not look like a Desktop Claw release"
fi

# ------------------------------------------------------------------ install --

VERSION="unknown"
[ ! -f "${SOURCE_DIR}/VERSION" ] || VERSION=$(cat "${SOURCE_DIR}/VERSION")

if [ -d "$PREFIX" ]; then
  log "Updating the existing installation at ${PREFIX}…"
else
  log "Installing to ${PREFIX}…"
fi

mkdir -p "$PREFIX" "$BIN_DIR" "$APPS_DIR"

# Replacing rather than merging keeps files from a previous version, which the
# new one no longer ships, from lingering in the payload directory.
rm -rf "${PREFIX}/app"
mkdir -p "${PREFIX}/app"
cp -a "${SOURCE_DIR}/app/." "${PREFIX}/app/"
cp -f "$0" "${PREFIX}/install.sh" 2>/dev/null || true
chmod +x "${PREFIX}/install.sh" 2>/dev/null || true
printf '%s\n' "$VERSION" >"${PREFIX}/VERSION"

chmod +x "${PREFIX}/app/${APP_NAME}"
CLI_SOURCE="${PREFIX}/app/resources/app/static/${CLI_NAME}"
[ ! -f "$CLI_SOURCE" ] || chmod +x "$CLI_SOURCE"

# Chromium's SUID sandbox helper only works when it is owned by root and setuid.
# Root installs can do that; user installs fall back to the kernel's unprivileged
# user namespaces, which the launcher below sorts out at startup.
SANDBOX="${PREFIX}/app/chrome-sandbox"
if [ -f "$SANDBOX" ] && [ "$(id -u)" = "0" ]; then
  chown root:root "$SANDBOX"
  chmod 4755 "$SANDBOX"
fi

cat >"${BIN_DIR}/${APP_NAME}" <<EOF
#!/bin/sh
# Generated by the Desktop Claw installer. Do not edit.
APP_DIR="${PREFIX}/app"

# Without a setuid-root chrome-sandbox, Chromium needs unprivileged user
# namespaces. Where the kernel has them switched off there is no sandbox left to
# use, and Electron refuses to start unless it is told so explicitly.
if [ ! -u "\$APP_DIR/chrome-sandbox" ] &&
  [ "\$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || echo 1)" = "0" ]; then
  set -- --no-sandbox "\$@"
fi

exec "\$APP_DIR/${APP_NAME}" "\$@"
EOF
chmod +x "${BIN_DIR}/${APP_NAME}"

if [ -f "$CLI_SOURCE" ]; then
  ln -sf "$CLI_SOURCE" "${BIN_DIR}/${CLI_NAME}"
fi

for size in 32x32 64x64 128x128 256x256 512x512 1024x1024; do
  icon="${SOURCE_DIR}/share/icons/hicolor/${size}/apps/${ICON_NAME}.png"
  if [ -f "$icon" ]; then
    mkdir -p "${ICONS_DIR}/${size}/apps"
    cp -f "$icon" "${ICONS_DIR}/${size}/apps/${ICON_NAME}.png"
  fi
done

cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Desktop Claw
Comment=GitHub Desktop fork with advanced functionality and improvements.
GenericName=Git Client
Exec=${BIN_DIR}/${APP_NAME} %U
Icon=${ICON_NAME}
Type=Application
StartupNotify=true
StartupWMClass=${APP_NAME}
Categories=Development;RevisionControl;
MimeType=x-scheme-handler/x-github-client;x-scheme-handler/x-github-desktop-auth;x-scheme-handler/x-github-desktop-dev-auth;
EOF

refresh_desktop_caches

log ""
log "Desktop Claw ${VERSION} installed ${SCOPE}."
log "  payload:  ${PREFIX}/app"
log "  launcher: ${BIN_DIR}/${APP_NAME}"
log "  uninstall: ${PREFIX}/install.sh --uninstall"

case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *)
    log ""
    log "Note: ${BIN_DIR} is not on your PATH. Add this to your shell profile:"
    log "  export PATH=\"${BIN_DIR}:\$PATH\""
    ;;
esac

log ""
log "Credentials are stored through libsecret, so a running keyring daemon"
log "(gnome-keyring, kwallet with the libsecret bridge, …) is required to sign in."
