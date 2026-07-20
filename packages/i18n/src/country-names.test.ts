/**
 * Drift guard for the GENERATED `countryNames` namespace.
 *
 * `countryNames` in the live catalogs is emitted by packages/db/scripts/gen-country-names.ts
 * from the vendored packages/db/data/country.json. This test independently re-derives it and
 * asserts the committed messages still match, so editing country.json (or hand-editing a name)
 * without re-running the generator fails here instead of silently shipping a stale catalog.
 *
 * The derivation below is DELIBERATELY a second, independent copy of the generator's logic —
 * independence is the point (mirrors packages/i18n/src/account-names.test.ts). It reads the
 * committed JSON, not the runner's ICU, so it is deterministic across environments.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const DB = join(HERE, "..", "..", "db")

interface CountryData {
  iso2: string
  nameCs: string
  nameEn: string
  currencyCode: string | null
}

function derive(): { en: Record<string, string>; cs: Record<string, string> } {
  const data = JSON.parse(
    readFileSync(join(DB, "data", "country.json"), "utf8"),
  ) as CountryData[]
  const sort = (m: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(m).sort(([a], [z]) => a.localeCompare(z)))
  return {
    en: sort(Object.fromEntries(data.map((c) => [c.iso2, c.nameEn.trim()]))),
    cs: sort(Object.fromEntries(data.map((c) => [c.iso2, c.nameCs.trim()]))),
  }
}

const messages = {
  en: JSON.parse(readFileSync(join(HERE, "messages", "en.json"), "utf8")),
  cs: JSON.parse(readFileSync(join(HERE, "messages", "cs.json"), "utf8")),
} as Record<"en" | "cs", { countryNames: Record<string, string> }>

describe("country reference names stay in sync with country.json", () => {
  const expected = derive()

  it("countryNames match the vendored country.json (both locales)", () => {
    expect(messages.en.countryNames).toEqual(expected.en)
    expect(messages.cs.countryNames).toEqual(expected.cs)
  })
})
