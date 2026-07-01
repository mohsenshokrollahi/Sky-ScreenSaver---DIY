#!/usr/bin/env bash
# Run ON the Raspberry Pi (over SSH) to install the full appliance:
#   Node.js + pnpm, the app (built), the new-skyline-server systemd service,
#   and a ufw firewall that allows only the ports the app needs.
#
# Data is fetched from the free airplanes.live public API — no radio hardware
# is required.
#
# Kiosk autostart (Chromium full-screen on HDMI) is set up separately by
# setup-kiosk.sh once you have a desktop session.
#
# Usage — run this script from anywhere inside the project:
#   ./pi-setup/install-on-pi.sh
set -euo pipefail

# Resolve the project root from the script's own location so this works
# regardless of where you extracted the archive or what you named the folder.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPDIR="$(cd "$SCRIPT_DIR/.." && pwd)"
USER_NAME="$(id -un)"

echo "==> Project root: $APPDIR"

# 64-bit userland required — NodeSource ships no armhf builds.
ARCH="$(dpkg --print-architecture 2>/dev/null || uname -m)"
case "$ARCH" in
  arm64|aarch64|amd64|x86_64) ;;
  *)
    echo "ERROR: unsupported architecture '$ARCH'." >&2
    echo "Needs a 64-bit OS. Re-flash with Raspberry Pi OS (64-bit)." >&2
    exit 1
    ;;
esac

echo "==> apt update + base packages"
sudo apt-get update
sudo apt-get install -y git curl unclutter ufw

echo "==> Node.js 22 (via NodeSource)"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> pnpm (via corepack)"
sudo corepack enable
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack prepare pnpm@10.28.2 --activate

echo "==> Build the app"
cd "$APPDIR"
pnpm install
pnpm build

echo "==> Install new-skyline-server systemd service"
PNPM_BIN="$(command -v pnpm)"
sudo sed \
  -e "s#__USER__#$USER_NAME#g" \
  -e "s#__APPDIR__#$APPDIR#g" \
  -e "s#__PNPM__#$PNPM_BIN#g" \
  "$APPDIR/pi-setup/new-skyline-server.service" \
  | sudo tee /etc/systemd/system/new-skyline-server.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now new-skyline-server.service

echo "==> Configure firewall (ufw)"
sudo ufw default deny incoming
sudo ufw default allow outgoing
# SSH — keep access open so you can always get back in.
sudo ufw allow 22/tcp comment 'SSH'
# New Skyline web UI + control panel + WebSocket.
sudo ufw allow 3000/tcp comment 'New Skyline'
# Enable (non-interactive).
sudo ufw --force enable
sudo ufw status verbose

IP="$(hostname -I | awk '{print $1}')"
echo
echo "Done."
echo "  Display      : http://$IP:3000/"
echo "  Control panel: http://$IP:3000/control  (open on your phone)"
echo
echo "Next: run ./pi-setup/setup-kiosk.sh to set up the HDMI TV kiosk, then reboot."
