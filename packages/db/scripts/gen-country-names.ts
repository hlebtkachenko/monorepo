/**
 * gen-country-names.ts — generate the next-intl country display-name catalogs.
 *
 * Reads the vendored packages/db/data/country.json and writes the `countryNames` namespace
 * (keyed by ISO 3166-1 alpha-2) into packages/i18n/src/messages/{en,cs}.json:
 *   cs = nameCs (the provided ČSÚ Czech name), en = nameEn (Intl.DisplayNames, baked into the
 *   vendored JSON so this catalog never depends on the runner's ICU version).
 *
 * Country names are translations, so they live in next-intl and resolve by key
 * (getTranslations("countryNames")) like every other string — never a per-language DB column.
 * This namespace is server-only (resolved in the RSC page), so it is stripped from the client
 * provider payload in apps/web/app/layout.tsx. Idempotent — re-run after editing country.json.
 *
 * Vendored-data rule (memory vendored-data-prettier-gitleaks): the generator + country.json are
 * both tracked; add .prettierignore / .gitleaks.toml allowlist entries if lefthook trips.
 *
 * Run: pnpm --filter @workspace/db exec tsx scripts/gen-country-names.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

interface CountryData {
  iso2: string
  nameCs: string
  nameEn: string
  currencyCode: string | null
}

const DATA = join(import.meta.dirname, "..", "data", "country.json")
const MESSAGES_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "i18n",
  "src",
  "messages",
)

const data = JSON.parse(readFileSync(DATA, "utf8")) as CountryData[]

const missing = data.filter((c) => !c.iso2 || !c.nameCs || !c.nameEn)
if (missing.length > 0) {
  throw new Error(
    `gen-country-names: ${missing.length} row(s) missing iso2/nameCs/nameEn ` +
      `(first: ${missing[0]?.iso2}). Every country needs both names for the catalog.`,
  )
}
// next-intl treats "." as a key-path separator; an iso2 with a dot would nest and never resolve.
const dotted = data.filter((c) => c.iso2.includes("."))
if (dotted.length > 0) {
  throw new Error(
    `gen-country-names: iso2 with a dot breaks next-intl nesting: ${dotted
      .map((c) => c.iso2)
      .join(", ")}.`,
  )
}

const sortByKey = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).sort(([a], [z]) => a.localeCompare(z)))

const names = {
  en: sortByKey(Object.fromEntries(data.map((c) => [c.iso2, c.nameEn.trim()]))),
  cs: sortByKey(Object.fromEntries(data.map((c) => [c.iso2, c.nameCs.trim()]))),
} as const

for (const locale of ["en", "cs"] as const) {
  const file = join(MESSAGES_DIR, `${locale}.json`)
  const messages = JSON.parse(readFileSync(file, "utf8"))
  messages.countryNames = names[locale]
  writeFileSync(file, JSON.stringify(messages, null, 2) + "\n")
  console.log(
    `wrote ${file} countryNames(${Object.keys(names[locale]).length})`,
  )
}
