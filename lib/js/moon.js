/** Moon phase from the date alone (no sensor needed). */

const SYNODIC_DAYS = 29.530588853;
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);   // a known new moon

/**
 * { index, lit }: index 0-7 (0 new, 2 first quarter, 4 full, 6 last quarter) and the lit
 * share of the disc in percent, for a time in ms since the epoch.
 */
export function moonPhase(ms) {
  const days = (ms - NEW_MOON_MS) / 86400000;
  const age = ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
  const f = age / SYNODIC_DAYS;
  return { index: Math.round(f * 8) % 8, lit: Math.round(((1 - Math.cos(2 * Math.PI * f)) / 2) * 100) };
}
