// Aircraft type lookup from bundled ICAO type code table.

import types from "./types.json" with { type: "json" };

const TYPES = types as Record<string, string>;

/** Map an ICAO type code (e.g. "B738") to a human name. */
export function lookupType(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return TYPES[code.toUpperCase()];
}
