/**
 * Obrat watch — the two-tier DPH registration thresholds a neplátce is measured
 * against (spec §2.1 item 4, §5 "obrat-watch neplátce only").
 *
 * THE PORTAL NEVER PRODUCES THE OBRAT FIGURE. §0.2 is absolute about it: "every
 * number is office-provided ... The portal never derives an accounting fact from
 * raw documents." Obrat for DPH purposes is not a line of any statement — it is
 * 12 consecutive months of taxable supplies with place of plnění in tuzemsko —
 * so there is no row in this database that could be summed into it even
 * approximately, and an approximation of THIS number is the worst kind: it
 * decides whether a company has a registration duty. §2.1 names the two feeders
 * that may state it (`TURNOVER_SOURCES`), both office-fed, and neither exists
 * yet — so the surface says so rather than showing a figure it computed.
 *
 * WHAT THIS MODULE DOES DO is classify a figure it is GIVEN against two
 * statutory thresholds, and that is a comparison, not a computation.
 *
 * PURE: no `server-only`, no React, no database — a Client Component renders
 * the watch without a provider, and every boundary is a test.
 */

/**
 * The 2025+ two-tier rule (financnisprava.gov.cz, spec §8 sources).
 *
 * 2 000 000 Kč — exceeding it in a calendar year makes the company a plátce
 * from 1 January of the following year (the registration duty tier).
 * 2 536 500 Kč — exceeding it makes the company a plátce by law the very next
 * day, without waiting for the year to end.
 *
 * Held as `numeric(14,2)`-shaped STRINGS, the same shape every money value in
 * this app has, so a threshold and a reading are compared as like with like and
 * neither is ever parsed into a float.
 */
export const TURNOVER_REGISTRATION_THRESHOLD = "2000000.00"
export const TURNOVER_PAYER_BY_LAW_THRESHOLD = "2536500.00"

/** Which side of the two thresholds a reading falls on. */
export type TurnoverTier =
  | "below"
  /** Over 2 000 000 Kč — plátce from 1 January of the following year. */
  | "registration_duty"
  /** Over 2 536 500 Kč — plátce by law from the following day. */
  | "payer_by_law"

/** Where an obrat figure may come from (spec §2.1: "indicator annual_turnover
 * or VZZ výnosy import"), and whether that feeder exists yet.
 *
 * `implemented: false` is not a placeholder — spec §0.3 forbids those. It is the
 * fact the card needs in order to render the figure as ABSENT rather than as
 * "0 Kč", which is the difference between "we have not been told" and "you have
 * no turnover". Same device as `OBLIGATION_SOURCES` and `IMPORT_DATASETS`.
 *
 * `indicator` needs the `indicator_definition` / `indicator_value` pair of
 * spec §4, which no migration has created; `vzz_import` needs Výkazy (PR 25) to
 * establish which VZZ řádek an office's export calls total výnosy — a mapping,
 * not a sum, and one this module must be GIVEN rather than guess. */
export type TurnoverSource = "indicator" | "vzz_import"

export const TURNOVER_SOURCES: readonly {
  readonly source: TurnoverSource
  readonly implemented: boolean
}[] = Object.freeze([
  { source: "indicator", implemented: false },
  { source: "vzz_import", implemented: false },
])

/** An obrat figure as the office stated it, with the stamp that says when. */
export type TurnoverReading = {
  /** `numeric(14,2)` as a string — never parsed, only compared and formatted. */
  amount: string
  /** ISO date the figure is stated as of (§0.4: every number carries its own). */
  asOf: string
  source: TurnoverSource
}

/**
 * `numeric(14,2)` text → exact minor units, as a `bigint`.
 *
 * WHY NOT `Number(value)`. `formatBetaMoney` documents itself as the ONE place
 * this application turns a money string into a JavaScript number, and it says so
 * because it is the LAST step before display — nothing downstream of it can be
 * wrong. A threshold comparison is not a display step: its answer decides which
 * of three legal positions a company is told it is in. `BigInt` over the digits
 * is exact by construction, so that claim stays true and this one does not have
 * to be argued.
 */
function minorUnits(value: string): bigint {
  const negative = value.startsWith("-")
  const unsigned = negative ? value.slice(1) : value
  const [whole = "0", fraction = ""] = unsigned.split(".")
  const digits = `${whole}${fraction.padEnd(2, "0").slice(0, 2)}`
  const magnitude = BigInt(digits === "" ? "0" : digits)
  return negative ? -magnitude : magnitude
}

const REGISTRATION_MINOR = minorUnits(TURNOVER_REGISTRATION_THRESHOLD)
const PAYER_BY_LAW_MINOR = minorUnits(TURNOVER_PAYER_BY_LAW_THRESHOLD)

/**
 * Classify an office-provided obrat figure.
 *
 * STRICTLY GREATER THAN, both times. The law is written on exceeding
 * ("překročení obratu"), so a company whose obrat lands exactly on 2 000 000 Kč
 * has not crossed anything — and reporting that it has would be telling a client
 * they have a registration duty they do not have.
 */
export function turnoverTier(amount: string): TurnoverTier {
  const value = minorUnits(amount)
  if (value > PAYER_BY_LAW_MINOR) return "payer_by_law"
  if (value > REGISTRATION_MINOR) return "registration_duty"
  return "below"
}
