/**
 * Drift guard for the GENERATED `constantSymbolNames` namespace.
 *
 * `constantSymbolNames` in the live catalogs is emitted by
 * packages/db/scripts/gen-constant-symbol-names.ts from the vendored
 * packages/db/data/constant-symbol.json. This test independently re-derives it and asserts
 * the committed messages still match, so editing the JSON (or hand-editing a name) without
 * re-running the generator fails here instead of silently shipping a stale catalog.
 *
 * The derivation below is DELIBERATELY a second, independent copy of the generator's logic —
 * independence is the point (mirrors country-names.test.ts). KS descriptions are Czech-specific
 * with no authoritative translation, so en = cs (the vendored name).
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const DB = join(HERE, "..", "..", "db")

interface ConstantSymbolData {
  code: string
  name: string
}

function derive(): Record<string, string> {
  const data = JSON.parse(
    readFileSync(join(DB, "data", "constant-symbol.json"), "utf8"),
  ) as ConstantSymbolData[]
  const sort = (m: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(m).sort(([a], [z]) => a.localeCompare(z)))
  return sort(Object.fromEntries(data.map((c) => [c.code, c.name.trim()])))
}

const messages = {
  en: JSON.parse(readFileSync(join(HERE, "messages", "en.json"), "utf8")),
  cs: JSON.parse(readFileSync(join(HERE, "messages", "cs.json"), "utf8")),
} as Record<"en" | "cs", { constantSymbolNames: Record<string, string> }>

describe("constant-symbol reference names stay in sync with constant-symbol.json", () => {
  const expected = derive()

  it("constantSymbolNames match the vendored constant-symbol.json (en = cs)", () => {
    expect(messages.en.constantSymbolNames).toEqual(expected)
    expect(messages.cs.constantSymbolNames).toEqual(expected)
  })
})
