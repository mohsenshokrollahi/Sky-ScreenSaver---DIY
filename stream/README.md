# New Skyline → Live Streaming (TikTok / Twitch)

Streams the aircraft display to TikTok Live or Twitch in a vertical (9:16) layout.

```
┌─────────────────┐
│  ● LIVE          │
│  UAL523          │   ← flight card
│  B772 · 9,400 ft │
├─────────────────┤
│                  │
│  aircraft radar  │   ← the main display view
│                  │
└─────────────────┘
```

## How it works

`start-stream.sh` renders the `/stream.html` page in a headless X server
(Xvfb + Chromium), captures the pixels with ffmpeg, and pushes H.264+AAC
to an RTMP ingest endpoint (TikTok, Twitch, YouTube, etc.).

## Setup

1. **Get RTMP credentials** from your streaming platform:
   - **TikTok:** requires LIVE access (1,000+ followers) via TikTok LIVE Studio
     or Live → Settings → "Stream via RTMP" in the app
   - **Twitch:** Dashboard → Settings → Stream → Primary Stream Key

2. Copy the example env file and fill in your credentials:
   ```bash
   cp stream/.env.example stream/.env
   ```
   `stream/.env` is gitignored — never commit stream keys.

3. Install dependencies on the streaming machine:
   ```bash
   sudo apt install xvfb chromium-browser ffmpeg
   ```

4. Start the stream:
   ```bash
   ./stream/start-stream.sh
   ```
   Ctrl-C stops everything.

> For unattended runs, see `skylight-stream@.service`. Start it intentionally —
> don't enable it at boot (going live should be a deliberate decision).

## Streaming from a different machine

The stream pusher doesn't have to run on the Pi. To push from another machine
on the same network, set `PAGE_URL` to point at the Pi:

```bash
PAGE_URL=http://PI_IP:3000/stream.html ./stream/start-stream.sh
```

Replace `PI_IP` with your Pi's actual IP address.

## Stream options

| Option | How |
|--------|-----|
| Show origin/destination | `PAGE_URL=...?route=1` — hidden by default |
| Resolution / bitrate | `RES=1080x1920 VBITRATE=4500k` in `.env` |
| Encoder | Auto: Pi 4 uses hardware `h264_v4l2m2m`, everything else uses `libx264 superfast` |
| Multiple streams | Run separate instances: `./start-stream.sh tiktok`, `./start-stream.sh twitch` (each reads `.env.<name>`) |
