/**
 * gen-payment-form-names.ts — generate the next-intl forma-úhrady display catalogs.
 *
 * Reads the vendored packages/db/data/payment-form.json and writes two top-level namespaces
 * into packages/i18n/src/messages/{en,cs}.json:
 *   - `paymentFormNames`   (code → Název, e.g. "Převodem")
 *   - `paymentFormPhrases` (code → instrumental invoice phrase, e.g. "převodem")
 * Both are Czech strings with no authoritative translation, so en = cs (honest, not
 * machine-translated). The DB stores no Czech text (Case-B objective columns only); the
 * register localizes by key like `countryNames` / `bankNames`.
 *
 * These namespaces are server-only (resolved in the RSC page), so they are stripped from the
 * client provider payload in apps/web/app/layout.tsx. Idempotent — re-run after editing the JSON.
 *
 * Vendored-data rule (memory vendored-data-prettier-gitleaks): the generator + JSON are both
 * tracked; add .prettierignore / .gitleaks.toml allowlist entries if lefthook trips.
 *
 * Run: pnpm --filter @workspace/db exec tsx scripts/gen-payment-form-names.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

interface PaymentFormData {
  code: string
  name: string
  phrase: string
}

const DATA = join(import.meta.dirname, "..", "data", "payment-form.json")
const MESSAGES_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "i18n",
  "src",
  "messages",
)

const data = JSON.parse(readFileSync(DATA, "utf8")) as PaymentFormData[]

const missing = data.filter((p) => !p.code || !p.name || !p.phrase)
if (missing.length > 0) {
  throw new Error(
    `gen-payment-form-names: ${missing.length} row(s) missing code/name/phrase ` +
      `(first: ${missing[0]?.code}). Every form needs both strings for the catalogs.`,
  )
}
// next-intl treats "." as a key-path separator; a code with a dot would nest and never resolve.
const dotted = data.filter((p) => p.code.includes("."))
if (dotted.length > 0) {
  throw new Error(
    `gen-payment-form-names: code with a dot breaks next-intl nesting: ${dotted
      .map((p) => p.code)
      .join(", ")}.`,
  )
}

const sortByKey = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).sort(([a], [z]) => a.localeCompare(z)))

const names = sortByKey(
  Object.fromEntries(data.map((p) => [p.code, p.name.trim()])),
)
const phrases = sortByKey(
  Object.fromEntries(data.map((p) => [p.code, p.phrase.trim()])),
)

for (const locale of ["en", "cs"] as const) {
  const file = join(MESSAGES_DIR, `${locale}.json`)
  const messages = JSON.parse(readFileSync(file, "utf8"))
  messages.paymentFormNames = names
  messages.paymentFormPhrases = phrases
  writeFileSync(file, JSON.stringify(messages, null, 2) + "\n")
  console.log(
    `wrote ${file} paymentFormNames(${Object.keys(names).length}) paymentFormPhrases(${Object.keys(phrases).length})`,
  )
}
