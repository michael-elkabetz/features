#!/bin/sh
set -e

REPO="michael-elkabetz/features"
BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"

info()  { printf "${BOLD}%s${RESET}\n" "$1"; }
ok()    { printf "${GREEN}%s${RESET}\n" "$1"; }
warn()  { printf "${YELLOW}%s${RESET}\n" "$1"; }
err()   { printf "${RED}%s${RESET}\n" "$1" >&2; }

usage() {
  cat <<EOF
Usage: install.sh [OPTIONS]

Options:
  --uninstall   Remove features CLI
  --help        Show this message
EOF
}

uninstall() {
  info "Uninstalling features..."
  npm uninstall -g features 2>/dev/null && ok "features has been removed." || warn "features was not installed."
  exit 0
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    err "Error: Node.js is not installed."
    err "Install Node.js >= 18 from https://nodejs.org"
    exit 1
  fi

  NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
  if [ "$NODE_MAJOR" -lt 18 ]; then
    err "Error: Node.js >= 18 required (found v$(node -v | tr -d 'v'))."
    err "Upgrade at https://nodejs.org"
    exit 1
  fi
}

check_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    err "Error: npm is not installed."
    err "It usually ships with Node.js — reinstall from https://nodejs.org"
    exit 1
  fi
}

cleanup() {
  if [ -n "$TMPDIR_CREATED" ] && [ -d "$TMPDIR_CREATED" ]; then
    rm -rf "$TMPDIR_CREATED"
  fi
}

for arg in "$@"; do
  case "$arg" in
    --uninstall) uninstall ;;
    --help)      usage; exit 0 ;;
  esac
done

info "Installing features CLI..."
echo ""

check_node
ok "  Node.js v$(node -v | tr -d 'v') — OK"

check_npm
ok "  npm v$(npm -v) — OK"

echo ""

trap cleanup EXIT

TMPDIR_CREATED=$(mktemp -d)
TARBALL_URL="https://github.com/${REPO}/archive/refs/heads/main.tar.gz"

info "Downloading ${REPO}..."
curl -fsSL "$TARBALL_URL" | tar -xz -C "$TMPDIR_CREATED"

CLONE_DIR="$TMPDIR_CREATED/features-main"

info "Installing dependencies..."
cd "$CLONE_DIR"
npm install --production --ignore-scripts 2>&1

info "Installing features CLI globally..."
npm pack --ignore-scripts --pack-destination "$TMPDIR_CREATED" 2>&1
npm install -g "$TMPDIR_CREATED"/features-*.tgz 2>&1

echo ""
if command -v features >/dev/null 2>&1; then
  ok "features CLI installed successfully!"
  echo ""
  info "Get started:"
  echo "  features create    Create a new feature (KB + Skill)"
  echo "  features update    Update an existing feature"
  echo "  features           Run a feature"
else
  err "Installation completed but 'features' command not found in PATH."
  err "You may need to add npm's global bin directory to your PATH:"
  echo ""
  echo "  export PATH=\"\$(npm config get prefix)/bin:\$PATH\""
  exit 1
fi
