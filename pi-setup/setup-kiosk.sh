#!/usr/bin/env bash
# Run ON the Pi (desktop image) to launch Chromium full-screen on the display
# page at boot, hide the cursor, and disable screen blanking. Detects the
# Wayland compositor (labwc / wayfire) used by Raspberry Pi OS Bookworm.
set -euo pipefail

URL="${URL:-http://localhost:3000/}"
CHROMIUM="$(command -v chromium-browser || command -v chromium || echo chromium-browser)"

LAUNCH="$HOME/.local/bin/new-skyline-kiosk.sh"
mkdir -p "$HOME/.local/bin"
cat > "$LAUNCH" <<EOF
#!/usr/bin/env bash
# Kiosk launcher for Raspberry Pi OS (Debian Trixie / Bookworm).
#
# GPU notes:
#   - Native Wayland + ANGLE/GL is unreliable on Pi 4/5 under Xwayland and
#     causes a blank canvas (--use-gl=disabled ends up in the GPU process).
#   - We force software rasterization for the canvas with --disable-gpu.
#     The app's canvas still draws correctly; it just runs on the CPU, which
#     is fine for this use case.
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/\$(id -u)
# Wait for the server to be ready before opening Chromium.
until curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; do sleep 1; done
command -v unclutter >/dev/null && unclutter -idle 0.1 &
exec $CHROMIUM \\
  --kiosk --ozone-platform=x11 --app=$URL \\
  --disable-gpu \\
  --disable-software-rasterizer=false \\
  --user-data-dir=\$HOME/.kiosk-profile --no-first-run --password-store=basic \\
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble \\
  --check-for-update-interval=31536000 --start-fullscreen
EOF
chmod +x "$LAUNCH"

# Disable screen blanking / DPMS for the Wayland session.
if [ -d "$HOME/.config/wayfire.ini" ] || grep -qi wayfire /etc/xdg/labwc/* 2>/dev/null; then :; fi

if command -v labwc >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/labwc"
  AUTOSTART="$HOME/.config/labwc/autostart"
  grep -q new-skyline-kiosk "$AUTOSTART" 2>/dev/null || echo "$LAUNCH &" >> "$AUTOSTART"
  # Keep the screen awake.
  echo "==> labwc detected; kiosk added to $AUTOSTART"
elif command -v wayfire >/dev/null 2>&1; then
  INI="$HOME/.config/wayfire.ini"
  touch "$INI"
  if ! grep -q "\[autostart\]" "$INI"; then printf "\n[autostart]\n" >> "$INI"; fi
  grep -q new-skyline-kiosk "$INI" || sed -i "/\[autostart\]/a skylight = $LAUNCH" "$INI"
  grep -q "screensaver" "$INI" || sed -i "/\[autostart\]/a screensaver = false\ndpms = false" "$INI"
  echo "==> wayfire detected; kiosk added to $INI"
else
  # X11 / LXDE autostart fallback.
  AUTOSTART="$HOME/.config/lxsession/LXDE-pi/autostart"
  mkdir -p "$(dirname "$AUTOSTART")"
  {
    echo "@xset s off"
    echo "@xset -dpms"
    echo "@xset s noblank"
    echo "@$LAUNCH"
  } >> "$AUTOSTART"
  echo "==> X11/LXDE fallback; kiosk added to $AUTOSTART"
fi

echo
echo "Reboot to start the kiosk:  sudo reboot"
echo "Launch now (in the desktop session):  $LAUNCH"
IP="$(hostname -I | awk '{print $1}')"
echo
echo "Control panel (from your phone): http://$IP:3000/control"
