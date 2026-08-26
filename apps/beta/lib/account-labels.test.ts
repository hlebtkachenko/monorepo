/**
 * The account-kind mappings are total, and every key they name exists.
 *
 * `satisfies Record<Enum, BetaMessageKey>` already catches a missing value at
 * compile time, so why a runtime test: `satisfies` proves the map has a key for
 * every enum MEMBER THE TYPE KNOWS ABOUT, and the type is derived from the
 * Drizzle pgEnum, which is a hand-written mirror of the migration. This file
 * closes the loop the other way — it walks the pgEnums' own `enumValues` at
 * runtime and resolves each label against the real catalog, so a kind added to
 * the SQL and mirrored into the DSL without a Czech name fails HERE rather than
 * rendering `finance.uctyKindNoveJmeno` on a client's card.
 *
 * Runs in the `pure` project: no database, no Postgres boot.
 */
import { describe, expect, it } from "vitest"

import { betaAccountKind, betaAccountMatchKind } from "@/db/schema"

import betaCs from "../messages/cs.json"
import {
  ACCOUNT_KINDS,
  ACCOUNT_KIND_LABEL_KEY,
  ACCOUNT_MATCH_KINDS,
  ACCOUNT_MATCH_KIND_LABEL_KEY,
} from "./account-labels"

type Catalog = Record<string, Record<string, string>>

function resolve(key: string): string | undefined {
  const [namespace, name] = key.split(".")
  if (!namespace || !name) return undefined
  return (betaCs as unknown as Catalog)[namespace]?.[name]
}

describe("ACCOUNT_KIND_LABEL_KEY", () => {
  it("has a Czech label for every kind the enum declares", () => {
    expect(Object.keys(ACCOUNT_KIND_LABEL_KEY).sort()).toEqual(
      [...betaAccountKind.enumValues].sort(),
    )
  })

  it("resolves every key against the real catalog", () => {
    for (const [kind, key] of Object.entries(ACCOUNT_KIND_LABEL_KEY)) {
      expect(resolve(key), `${kind} → ${key}`).toBeTruthy()
    }
  })

  it("is non-vacuous — an unmapped key would be caught", () => {
    expect(resolve("finance.uctyKindNeexistuje")).toBeUndefined()
  })
})

describe("ACCOUNT_MATCH_KIND_LABEL_KEY", () => {
  it("has a Czech label for every match kind the enum declares", () => {
    expect(Object.keys(ACCOUNT_MATCH_KIND_LABEL_KEY).sort()).toEqual(
      [...betaAccountMatchKind.enumValues].sort(),
    )
  })

  it("resolves every key against the real catalog", () => {
    for (const [matchKind, key] of Object.entries(
      ACCOUNT_MATCH_KIND_LABEL_KEY,
    )) {
      expect(resolve(key), `${matchKind} → ${key}`).toBeTruthy()
    }
  })
})

describe("the ordered lists the selects render", () => {
  it("offer exactly the enums' own values, and nothing else", () => {
    // Hand-written so this module stays pure (the Zadávání selects are Client
    // Components), which is exactly why the relationship has to be asserted
    // here: a third kind added to the migration and mirrored into the DSL fails
    // this line rather than silently going missing from the form.
    expect([...ACCOUNT_KINDS].sort()).toEqual(
      [...betaAccountKind.enumValues].sort(),
    )
    expect([...ACCOUNT_MATCH_KINDS].sort()).toEqual(
      [...betaAccountMatchKind.enumValues].sort(),
    )
  })

  it("put the mode that cannot surprise anybody first", () => {
    // `exact` is the database default (migration 0014) and claims exactly the
    // účet it names; `prefix` claims a whole analytic subtree.
    expect(ACCOUNT_MATCH_KINDS[0]).toBe("exact")
  })
})
