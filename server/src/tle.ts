// Fetches satellite TLEs (Two-Line Elements) from Celestrak, caches them in
// memory + on disk (so the appliance still has a sky if it boots offline), and
// refreshes every 6 hours. The client computes positions from these with satellite.js.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface Tle {
  name: string;
  line1: string;
  line2: string;
}

const DEFAULT_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle";

/** 6-hour TTL in milliseconds. */
const TTL_MS = 6 * 3600_000; // 21_600_000

function parseTle(text: string): Tle[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length);
  const out: Tle[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith("1 ") && lines[i + 1]?.startsWith("2 ")) {
      const name = (lines[i - 1] ?? "SAT").replace(/^0 /, "").trim();
      out.push({ name, line1: lines[i], line2: lines[i + 1] });
      i++;
    }
  }
  return out;
}

export class TleStore {
  private tles: Tle[] = [];
  private fetchedAt = 0;
  private readonly ttlMs = TTL_MS;

  /**
   * Test-injection hook: called whenever a network fetch is triggered.
   * Set this in tests to detect/assert fetch behaviour.
   */
  _onFetch: (() => void) | undefined = undefined;

  constructor(
    private cachePath: string,
    private url = process.env.TLE_URL ?? DEFAULT_URL,
  ) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(raw) as { at: number; tles: Tle[] };
      this.tles = parsed.tles ?? [];
      this.fetchedAt = parsed.at ?? 0;
    } catch {
      /* first run — no cache on disk yet */
    }

    // Only fetch from Celestrak on startup if the on-disk cache is absent or stale.
    // If the cache is fresh (within 6 h), skip the network fetch entirely.
    if (Date.now() - this.fetchedAt >= this.ttlMs) {
      void this.refresh();
    }

    // Refresh periodically every 6 hours.
    setInterval(() => void this.refresh(), TTL_MS).unref?.();
  }

  async get(): Promise<Tle[]> {
    if (Date.now() - this.fetchedAt >= this.ttlMs) await this.refresh();
    return this.tles;
  }

  /**
   * Test-injection: seed the in-memory cache directly, bypassing disk and network.
   * `at` is a millisecond epoch timestamp (typically `Date.now() - elapsedMs`).
   */
  _seedCache(tles: Tle[], at: number): void {
    this.tles = tles;
    this.fetchedAt = at;
  }

  private async refresh(): Promise<void> {
    this._onFetch?.();
    try {
      const res = await fetch(this.url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const tles = parseTle(await res.text());
      if (tles.length) {
        this.tles = tles;
        this.fetchedAt = Date.now();
        await mkdir(dirname(this.cachePath), { recursive: true });
        await writeFile(
          this.cachePath,
          JSON.stringify({ at: this.fetchedAt, tles }),
          "utf8",
        );
        console.log(`[tle] refreshed ${tles.length} satellites`);
      }
    } catch (err) {
      console.error("[tle] refresh failed (using cache):", err instanceof Error ? err.message : err);
    }
  }
}
