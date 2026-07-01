#!/usr/bin/env bash
# Push the current working tree to the New Skyline Pi, rebuild, restart the
# server, and reload the kiosk. Configure via env:
#   PI_HOST     Pi's IP address — required
#   PI_USER     (default pi)
#   PI_APPDIR   (default /home/<PI_USER>/new-skyline)
#   SSH_KEY     (default ~/.ssh/id_ed25519)
#   SERVICE     (default new-skyline-server)
#
# Example:
#   PI_HOST=192.168.1.50 ./scripts/deploy-to-pi.sh
set -euo pipefail

PI_HOST="${PI_HOST:?Set PI_HOST to your Pi'\''s IP address, e.g.: PI_HOST=192.168.1.50 ./scripts/deploy-to-pi.sh}"
PI_USER="${PI_USER:-pi}"
PI_APPDIR="${PI_APPDIR:-/home/$PI_USER/new-skyline}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SERVICE="${SERVICE:-new-skyline-server}"
SSH="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

REPO="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> rsync $REPO/ -> $PI_USER@$PI_HOST:$PI_APPDIR/"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude 'server/data' --exclude data --exclude logs \
  -e "$SSH" "$REPO/" "$PI_USER@$PI_HOST:$PI_APPDIR/"

echo "==> install + build + restart on the Pi"
# shellcheck disable=SC2087
$SSH "$PI_USER@$PI_HOST" "
  set -e
  cd '$PI_APPDIR'
  export CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  # The tracker's video pipeline shells out to ffmpeg.
  command -v ffmpeg >/dev/null || sudo apt-get install -y ffmpeg
  pnpm install
  pnpm build
  # Install/refresh the camera-tracker service (idempotent).
  PNPM_BIN=\$(command -v pnpm)
  sudo sed \
    -e \"s#__USER__#\$(id -un)#g\" \
    -e \"s#__APPDIR__#$PI_APPDIR#g\" \
    -e \"s#__PNPM__#\$PNPM_BIN#g\" \
    '$PI_APPDIR/pi-setup/skylight-tracker.service' \
    | sudo tee /etc/systemd/system/skylight-tracker.service >/dev/null
  sudo systemctl daemon-reload
  sudo systemctl enable skylight-tracker.service >/dev/null 2>&1 || true
  sudo systemctl restart $SERVICE
  sudo systemctl restart skylight-tracker.service
"

echo "==> reload kiosk (TV display on HDMI)"
$SSH "$PI_USER@$PI_HOST" '
  # TV kiosk launcher for second HDMI output (if available).
  mkdir -p "$HOME/.local/bin"
  CHROMIUM=$(command -v chromium-browser || command -v chromium)
  cat > "$HOME/.local/bin/new-skyline-tv-kiosk.sh" <<EOF
#!/usr/bin/env bash
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/\$(id -u)
until curl -fsS http://localhost:3001/api/tracker/health >/dev/null 2>&1; do sleep 1; done
exec $CHROMIUM \
  --ozone-platform=x11 --app=http://localhost:3000/tv.html \
  --user-data-dir=\$HOME/.tv-kiosk-profile --no-first-run --password-store=basic \
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  --window-position=1920,0 --start-fullscreen
EOF
  chmod +x "$HOME/.local/bin/new-skyline-tv-kiosk.sh"
  # Autostart alongside the main kiosk (wayfire).
  INI="$HOME/.config/wayfire.ini"
  if [ -f "$INI" ] && ! grep -q new-skyline-tv-kiosk "$INI"; then
    sed -i "/\[autostart\]/a new_skyline_tv = $HOME/.local/bin/new-skyline-tv-kiosk.sh" "$INI"
  fi
  export XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-1
  pkill -f "/usr/lib/chrom[i]um" 2>/dev/null || true
  sleep 2
  setsid "$HOME/.local/bin/new-skyline-kiosk.sh" < /dev/null > "$HOME/kiosk.log" 2>&1 &
  sleep 1
  setsid "$HOME/.local/bin/new-skyline-tv-kiosk.sh" < /dev/null > "$HOME/tv-kiosk.log" 2>&1 &
  sleep 1
' || true

echo "Done → display http://$PI_HOST:3000/ · control http://$PI_HOST:3000/control · TV /tv.html · tracker UI /tracker.html"
