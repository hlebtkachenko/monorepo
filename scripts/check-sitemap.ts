#!/usr/bin/env tsx
/**
 * Sitemap-doc drift guard — the companion to `check-nav.ts`. `check-nav`
 * enforces nav.ts ↔ route folders; this enforces nav.ts ↔ the human-facing
 * `docs/specs/SITEMAP.md`. Asserts every org nav label (Pinned/Group/Page/
 * Subpage) appears somewhere in SITEMAP.md, so the doc can't silently fall
 * behind the code (the doc is the hand-maintained mirror — this keeps it honest).
 *
 * Coarse by design: a substring presence check, not a structural diff. It
 * catches the common drift — a new page label that never made it into the doc —
 * without pinning the doc's prose shape. "Overview" is skipped (generic, on
 * every module).
 */
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

import { MODULE_NAV } from "../apps/web/app/[orgSlug]/_nav/org-nav"

const SLUG = "__slug__"
const here = dirname(fileURLToPath(import.meta.url))
const doc = readFileSync(
  join(here, "..", "docs", "specs", "SITEMAP.md"),
  "utf8",
)

// Generic labels that recur across modules and are not worth pinning per-page.
const SKIP = new Set(["Overview"])

const pageLabels = new Set<string>()
const groupLabels = new Set<string>()
for (const key of Object.keys(MODULE_NAV)) {
  const base = key ? `/${SLUG}/${key}` : `/${SLUG}`
  const tree: SidebarNavEntry[] = MODULE_NAV[key]!(base)
  for (const entry of tree) {
    if ("href" in entry) {
      pageLabels.add(entry.label)
    } else {
      groupLabels.add(entry.label)
      for (const page of entry.pages) {
        pageLabels.add(page.label)
        for (const sub of page.subpages ?? []) pageLabels.add(sub.label)
      }
    }
  }
}

const missingPages = [...pageLabels].filter(
  (l) => !SKIP.has(l) && !doc.includes(l),
)
const missingGroups = [...groupLabels].filter((l) => !doc.includes(l))

if (missingPages.length > 0 || missingGroups.length > 0) {
  console.error(
    "[check-sitemap] nav labels missing from docs/specs/SITEMAP.md (update the doc):",
  )
  for (const l of missingGroups) console.error(`  group: ${l}`)
  for (const l of missingPages) console.error(`  page:  ${l}`)
  process.exit(1)
}

console.log(
  `[check-sitemap] OK — ${pageLabels.size} page/subpage + ${groupLabels.size} group labels all present in SITEMAP.md.`,
)
