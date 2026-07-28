// EU VAT identification numbers, as EPO wants them.
//
// One declaration, because this knowledge used to exist in three copies (the
// DPHSHV adapter, the DPHSHV business checks and the web builder's projector)
// that already disagreed about GB with nothing anywhere saying why. Adding a
// state to one and not the others yields either a corrupted c_vat split or a
// false "není kód členského státu" on a perfectly good hlášení.

/**
 * VAT-registration prefixes VIES accepts. This is NOT the ISO 3166-1 list:
 * Greece registers under **EL** while its ISO code is GR, and Northern Ireland
 * uses **XI**. Splitting on "any two leading letters" instead of this set
 * corrupts ids that legitimately begin with two letters of their own — FR issues
 * `XX123456789`, NL ends in `B01`, XI has `GD123`.
 *
 * `GB` is present for SPLITTING only. A pre-Brexit document still carries GB
 * ids and must parse, but Great Britain is no longer a member state, so
 * `MEMBER_STATES` below excludes it and a new GB row is flagged.
 */
const VAT_PREFIXES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "GB",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE",
  "SI", "SK", "XI",
]) // prettier-ignore

/** The prefixes a CURRENT filing may name. `VAT_PREFIXES` minus the GB legacy. */
export const MEMBER_STATES: ReadonlySet<string> = new Set(
  [...VAT_PREFIXES].filter((p) => p !== "GB"),
)

/** ISO 3166-1 codes whose VAT prefix differs from the country code. */
const ISO_TO_VAT_PREFIX: Record<string, string> = { GR: "EL" }

/**
 * Split a VAT id into the EPO pair (`k_stat`, `c_vat`). The schema wants the id
 * "bez kódu státu ... bez mezer, čárek a teček", so separators go and a
 * recognised member-state prefix moves to `k_stat`.
 *
 * Three traps this avoids:
 *
 *  1. The documentation calls the remainder the "číselná část", but that cannot
 *     be taken literally: IE (`1234567FA`), NL (`…B01`) and ES (`X1234567L`) ids
 *     legitimately carry letters, and stripping them would turn a valid id into
 *     one VIES rejects. Only the prefix is removed.
 *  2. The prefix on the id itself wins over the counterparty's ISO country code,
 *     because the two disagree for Greece (ISO GR / VAT EL) and Northern Ireland.
 *  3. …but only when the two AGREE, or no country code was given. A bare French
 *     id may itself start with two letters, so `BE123456789` under
 *     `country_code: "FR"` must not be read as Belgian and lose its head.
 */
export function splitVatId(
  countryCode: string | null,
  taxId: string | null,
): { k_stat?: string; c_vat?: string } {
  const clean = (taxId ?? "").replace(/[\s.,-]/g, "").toUpperCase()
  const head = clean.slice(0, 2)
  const iso = (countryCode ?? "").toUpperCase()
  const expected = ISO_TO_VAT_PREFIX[iso] ?? iso
  const hasPrefix =
    VAT_PREFIXES.has(head) && (expected === "" || head === expected)
  const country = hasPrefix ? head : expected
  const number = hasPrefix ? clean.slice(2) : clean
  return {
    k_stat: country === "" ? undefined : country,
    c_vat: number === "" ? undefined : number,
  }
}
