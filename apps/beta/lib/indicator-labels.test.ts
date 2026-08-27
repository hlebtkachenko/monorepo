/**
 * The indicator-kind mapping is total, and every key it names exists.
 *
 * Same reasoning as `account-labels.test.ts`: `satisfies` proves the map covers
 * every enum member THE TYPE knows about, and the type is derived from a
 * hand-written mirror of the migration. This file closes the loop the other way
 * — it walks the pgEnum's own `enumValues` at runtime and resolves each label
 * against the real catalog, so a kind added to the SQL and mirrored into the DSL
 * without a Czech name fails HERE rather than rendering
 * `ukazatele.kindNoveJmeno` in the office's select.
 *
 * Runs in the `pure` project: no database, no Postgres boot.
 */
import { describe, expect, it } from "vitest"

import { betaIndicatorKind } from "@/db/schema"

import betaCs from "../messages/cs.json"
import { INDICATOR_KINDS, INDICATOR_KIND_LABEL_KEY } from "./indicator-labels"

type Catalog = Record<string, Record<string, string>>

function resolve(key: string): string | undefined {
  const [namespace, name] = key.split(".")
  if (!namespace || !name) return undefined
  return (betaCs as unknown as Catalog)[namespace]?.[name]
}

describe("INDICATOR_KIND_LABEL_KEY", () => {
  it("has a Czech label for every kind the enum declares", () => {
    expect(Object.keys(INDICATOR_KIND_LABEL_KEY).sort()).toEqual(
      [...betaIndicatorKind.enumValues].sort(),
    )
  })

  it("resolves every key against the real catalog", () => {
    for (const [kind, key] of Object.entries(INDICATOR_KIND_LABEL_KEY)) {
      expect(resolve(key), `${kind} → ${key}`).toBeTruthy()
    }
  })

  it("is non-vacuous — an unmapped key would be caught", () => {
    expect(resolve("ukazatele.kindNeexistuje")).toBeUndefined()
  })
})

describe("the ordered list the select renders", () => {
  it("offers exactly the enum's own values, and nothing else", () => {
    // Hand-written so this module stays pure (the Zadávání select is a Client
    // Component), which is exactly why the relationship has to be asserted here:
    // a second kind added to the migration and mirrored into the DSL fails this
    // line rather than silently going missing from the form.
    expect([...INDICATOR_KINDS].sort()).toEqual(
      [...betaIndicatorKind.enumValues].sort(),
    )
  })
})
