/**
 * The partner registry's two label maps are total, and every key they name
 * exists — the same loop `obligation-labels.test.ts` closes, for the same
 * reason.
 *
 * `satisfies Record<Enum, BetaMessageKey>` proves the map has a key for every
 * enum member THE TYPE KNOWS ABOUT, and the type is derived from the Drizzle
 * pgEnum, which is a hand-written mirror of migration 0015. This file walks the
 * pgEnum's own `enumValues` at runtime and resolves each label against the real
 * catalog, so a role added to the SQL and mirrored into the DSL without a Czech
 * name fails HERE rather than rendering `finance.roleNoveJmeno` in a table cell.
 *
 * The aging bands have no pgEnum behind them — they are derived in SQL and
 * typed in `projections.ts` — so the closing move there is the reverse: the map
 * is checked against the union's own members through an exhaustive record.
 *
 * Runs in the `pure` project: no database, no Postgres boot.
 */
import { describe, expect, it } from "vitest"

import { betaPartnerRole } from "@/db/schema"
import type { PartnerAging } from "@/lib/data/projections"

import betaCs from "../messages/cs.json"
import {
  PARTNER_AGING_LABEL_KEY,
  PARTNER_ROLE_LABEL_KEY,
} from "./partner-labels"

type Catalog = Record<string, Record<string, string>>

function resolve(key: string): string | undefined {
  const [namespace, name] = key.split(".")
  if (!namespace || !name) return undefined
  return (betaCs as unknown as Catalog)[namespace]?.[name]
}

describe("PARTNER_ROLE_LABEL_KEY", () => {
  it("has a Czech label for every role the enum declares", () => {
    expect(Object.keys(PARTNER_ROLE_LABEL_KEY).sort()).toEqual(
      [...betaPartnerRole.enumValues].sort(),
    )
  })

  it("resolves every key against the real catalog", () => {
    for (const [role, key] of Object.entries(PARTNER_ROLE_LABEL_KEY)) {
      expect(resolve(key), `${role} → ${key}`).toBeTruthy()
    }
  })

  it("is non-vacuous — an unmapped key would be caught", () => {
    expect(resolve("finance.roleNeexistuje")).toBeUndefined()
  })
})

describe("PARTNER_AGING_LABEL_KEY", () => {
  /**
   * The five bands, written out. The `satisfies` in the module proves the map
   * covers the union; this proves the UNION is what this test thinks it is, so
   * a sixth band added to `PartnerAging` and to the SQL `CASE` fails here rather
   * than rendering an empty chip.
   */
  const BANDS: Record<PartnerAging, true> = {
    unknown: true,
    not_due: true,
    days_1_30: true,
    days_31_90: true,
    days_over_90: true,
  }

  it("has a Czech label for every band", () => {
    expect(Object.keys(PARTNER_AGING_LABEL_KEY).sort()).toEqual(
      Object.keys(BANDS).sort(),
    )
  })

  it("resolves every key against the real catalog", () => {
    for (const [band, key] of Object.entries(PARTNER_AGING_LABEL_KEY)) {
      expect(resolve(key), `${band} → ${key}`).toBeTruthy()
    }
  })

  it("names the absence of a date as its own state, not as `not_due`", () => {
    // "The office stated no splatnost" and "nothing is overdue" are different
    // facts, and §0.4 forbids rendering the first as the second — so the two
    // must not share a label either.
    expect(resolve(PARTNER_AGING_LABEL_KEY.unknown)).not.toBe(
      resolve(PARTNER_AGING_LABEL_KEY.not_due),
    )
  })
})
