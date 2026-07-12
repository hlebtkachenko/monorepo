#!/usr/bin/env node
// Regenerate docs/SYSTEM-GAP-LOG-INDEX.md from docs/SYSTEM-GAP-LOG.md, and refuse
// (exit 1) if the log contains an obvious secret/PII leak. The log is committed to
// the public remote, so this guard is the safety net for the hygiene rules documented
// in the log header. No dependencies — plain Node ESM.
//
// Usage: node scripts/gap-log/reindex.mjs   (run from anywhere in the repo)

import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..", "..")
const LOG = join(repoRoot, "docs", "SYSTEM-GAP-LOG.md")
const INDEX = join(repoRoot, "docs", "SYSTEM-GAP-LOG-INDEX.md")

// High-confidence leak patterns. Deliberately specific so the hygiene-rule text in the
// log header (which names token PREFIXES like `affk_*`) does not self-trip: each pattern
// requires real trailing entropy, not a prefix followed by `*`.
const LEAK_PATTERNS = [
  { name: "afframe API key", re: /affk_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: "Anthropic key", re: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: "GitHub PAT", re: /gh[posru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
  { name: "AWS access key id", re: /AKIA[0-9A-Z]{16}/ },
  { name: "private key block", re: /-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----/ },
  { name: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
]

function scanForLeaks(text) {
  const hits = []
  text.split("\n").forEach((line, i) => {
    for (const { name, re } of LEAK_PATTERNS) {
      const m = line.match(re)
      if (m) hits.push({ line: i + 1, name, match: m[0] })
    }
  })
  return hits
}

function stripComment(value) {
  return value.replace(/<!--.*?-->/g, "").trim()
}

function parseEntries(text) {
  const lines = text.split("\n")
  const gapsStart = lines.findIndex((l) => l.trim() === "## Gaps")
  const scope = gapsStart === -1 ? lines : lines.slice(gapsStart + 1)
  const entries = []
  let current = null
  for (const line of scope) {
    const header = line.match(/^## (GAP-\d+)\s+[—-]\s+(.+)$/)
    if (header) {
      if (current) entries.push(current)
      current = { id: header[1], title: header[2].trim(), fields: {} }
      continue
    }
    if (!current) continue
    const field = line.match(/^-\s+\*\*(Status|Area|Severity|Type|Discovered):\*\*\s*(.+)$/)
    if (field) current.fields[field[1].toLowerCase()] = stripComment(field[2])
  }
  if (current) entries.push(current)
  return entries
}

function buildIndex(entries) {
  const rows = entries
    .map(
      (e) =>
        `| ${e.id} | ${e.title} | ${e.fields.area ?? "?"} | ${e.fields.severity ?? "?"} | ${e.fields.status ?? "?"} |`,
    )
    .join("\n")
  return `# System Gap Log — Index

> **Generated file — do not edit by hand.** Regenerate with \`node scripts/gap-log/reindex.mjs\`.
> One line per gap; read the full entry in [\`SYSTEM-GAP-LOG.md\`](SYSTEM-GAP-LOG.md) by its number.

Total gaps: **${entries.length}**

| # | Title | Area | Sev | Status |
| --- | --- | --- | --- | --- |
${rows}
`
}

function main() {
  const text = readFileSync(LOG, "utf8")

  const leaks = scanForLeaks(text)
  if (leaks.length > 0) {
    console.error("✗ SYSTEM-GAP-LOG.md contains forbidden content (public remote — clean it):")
    for (const l of leaks) console.error(`  line ${l.line}: ${l.name} → "${l.match}"`)
    console.error("Remove the secret/PII, then re-run.")
    process.exit(1)
  }

  const entries = parseEntries(text)
  const ids = entries.map((e) => e.id)
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dupes.length > 0) {
    console.error(`✗ duplicate gap ids: ${[...new Set(dupes)].join(", ")}`)
    process.exit(1)
  }

  writeFileSync(INDEX, buildIndex(entries), "utf8")
  console.log(`✓ leak scan clean · ${entries.length} gaps · wrote ${INDEX.replace(repoRoot + "/", "")}`)
}

main()
