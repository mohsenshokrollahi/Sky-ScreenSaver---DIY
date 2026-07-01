// adsbdb.com enrichment: callsign -> route (origin/dest + airline) and
// hex -> aircraft type/registration. Cached aggressively and persisted to
// disk so a restart doesn't re-hammer the free API. One request per new key.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const API = "https://api.adsbdb.com/v0";

export interface RouteInfo {
  airline?: string;
  origin?: string;
  destination?: string;
  originName?: string;
  destName?: string;
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
}
export interface AircraftInfo {
  typeName?: string;
  registration?: string;
}

interface MemCacheEntry {
  data: RouteInfo | AircraftInfo | null;
  fetchedAt: number;
}

interface CacheEntry<T> {
  data: T | null; // null = looked up, not found (negative cache)
  at: number; // ms epoch
}

interface CacheFile {
  routes: Record<string, CacheEntry<RouteInfo>>;
  aircraft: Record<string, CacheEntry<AircraftInfo>>;
}

export class RouteEnricher {
  private cache: CacheFile = { routes: {}, aircraft: {} };
  private inflight = new Map<string, Promise<void>>();
  private dirty = false;
  private ttlMs: number;
  private memCache = new Map<string, MemCacheEntry>();
  private readonly memTtlMs = 60_000;

  /** Test-injection: called whenever a network/disk fetch is triggered. */
  _onFetch: (() => void) | undefined = undefined;

  constructor(
    private cachePath: string,
    ttlHours = 12,
  ) {
    this.ttlMs = ttlHours * 3600_000;
  }

  _seedMemCache(key: string, data: RouteInfo | AircraftInfo | null, fetchedAt: number): void {
    this.memCache.set(key, { data, fetchedAt });
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<CacheFile>;
      this.cache = { routes: parsed.routes ?? {}, aircraft: parsed.aircraft ?? {} };
    } catch {
      // first run, no cache yet
    }
    // Persist periodically rather than on every write.
    setInterval(() => void this.flush(), 15_000).unref?.();
  }

  private fresh<T>(e: CacheEntry<T> | undefined, now: number): boolean {
    return !!e && now - e.at < this.ttlMs;
  }

  /** Synchronous read of whatever is cached; kicks off a fetch if missing. */
  enrichSync(
    hex: string,
    callsign: string | undefined,
    now: number,
  ): { route?: RouteInfo; aircraft?: AircraftInfo } {
    const out: { route?: RouteInfo; aircraft?: AircraftInfo } = {};

    // Check mem-cache for aircraft first
    const acMemKey = `a:${hex}`;
    const acMem = this.memCache.get(acMemKey);
    if (acMem && now - acMem.fetchedAt < this.memTtlMs) {
      out.aircraft = (acMem.data as AircraftInfo | null) ?? undefined;
    } else {
      // Fall through to disk cache
      const ac = this.cache.aircraft[hex];
      if (this.fresh(ac, now)) {
        out.aircraft = ac!.data ?? undefined;
        // Populate mem-cache from disk-cache hit
        this.memCache.set(acMemKey, { data: ac!.data, fetchedAt: now });
      } else {
        this.fetchAircraft(hex);
      }
    }

    if (callsign) {
      const cs = callsign.trim().toUpperCase();

      // Check mem-cache for route first
      const rMemKey = `r:${cs}`;
      const rMem = this.memCache.get(rMemKey);
      if (rMem && now - rMem.fetchedAt < this.memTtlMs) {
        out.route = (rMem.data as RouteInfo | null) ?? undefined;
      } else {
        // Fall through to disk cache
        const r = this.cache.routes[cs];
        if (this.fresh(r, now)) {
          out.route = r!.data ?? undefined;
          // Populate mem-cache from disk-cache hit
          this.memCache.set(rMemKey, { data: r!.data, fetchedAt: now });
        } else {
          this.fetchRoute(cs);
        }
      }
    }
    return out;
  }

  private fetchRoute(cs: string): void {
    const key = "r:" + cs;
    if (this.inflight.has(key)) return;
    this._onFetch?.();
    const p = (async () => {
      try {
        const res = await fetch(`${API}/callsign/${encodeURIComponent(cs)}`, {
          signal: AbortSignal.timeout(8000),
        });
        let data: RouteInfo | null = null;
        if (res.ok) {
          const json: any = await res.json();
          const fr = json?.response?.flightroute;
          if (fr) {
            data = {
              airline: fr.airline?.name,
              origin: fr.origin?.iata_code ?? fr.origin?.icao_code,
              destination: fr.destination?.iata_code ?? fr.destination?.icao_code,
              originName: fr.origin?.municipality,
              destName: fr.destination?.municipality,
              originLat: fr.origin?.latitude,
              originLon: fr.origin?.longitude,
              destLat: fr.destination?.latitude,
              destLon: fr.destination?.longitude,
            };
          }
        }
        this.cache.routes[cs] = { data, at: Date.now() };
        this.dirty = true;
      } catch {
        // leave uncached so we retry later
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
  }

  private fetchAircraft(hex: string): void {
    const key = "a:" + hex;
    if (this.inflight.has(key)) return;
    this._onFetch?.();
    const p = (async () => {
      try {
        const res = await fetch(`${API}/aircraft/${encodeURIComponent(hex)}`, {
          signal: AbortSignal.timeout(8000),
        });
        let data: AircraftInfo | null = null;
        if (res.ok) {
          const json: any = await res.json();
          const a = json?.response?.aircraft;
          if (a) {
            data = {
              typeName: a.manufacturer && a.type ? `${a.manufacturer} ${a.type}` : a.type,
              registration: a.registration,
            };
          }
        }
        this.cache.aircraft[hex] = { data, at: Date.now() };
        this.dirty = true;
      } catch {
        // retry later
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
  }

  private async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(dirname(this.cachePath), { recursive: true });
      await writeFile(this.cachePath, JSON.stringify(this.cache), "utf8");
    } catch {
      this.dirty = true; // try again next tick
    }
  }
}
