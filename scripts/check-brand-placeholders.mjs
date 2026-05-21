#!/usr/bin/env node
/**
 * Scan brand surfaces for unfilled <BRAND-*> placeholders.
 *
 * Two surfaces:
 *   1. i18n messages — packages/i18n/src/messages/*.json under "brand": { ... }
 *   2. Non-localized constants — packages/ui/src/brand-assets/constants.ts
 *
 * Exit codes:
 *   0 — no placeholders, OR placeholders present but staging-permissive mode
 *   1 — placeholders present AND CHECK_BRAND_STRICT=true (prod deploy guard)
 *
 * Staging is allowed to ship with placeholders so brand copy can be
 * iterated against a real deploy without blocking. Production must not.
 *
 * Usage:
 *   pnpm check:brand-placeholders                       # warn-only
 *   CHECK_BRAND_STRICT=true pnpm check:brand-placeholders   # fail on any
 */
import { readFileSync, readdirSync } from "node:fs"
import { resolve, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const REPO = resolve(dirname(__filename), "..")
const PLACEHOLDER_RE = /<BRAND-[A-Z0-9-]+>/g

const I18N_DIR = resolve(REPO, "packages/i18n/src/messages")
const CONSTANTS_FILE = resolve(
  REPO,
  "packages/ui/src/brand-assets/constants.ts",
)

const strict = process.env.CHECK_BRAND_STRICT === "true"

function scan(filePath) {
  const text = readFileSync(filePath, "utf-8")
  const hits = []
  const lines = text.split("\n")
  lines.forEach((line, i) => {
    const matches = line.match(PLACEHOLDER_RE)
    if (matches) {
      for (const m of matches) {
        hits.push({ line: i + 1, placeholder: m })
      }
    }
  })
  return hits
}

const files = []
for (const entry of readdirSync(I18N_DIR)) {
  if (entry.endsWith(".json")) files.push(resolve(I18N_DIR, entry))
}
files.push(CONSTANTS_FILE)

const totals = []
for (const f of files) {
  const hits = scan(f)
  if (hits.length > 0) totals.push({ file: f, hits })
}

if (totals.length === 0) {
  console.log("brand-placeholders: clean — no <BRAND-*> tokens remaining")
  process.exit(0)
}

const totalCount = totals.reduce((n, t) => n + t.hits.length, 0)
const mode = strict ? "STRICT" : "warn"
console.log(
  `brand-placeholders: ${totalCount} placeholder(s) across ${totals.length} file(s) [${mode}]`,
)
for (const { file, hits } of totals) {
  console.log(`\n  ${relative(REPO, file)}`)
  for (const { line, placeholder } of hits) {
    console.log(`    L${line}  ${placeholder}`)
  }
}

if (strict) {
  console.error(
    "\nCHECK_BRAND_STRICT=true: failing the deploy. Fill all <BRAND-*> placeholders before promoting to production.",
  )
  process.exit(1)
}

console.log(
  "\nStaging permits placeholders. Set CHECK_BRAND_STRICT=true to gate production.",
)
process.exit(0)
