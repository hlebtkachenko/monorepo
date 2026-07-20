/**
 * gen-constant-symbol-names.ts — generate the next-intl constant-symbol display-name catalog.
 *
 * Reads the vendored packages/db/data/constant-symbol.json and writes the `constantSymbolNames`
 * namespace (keyed by 4-digit code) into packages/i18n/src/messages/{en,cs}.json. Konstantní
 * symbol descriptions are Czech-specific regulatory strings with no authoritative translation,
 * so en = cs (the vendored name) — honest, not machine-translated. The DB stores no name
 * (Case-B objective columns only); the register localizes by key like `countryNames`.
 *
 * This namespace is server-only (resolved in the RSC page), so it is stripped from the client
 * provider payload in apps/web/app/layout.tsx. Idempotent — re-run after editing the JSON.
 *
 * Vendored-data rule (memory vendored-data-prettier-gitleaks): the generator + JSON are both
 * tracked; add .prettierignore / .gitleaks.toml allowlist entries if lefthook trips.
 *
 * Run: pnpm --filter @workspace/db exec tsx scripts/gen-constant-symbol-names.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

interface ConstantSymbolData {
  code: string
  name: string
}

const DATA = join(import.meta.dirname, "..", "data", "constant-symbol.json")
const MESSAGES_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "i18n",
  "src",
  "messages",
)

const data = JSON.parse(readFileSync(DATA, "utf8")) as ConstantSymbolData[]

const missing = data.filter((c) => !c.code || !c.name)
if (missing.length > 0) {
  throw new Error(
    `gen-constant-symbol-names: ${missing.length} row(s) missing code/name ` +
      `(first: ${missing[0]?.code}). Every symbol needs a name for the catalog.`,
  )
}
// next-intl treats "." as a key-path separator; a code with a dot would nest and never resolve.
const dotted = data.filter((c) => c.code.includes("."))
if (dotted.length > 0) {
  throw new Error(
    `gen-constant-symbol-names: code with a dot breaks next-intl nesting: ${dotted
      .map((c) => c.code)
      .join(", ")}.`,
  )
}

const sortByKey = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).sort(([a], [z]) => a.localeCompare(z)))

const names = sortByKey(
  Object.fromEntries(data.map((c) => [c.code, c.name.trim()])),
)

for (const locale of ["en", "cs"] as const) {
  const file = join(MESSAGES_DIR, `${locale}.json`)
  const messages = JSON.parse(readFileSync(file, "utf8"))
  messages.constantSymbolNames = names
  writeFileSync(file, JSON.stringify(messages, null, 2) + "\n")
  console.log(`wrote ${file} constantSymbolNames(${Object.keys(names).length})`)
}
