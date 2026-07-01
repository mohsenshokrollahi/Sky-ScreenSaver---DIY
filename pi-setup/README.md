# Raspberry Pi setup

This folder contains the scripts that turn a freshly-flashed Raspberry Pi into the
New Skyline appliance. Tested on **Raspberry Pi OS Bookworm / Trixie (64-bit, Desktop)**
on Pi 4 and Pi 5.

> **64-bit OS required.** Node.js has no 32-bit ARM builds. All supported Pis
> (3/4/5, Zero 2 W) can run the 64-bit image.

For the full step-by-step walkthrough, see the main [README](../README.md).

---

## Scripts

| File | Runs on | Purpose |
|---|---|---|
| `provision-sd.sh` | Your computer | Writes WiFi credentials + SSH key to the SD card boot partition for headless first boot |
| `install-on-pi.sh` | The Pi | Installs Node.js, pnpm, builds the app, enables the systemd service, configures ufw firewall |
| `setup-kiosk.sh` | The Pi | Sets up Chromium kiosk autostart for full-screen HDMI display on boot |
| `new-skyline-server.service` | The Pi | systemd unit for the server (installed by `install-on-pi.sh`) |
| `skylight-tracker.service` | The Pi | systemd unit for the optional PTZ camera tracker |

---

## Quick reference

### 1. Provision the SD card (on your computer)

```bash
sudo BOOT_MNT=/mnt/sdboot \
  WIFI_SSID="YourWiFi" \
  WIFI_PSK="YourPassword" \
  WIFI_COUNTRY=US \
  PUBKEY="$(cat ~/.ssh/id_ed25519.pub)" \
  ./pi-setup/provision-sd.sh
```

Find the Pi's IP from your router admin panel or run `arp -na` on your computer after boot.

### 2. Copy the project to the Pi

**Option A — tar.gz + scp**

On your computer (from inside the project folder):

```bash
tar -czf /tmp/new-skyline.tar.gz \
  --exclude='./node_modules' --exclude='./dist' --exclude='./.git' .

scp /tmp/new-skyline.tar.gz pi@PI_IP:~/
```

On the Pi:

```bash
mkdir -p ~/new-skyline
tar -xzf ~/new-skyline.tar.gz -C ~/new-skyline
ls ~/new-skyline/    # verify — should show package.json
```

**Option B — rsync**

```bash
rsync -az --exclude node_modules --exclude dist --exclude .git \
  ./ pi@PI_IP:~/new-skyline/
```

SSH in: `ssh pi@PI_IP`

### 3. Install on the Pi

```bash
cd ~/new-skyline
./pi-setup/install-on-pi.sh
```

The script resolves its own location automatically — works from any folder name or path.

### 4. Set up the HDMI kiosk (on the Pi, in a desktop session)

```bash
./pi-setup/setup-kiosk.sh
sudo reboot
```

After reboot, Chromium launches full-screen on the TV automatically.

---

## Firewall

`install-on-pi.sh` configures `ufw` automatically:

| Port | Protocol | Purpose |
|---|---|---|
| 22 | TCP | SSH — always open so you can get back in |
| 3000 | TCP | New Skyline web UI, control panel, WebSocket |
| all others | — | blocked inbound |

Outbound is unrestricted (needed for flight data API + satellite TLEs).

```bash
sudo ufw status verbose    # check current rules
```

---

## Service management

```bash
# Check server status
sudo systemctl status new-skyline-server

# Stream logs live
journalctl -u new-skyline-server -f

# Restart server
sudo systemctl restart new-skyline-server
```

---

## Updating the app

After pulling new code on your dev machine, push it to the Pi with:

```bash
PI_HOST=PI_IP ./scripts/deploy-to-pi.sh
```

Or manually on the Pi:

```bash
cd ~/new-skyline
pnpm install && pnpm build
sudo systemctl restart new-skyline-server
```
