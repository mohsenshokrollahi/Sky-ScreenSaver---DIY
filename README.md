# 🌌 Sky ScreenSaver

## ✨ Features

- 🛩️ **Live overhead aircraft** — positions, callsigns, altitude, speed, and destination
- 🌠 **Real sky layer** — stars, constellations, sun, moon, planets, and ISS at true positions
- 📡 **Free data** — no hardware required, uses the airplanes.live public API
- 📱 **Phone control panel** — tune every setting live from your phone over WiFi
- 🖥️ **Any TV size** — fills the screen at whatever resolution your TV reports
- 🔄 **Auto-starts on boot** — plug in the Pi, TV shows aircraft
- 🔒 **Firewall included** — ufw configured automatically, only necessary ports open
- 🗺️ **Airport runways** — drawn at true position so you watch arrivals line up
- ☄️ **Comet trails** — altitude-colored position history behind each aircraft

---

## 🧰 What You Need

| Item | Notes |
|---|---|
| **Raspberry Pi 4 or 5** (2 GB+ RAM) | Pi 5 for 60 fps. Pi Zero 2 W works at 30 fps. |
| **Any HDMI TV** | Any size. Connected via micro-HDMI → HDMI cable. |
| **microSD card** (16 GB+) | For the OS. |
| **Internet connection** | To fetch live flight data and satellite positions. |

---

## 🚀 Raspberry Pi Setup

### Step 1 — Flash the OS

