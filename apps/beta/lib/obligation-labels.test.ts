/**
 * The creditor-group mapping is total, and every key it names exists.
 *
 * `satisfies Record<Enum, BetaMessageKey>` already catches a missing value at
 * compile time, so why a runtime test: `satisfies` proves the map has a key for
 * every enum MEMBER THE TYPE KNOWS ABOUT, and the type is derived from the
 * Drizzle pgEnum, which is a hand-written mirror of the migration. This file
 * closes the loop the other way — it walks the pgEnum's own `enumValues` at
 * runtime and resolves each label against the real catalog, so a group added to
 * the SQL and mirrored into the DSL without a Czech name fails HERE rather than
 * rendering `finance.groupNoveJmeno` as a heading to an accountant.
 *
 * `filing-labels.ts` is covered the same way through `obligationTitle` below,
 * so the two maps a Dluhy a platby row draws on are both checked.
 *
 * Runs in the `pure` project: no database, no Postgres boot.
 */
import { describe, expect, it } from "vitest"

import { betaFilingKind, betaObligationGroup } from "@/db/schema"

import betaCs from "../messages/cs.json"
import {
  MANUAL_OBLIGATION_GROUPS,
  obligationTitle,
  OBLIGATION_GROUP_LABEL_KEY,
} from "./obligation-labels"

type Catalog = Record<string, Record<string, string>>

function resolve(key: string): string | undefined {
  const [namespace, name] = key.split(".")
  if (!namespace || !name) return undefined
  return (betaCs as unknown as Catalog)[namespace]?.[name]
}

describe("OBLIGATION_GROUP_LABEL_KEY", () => {
  it("has a Czech heading for every creditor group the enum declares", () => {
    expect(Object.keys(OBLIGATION_GROUP_LABEL_KEY).sort()).toEqual(
      [...betaObligationGroup.enumValues].sort(),
    )
  })

  it("resolves every key against the real catalog", () => {
    for (const [group, key] of Object.entries(OBLIGATION_GROUP_LABEL_KEY)) {
      expect(resolve(key), `${group} → ${key}`).toBeTruthy()
    }
  })

  it("is non-vacuous — an unmapped key would be caught", () => {
    expect(resolve("finance.groupNeexistuje")).toBeUndefined()
    expect(resolve("nesmysl")).toBeUndefined()
  })
})

describe("MANUAL_OBLIGATION_GROUPS — the F11 fence", () => {
  it("is the enum minus `dodavatele`, and stays that way as the enum grows", () => {
    // Hand-written so this module stays pure (a Client Component renders the
    // select), which is exactly why the relationship has to be asserted here:
    // a fifth creditor group added to the migration and mirrored into the DSL
    // fails this line rather than silently going missing from the form.
    expect([...MANUAL_OBLIGATION_GROUPS].sort()).toEqual(
      betaObligationGroup.enumValues
        .filter((group) => group !== "dodavatele")
        .sort(),
    )
  })

  it("never offers the group PR 28's import owns", () => {
    // Hand-typing a supplier payable next to its imported twin is Advisor
    // defect F11 — the triple entry the whole derived read model exists to kill.
    expect(MANUAL_OBLIGATION_GROUPS).not.toContain("dodavatele")
  })

  it("has a Czech heading for each of its groups", () => {
    for (const group of MANUAL_OBLIGATION_GROUPS) {
      expect(resolve(OBLIGATION_GROUP_LABEL_KEY[group]), group).toBeTruthy()
    }
  })
})

describe("obligationTitle — one title, whichever source produced the row", () => {
  it("translates every filing kind through the shared filing-labels map", () => {
    for (const kind of betaFilingKind.enumValues) {
      const title = obligationTitle({ filingKind: kind, label: null })
      expect(title.kind, kind).toBe("key")
      expect(resolve(title.value), `${kind} → ${title.value}`).toBeTruthy()
    }
  })

  it("passes a manual liability's titul through as the office typed it", () => {
    expect(
      obligationTitle({ filingKind: null, label: "Penále z prodlení" }),
    ).toEqual({ kind: "text", value: "Penále z prodlení" })
  })

  it("prefers the filing kind when a row somehow carries both", () => {
    // Not representable through the union today; asserted so the precedence is
    // a decision rather than an accident of argument order.
    expect(
      obligationTitle({ filingKind: "prehled_cssz", label: "Cokoliv" }),
    ).toEqual({ kind: "key", value: "dane.kindPrehledCssz" })
  })

  it("renders an empty title rather than crashing on a row with neither", () => {
    expect(obligationTitle({ filingKind: null, label: null })).toEqual({
      kind: "text",
      value: "",
    })
  })
})
