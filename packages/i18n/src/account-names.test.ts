/**
 * Drift guard for the GENERATED chart-of-accounts reference-name namespaces.
 *
 * `accounting.chartOfAccounts.{osnovaNames,templateNames}` in the live catalogs are emitted by
 * packages/db/scripts/gen-chart-template-seed.ts from two upstream sources — the vendored Money
 * template seed and the frozen reference migration 0026. This test independently re-derives them
 * and asserts the committed messages still match, so editing a source (or hand-editing a name)
 * without re-running the generator fails here instead of silently shipping a stale catalog.
 *
 * The derivation below is DELIBERATELY a second, independent copy of the generator's logic — not a
 * shared helper. Independence is the point: if the generator's parser and this one ever diverge,
 * this test's output stops matching the committed catalog and fails, so the duplication is
 * self-policing rather than unenforced. It is not extracted into a shared module because the
 * generator lives in @workspace/db and this test in @workspace/i18n; a shared import would cross
 * the package boundary (turbo `boundaries`) or force this test onto the Docker-gated db runner.
 * If you dedupe it, move this test into @workspace/db first.
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const DB = join(HERE, "..", "..", "db")

type NameMap = { en: Record<string, string>; cs: Record<string, string> }

function deriveTemplateNames(): NameMap {
  const seed = JSON.parse(
    readFileSync(join(DB, "seeds", "chart_template.2026.money.json"), "utf8"),
  ) as { accounts: { number: string; name: string; name_en: string }[] }
  const out: NameMap = { en: {}, cs: {} }
  for (const a of seed.accounts) {
    if (a.number in out.cs) continue // first-wins, mirrors ON CONFLICT (template_id, number)
    out.en[a.number] = a.name_en.trim()
    out.cs[a.number] = a.name.trim()
  }
  return out
}

function deriveOsnovaNames(): NameMap {
  const sql = readFileSync(
    join(DB, "migrations", "0026_accounting_reference_seed.sql"),
    "utf8",
  )
  const row =
    /^\s*\('([^']+)',\s*'(?:[^']|'')*',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'/
  const unquote = (s: string) => s.replace(/''/g, "'")
  const out: NameMap = { en: {}, cs: {} }
  let inDirective = false
  for (const line of sql.split("\n")) {
    if (/^INSERT INTO directive_account \(/.test(line)) {
      inDirective = true
      continue
    }
    if (!inDirective) continue
    if (/^\s*(ON CONFLICT|;)/i.test(line) || line.trim() === "") {
      inDirective = false
      continue
    }
    const m = row.exec(line)
    if (!m) continue
    out.cs[m[1]!] = unquote(m[2]!).trim()
    out.en[m[1]!] = unquote(m[3]!).trim()
  }
  return out
}

const messages = {
  en: JSON.parse(readFileSync(join(HERE, "messages", "en.json"), "utf8")),
  cs: JSON.parse(readFileSync(join(HERE, "messages", "cs.json"), "utf8")),
} as Record<
  "en" | "cs",
  { accounting: { chartOfAccounts: Record<string, Record<string, string>> } }
>
const catalog = (locale: "en" | "cs", ns: string) =>
  messages[locale].accounting.chartOfAccounts[ns]

describe("chart-of-accounts reference names stay in sync with their sources", () => {
  const template = deriveTemplateNames()
  const osnova = deriveOsnovaNames()

  it("templateNames match the vendored Money seed (both locales)", () => {
    expect(catalog("en", "templateNames")).toEqual(template.en)
    expect(catalog("cs", "templateNames")).toEqual(template.cs)
  })

  it("osnovaNames match the directive_account reference seed 0026 (both locales)", () => {
    expect(catalog("en", "osnovaNames")).toEqual(osnova.en)
    expect(catalog("cs", "osnovaNames")).toEqual(osnova.cs)
  })
})
