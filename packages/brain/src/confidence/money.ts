// Exact scale-2 (two-decimal) fixed-point conversions via STRING math.
//
// Never route an amount through `Number()` * 100: float rounding + the fact that
// `BigInt(Number("50000.00"))` yields 50_000n (whole Kč) instead of 5_000_000n
// (haléř) is the documented off-by-100 vector — a whole-Kč value read as haléř
// under-fires the DHM 40 000 Kč cap and silently reopens the confident-wrong
// hole (hard-class.ts). Both the server veto (decimal → minor) and the intake
// adapter (minor → decimal) go through here so the conversion is single-source.
//
// For CZK the minor unit is the haléř (1/100 Kč). The SAME scale-2 scaling also
// turns a percentage string ("21.00") into hundredths-of-a-percent (2100), which
// the VAT-consistency check reuses.

/** Parse a plain decimal string ("50000.00", "-1234.5", "40000.0000") to its scale-2 minor units (× 100). */
export function decimalToMinor(decimal: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(decimal.trim())
  if (!match) {
    throw new Error(`decimalToMinor: not a plain decimal amount: "${decimal}"`)
  }
  const negative = match[1] === "-"
  const whole = BigInt(match[2] as string)
  // Pad/truncate the fraction to exactly 2 digits. Truncating past 2 dp only
  // drops sub-haléř noise (numeric(19,4) padding like ".0000") — it can never
  // lift a value ACROSS the DHM threshold, so the veto stays fail-safe.
  const frac = ((match[3] ?? "") + "00").slice(0, 2)
  const minor = whole * 100n + BigInt(frac)
  return negative ? -minor : minor
}

/** Format scale-2 minor units back to a canonical 2-dp decimal string (5_000_000n → "50000.00"). */
export function minorToDecimal(minor: bigint): string {
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const whole = abs / 100n
  const frac = (abs % 100n).toString().padStart(2, "0")
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`
}
