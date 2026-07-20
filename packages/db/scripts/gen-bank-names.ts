/**
 * gen-bank-names.ts — generate the next-intl financial-institution display-name catalog.
 *
 * Reads the vendored packages/db/data/bank.json and writes the `bankNames` namespace
 * (keyed by 4-digit bank_code) into packages/i18n/src/messages/{en,cs}.json. Bank names are
 * Czech proper names with no authoritative translation, so en = cs (the vendored name) —
 * honest, not machine-translated. The DB stores no name (Case-B objective columns only);
 * the register localizes by key (getTranslations("bankNames")) like `countryNames`.
 *
 * This namespace is server-only (resolved in the RSC page), so it is stripped from the client
 * provider payload in apps/web/app/layout.tsx. Idempotent — re-run after editing bank.json.
 *
 * Vendored-data rule (memory vendored-data-prettier-gitleaks): the generator + bank.json are
 * both tracked; add .prettierignore / .gitleaks.toml allowlist entries if lefthook trips.
 *
 * Run: pnpm --filter @workspace/db exec tsx scripts/gen-bank-names.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

interface BankData {
  bankCode: string
  name: string
}

const DATA = join(import.meta.dirname, "..", "data", "bank.json")
const MESSAGES_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "i18n",
  "src",
  "messages",
)

const data = JSON.parse(readFileSync(DATA, "utf8")) as BankData[]

const missing = data.filter((b) => !b.bankCode || !b.name)
if (missing.length > 0) {
  throw new Error(
    `gen-bank-names: ${missing.length} row(s) missing bankCode/name ` +
      `(first: ${missing[0]?.bankCode}). Every bank needs a name for the catalog.`,
  )
}
// next-intl treats "." as a key-path separator; a code with a dot would nest and never resolve.
const dotted = data.filter((b) => b.bankCode.includes("."))
if (dotted.length > 0) {
  throw new Error(
    `gen-bank-names: bankCode with a dot breaks next-intl nesting: ${dotted
      .map((b) => b.bankCode)
      .join(", ")}.`,
  )
}

const sortByKey = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).sort(([a], [z]) => a.localeCompare(z)))

const names = sortByKey(
  Object.fromEntries(data.map((b) => [b.bankCode, b.name.trim()])),
)

for (const locale of ["en", "cs"] as const) {
  const file = join(MESSAGES_DIR, `${locale}.json`)
  const messages = JSON.parse(readFileSync(file, "utf8"))
  messages.bankNames = names
  writeFileSync(file, JSON.stringify(messages, null, 2) + "\n")
  console.log(`wrote ${file} bankNames(${Object.keys(names).length})`)
}
