// Per-member-state VAT-id formats, transcribed from the table the DPHSHV XSD
// embeds in the `c_vat` documentation ("Daňová identifikační čísla členských
// států EU": country, format, length, notes).
//
// EPO runs a "základní kontrola formální správnosti" on this, and a malformed
// id is the most common reason a souhrnné hlášení comes back — but nothing in
// the XSD's own facets enforces it (`c_vat` is a plain string), so an XSD-valid
// document sails through and is rejected on upload.
//
// Every pattern matches `c_vat`, i.e. the id WITHOUT its country prefix, which
// is the shape EPO wants and `splitVatId` produces.
//
// These findings are warnings, never errors. The table is transcribed from
// documentation rather than from a machine-readable source, and a filing that a
// derived regex rejects but the finanční správa would have accepted must not be
// blocked from being downloaded. The user sees the warning and decides.

/** `c_vat` pattern per member state, keyed by the EPO country code. */
export const VAT_FORMATS: Readonly<Record<string, RegExp>> = {
  // "první znak je vždy U, zbývajících osm jsou číslice"
  AT: /^U\d{8}$/,
  BE: /^\d{10}$/,
  BG: /^\d{9,10}$/,
  // "obsahuje na posledním místě jedno velké písmeno"
  CY: /^\d{8}[A-Z]$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  // "jedno nebo dvě velká písmena, a to na prvním nebo posledním místě nebo na
  // prvním a posledním místě" (9 znaků)
  ES: /^(?:[A-Z]\d{8}|\d{8}[A-Z]|[A-Z]\d{7}[A-Z])$/,
  FI: /^\d{8}$/,
  // "buď jen číslice nebo na prvním nebo druhém místě nebo na prvním a druhém
  // místě velké písmeno, s výjimkou písmen I a O" (11 znaků)
  FR: /^(?:\d{11}|[A-HJ-NP-Z]\d{10}|\d[A-HJ-NP-Z]\d{9}|[A-HJ-NP-Z]{2}\d{9})$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  // "jedno nebo dvě velká písmena, a to na posledním místě nebo na druhém a
  // posledním místě (pro délku 8), … na posledním a předposledním (pro délku 9)"
  IE: /^(?:\d{7}[A-Z]|\d[A-Z]\d{5}[A-Z]|\d{7}[A-Z]{2})$/,
  IT: /^\d{11}$/,
  LT: /^(?:\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  // "prvních devět znaků jsou číslice, poslední 3 znaky jsou vždy v rozsahu B01
  // až B99 nebo prvních deset znaků jsou číslice nebo velká písmena nebo '+'
  // nebo '*', poslední 2 znaky jsou vždy v rozsahu 02 až 98"
  NL: /^(?:\d{9}B(?:0[1-9]|[1-9]\d)|[0-9A-Z+*]{10}(?:0[2-9]|[1-8]\d|9[0-8]))$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  // "10 a méně … i číslice 0 na prvním popřípadě dalších místech je rozhodující"
  RO: /^\d{1,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
  // "9 nebo 12 číslic, nebo GD/HA a tři číslice" (vládní instituce / zdravotnická
  // organizace)
  XI: /^(?:\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
}

/** Human-readable shape, for the warning message. */
export const VAT_FORMAT_HINTS: Readonly<Record<string, string>> = {
  AT: "U + 8 číslic",
  BE: "10 číslic",
  BG: "9 nebo 10 číslic",
  CY: "8 číslic + velké písmeno",
  DE: "9 číslic",
  DK: "8 číslic",
  EE: "9 číslic",
  EL: "9 číslic",
  ES: "9 znaků s jedním nebo dvěma velkými písmeny na začátku či konci",
  FI: "8 číslic",
  FR: "11 znaků, případně velké písmeno (kromě I a O) na prvních dvou místech",
  HR: "11 číslic",
  HU: "8 číslic",
  IE: "8 nebo 9 znaků zakončených velkým písmenem",
  IT: "11 číslic",
  LT: "9 nebo 12 číslic",
  LU: "8 číslic",
  LV: "11 číslic",
  MT: "8 číslic",
  NL: "9 číslic + B01 až B99",
  PL: "10 číslic",
  PT: "9 číslic",
  RO: "1 až 10 číslic",
  SE: "12 číslic",
  SI: "8 číslic",
  SK: "10 číslic",
  XI: "9 nebo 12 číslic, nebo GD/HA + 3 číslice",
}
