// Business validity (OFFLINE) — the format/checksum checks the XSD does NOT encode.
// The XSD only checks the digit pattern of a DIČ (`[0-9]{1,10}`), never that it is a
// real number; EPO runs a checksum + ARES existence check as a kritická kontrola. This
// module is the offline half (self-contained, pure, no I/O): the mod-11 checksum. The
// ONLINE half (does this IČO exist in ARES, is the DPH registration active) is a
// network call and lives at the UI/server layer via `@workspace/registries`
// (`lookupAres` / `lookupVatRegistry`) — never here, so `@workspace/filing` stays pure.

/** Mod-11 check digit for an 8-digit Czech IČO, from its first 7 digits. */
function icoCheckDigit(first7: string): number {
  const weights = [8, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 7; i++) sum += Number(first7[i]) * weights[i]!
  // check = (11 − (weighted sum mod 11)) mod 10 (Czech IČO standard; remainder 0/1/10
  // fold uniformly through the outer mod 10).
  return (11 - (sum % 11)) % 10
}

/**
 * True iff `ico` is a structurally valid 8-digit Czech IČO (mod-11 checksum). This is a
 * format check, NOT an existence check — a valid-looking IČO may not be registered in
 * ARES (that is the online lookup's job).
 */
export function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false
  return icoCheckDigit(ico.slice(0, 7)) === Number(ico[7])
}

export interface DicValidity {
  ok: boolean
  /** Digits with any "CZ" prefix stripped. */
  bare: string
  /** Human-readable reason when `ok` is false. */
  error?: string
}

/**
 * Validate a Czech DIČ for a právnická osoba (the only taxpayer kind that files DPPO):
 * `CZ` + an 8-digit IČO with a valid mod-11 checksum. The "CZ" prefix is optional on
 * input (the filing model stores digits only). A fyzická osoba DIČ (CZ + rodné číslo)
 * is a different structure and is out of scope for DPPO — flag it rather than checksum
 * it as an IČO.
 */
export function validateDicLegalEntity(dic: string): DicValidity {
  const bare = dic.trim().replace(/^cz/i, "").replace(/\s/g, "")
  if (bare === "") return { ok: false, bare, error: "DIČ nevyplněno." }
  if (!/^\d+$/.test(bare)) {
    return {
      ok: false,
      bare,
      error: "DIČ smí obsahovat pouze číslice (po „CZ“).",
    }
  }
  if (bare.length !== 8) {
    return {
      ok: false,
      bare,
      error: `DIČ právnické osoby má 8 číslic (IČO), zadáno ${bare.length}.`,
    }
  }
  if (!isValidIco(bare)) {
    return { ok: false, bare, error: "Neplatný kontrolní součet IČO/DIČ." }
  }
  return { ok: true, bare }
}