Flash **Raspberry Pi OS (64-bit, Desktop)** using [Raspberry Pi Imager](https://www.raspberrypi.com/software/).

> ⚠️ **Must be 64-bit.** The app won't install on 32-bit OS images.

---

### Step 2 — Headless WiFi + SSH *(optional)*

To configure WiFi and SSH before first boot, mount the SD card's boot partition and run:

```bash
sudo BOOT_MNT=/mnt/sdboot \
  WIFI_SSID="YourWiFiName" \
  WIFI_PSK="YourWiFiPassword" \
  WIFI_COUNTRY=US \
  PUBKEY="$(cat ~/.ssh/id_ed25519.pub)" \
  ./pi-setup/provision-sd.sh
```

This enables SSH (key-only), joins WiFi, and prints a sudo password — **save it**.

Boot the Pi and wait ~60–90 seconds. Find its IP from your router admin panel, or run `arp -na` on your computer.

---

### Step 3 — Copy the Project to the Pi

**Option A — tar.gz + scp** *(simple)*

```bash
# On your computer — from inside the project folder
tar -czf /tmp/sky-screensaver.tar.gz \
  --exclude='./node_modules' --exclude='./dist' --exclude='./.git' .

scp /tmp/sky-screensaver.tar.gz pi@PI_IP:~/
ssh pi@PI_IP
```

```bash
# On the Pi
mkdir -p ~/new-skyline
tar -xzf ~/sky-screensaver.tar.gz -C ~/new-skyline
ls ~/new-skyline/    # ✓ should show package.json
```

**Option B — rsync** *(faster for repeat transfers)*

```bash
rsync -az --exclude node_modules --exclude dist --exclude .git \
  ./ pi@PI_IP:~/new-skyline/
ssh pi@PI_IP
```

---

### Step 4 — Install

```bash
cd ~/new-skyline
./pi-setup/install-on-pi.sh
```

> The script detects its own location — works regardless of where you put the folder.

This will:
- ✅ Install Node.js 22 + pnpm
- ✅ Build the app
- ✅ Start the server as a systemd service (auto-starts on every boot)
- ✅ Configure `ufw` firewall

Once done, open these from any device on your network:

| URL | Purpose |
|---|---|
| `http://PI_IP:3000/` | Aircraft display |
| `http://PI_IP:3000/control` | Settings panel (great from a phone) |

---

### Step 5 — HDMI TV Kiosk

On the Pi, in a desktop session (keyboard + monitor, or VNC):

```bash
cd ~/new-skyline
./pi-setup/setup-kiosk.sh
sudo reboot
```

After reboot, Chromium launches full-screen on the TV automatically. Cursor hidden, screen never blanks.

> **No HDMI signal after reboot?** Add `video=HDMI-A-1:1920x1080@60D` to `/boot/firmware/cmdline.txt` and reboot. Use the HDMI port nearest the USB-C power connector.

---

## 📍 Set Your Location

The display defaults to San Francisco International. Change it from the control panel:

1. Open `http://PI_IP:3000/control` on your phone
2. Go to **Location**
3. Search your city or airport, tap **Current** for GPS, or type `lat,lon` directly

---

## ⚙️ Configuration

<details>
<summary><strong>Config file</strong> — persistent overrides</summary>

Create `config/new-skyline.config.json` at the project root:

```json
{
  "centerLat": 51.4775,
  "centerLon": -0.4614,
  "locationName": "London Heathrow",
  "radiusMiles": 5
}
```

Control panel settings layer on top of this file.

</details>

<details>
<summary><strong>Control panel settings</strong></summary>

| Setting | Description |
|---|---|
| Location | Center of the tracking area |
| Radius | Miles out to show aircraft (default 3) |
| Rotation / Mirror | Calibrate for your TV's orientation |
| Theme | `ambient` · `telemetry` · `focus` |
| Sky toggles | Stars, sun, moon, satellites, planets on/off |

</details>

<details>
<summary><strong>Server environment variables</strong></summary>

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_SOURCE` | `api` | `api` = airplanes.live |
| `ALLOWED_HOSTS` | *(empty)* | Extra hosts/IPs to allow |
| `ALLOW_PRIVATE_LAN` | `1` | `0` = loopback only |

</details>

---

## 🔒 Firewall

`install-on-pi.sh` configures `ufw` automatically:

| Port | Purpose |
|---|---|
| `22/tcp` | SSH |
| `3000/tcp` | Sky ScreenSaver (UI + WebSocket) |
| all others | blocked inbound |

```bash
sudo ufw status verbose    # check rules on the Pi
```

---

## 🖥️ TV Display Notes

- **Any size works** — canvas fills the screen at the TV's native resolution
- **Edges cut off?** Go to your TV's picture settings → "Just Scan" / "Screen Fit" / "1:1 Pixel"
- **Wrong resolution?** Force it in `/boot/firmware/config.txt` with `hdmi_mode` settings

---

## 🐳 Docker *(alternative)*

```bash
docker compose up -d --build
# Display:       http://HOST_IP:3000/
# Control panel: http://HOST_IP:3000/control
```

---

## 🔧 Pushing Updates

```bash
PI_HOST=PI_IP ./scripts/deploy-to-pi.sh
```

Rsyncs source, rebuilds on the Pi, restarts the server, reloads the kiosk.

---

## 🩺 Troubleshooting

<details>
<summary><strong>No planes on the display</strong></summary>

Open the control panel → check the status bar for error messages. Make sure your location is set and Radius isn't too small.

</details>

<details>
<summary><strong>Blank / white screen on TV (Chromium running but nothing draws)</strong></summary>

GPU/GL issue on Debian Trixie. Re-run the kiosk setup:

```bash
cd ~/new-skyline && ./pi-setup/setup-kiosk.sh
pkill -f chromium && sleep 2 && ~/.local/bin/new-skyline-kiosk.sh &
```

</details>

<details>
<summary><strong>DNS lookup failed / HTTP 429 in status bar</strong></summary>

- **DNS lookup failed** — Pi has no internet. Check: `curl -I https://api.airplanes.live`
- **HTTP 429** — API rate limit hit. Auto-recovers in ~15 seconds.

</details>

<details>
<summary><strong>App doesn't start on boot</strong></summary>

```bash
sudo systemctl status new-skyline-server
journalctl -u new-skyline-server -n 50
```

</details>

<details>
<summary><strong>32-bit OS error during install</strong></summary>

Re-flash with **Raspberry Pi OS (64-bit)**. All Pi 3/4/5 and Zero 2 W support it.

</details>

---

## 🏗️ Architecture

```
airplanes.live API  ──────────────────────────────────┐
(free, internet)                                      │ poll ~1 Hz
                                                      ▼
                                        server/  (Node · Express · ws)  :3000
                                        ├─ normalize + enrich flights
                                        ├─ proxy satellite TLEs (Celestrak)
                                        ├─ persist config (WebSocket broadcast)
                                        └─ serve built web app
                                                      │
                          ┌───────────────────────────┼──────────────────┐
                          ▼                           ▼                  ▼
                   Display  /              Control  /control         REST /api/*
                   Canvas + sky engine     Phone settings UI         health · config
                   → HDMI TV              (live, two-way)            aircraft · geocode
```

**Stack:** TypeScript · React · Vite · Express · ws · pnpm workspaces · [astronomy-engine](https://github.com/cosinekitty/astronomy) · [satellite.js](https://github.com/shashwatak/satellite-js)

---

## 🙏 Credits

| Source | Used for |
|---|---|
| [airplanes.live](https://airplanes.live/) | Live flight data |
| [adsbdb](https://www.adsbdb.com/) | Route & aircraft enrichment |
| [Celestrak](https://celestrak.org/) | Satellite TLE elements |
| [OurAirports](https://ourairports.com/) | Airport & runway data |

---

<div align="center">

**Built with ❤️ for Raspberry Pi**

</div>
