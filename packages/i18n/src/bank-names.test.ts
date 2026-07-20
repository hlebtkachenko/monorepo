/**
 * Drift guard for the GENERATED `bankNames` namespace.
 *
 * `bankNames` in the live catalogs is emitted by packages/db/scripts/gen-bank-names.ts from
 * the vendored packages/db/data/bank.json. This test independently re-derives it and asserts
 * the committed messages still match, so editing bank.json (or hand-editing a name) without
 * re-running the generator fails here instead of silently shipping a stale catalog.
 *
 * The derivation below is DELIBERATELY a second, independent copy of the generator's logic —
 * independence is the point (mirrors country-names.test.ts). Bank names have no authoritative
 * translation, so en = cs (the vendored name).
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const DB = join(HERE, "..", "..", "db")

interface BankData {
  bankCode: string
  name: string
}

function derive(): Record<string, string> {
  const data = JSON.parse(
    readFileSync(join(DB, "data", "bank.json"), "utf8"),
  ) as BankData[]
  const sort = (m: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(m).sort(([a], [z]) => a.localeCompare(z)))
  return sort(Object.fromEntries(data.map((b) => [b.bankCode, b.name.trim()])))
}

const messages = {
  en: JSON.parse(readFileSync(join(HERE, "messages", "en.json"), "utf8")),
  cs: JSON.parse(readFileSync(join(HERE, "messages", "cs.json"), "utf8")),
} as Record<"en" | "cs", { bankNames: Record<string, string> }>

describe("bank reference names stay in sync with bank.json", () => {
  const expected = derive()

  it("bankNames match the vendored bank.json (en = cs)", () => {
    expect(messages.en.bankNames).toEqual(expected)
    expect(messages.cs.bankNames).toEqual(expected)
  })
})
