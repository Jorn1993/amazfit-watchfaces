/** Small, dependency-free formatting helpers. */

export function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

/** 12486 -> "12,486" */
export function formatThousands(n) {
  const s = String(Math.round(n));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    out += s[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += ',';
  }
  return out;
}

/** Metres -> km or miles with 2 decimals below 10, 1 decimal above. */
export function formatDistance(meters, imperial) {
  const value = imperial ? meters / 1609.344 : meters / 1000;
  const digits = value < 10 ? 2 : 1;
  return { text: value.toFixed(digits), unit: imperial ? 'mi' : 'km' };
}

/** Follows the watch's 12/24h setting; no AM/PM marker by design. */
export function formatClock(hour, minute, is12h) {
  let h = hour;
  if (is12h) {
    h = hour % 12;
    if (h === 0) h = 12;
  }
  return `${is12h ? h : pad2(h)}:${pad2(minute)}`;
}

/** Sum of per-character advances (px) from the generated width table. */
export function textWidth(text, table) {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const c = table[text[i]];
    w += c === undefined ? table['0'] : c;
  }
  return w;
}
