#!/usr/bin/env tsx
/**
 * Nav drift guard — the lean alternative to a route-manifest codegen. Asserts
 * the hand-authored org nav (`app/[orgSlug]/_nav/org-nav.ts` + the co-located
 * `<module>/nav.ts` trees) stays in sync with the real route tree:
 *   - every nav href resolves to a real route folder (no dead links), and
 *   - every route folder appears in some nav (no orphan pages) — minus dynamic
 *     `[param]` segments, route groups `(group)`, private `_dirs`, and an
 *     explicit HIDDEN_ROUTES allowlist.
 *
 * Runs where the source IS present (dev / CI), so `output: "standalone"`
 * stripping the app source from the prod image is irrelevant here. This is the
 * whole value of the codegen drift gate, with none of the pipeline.
 */
import { existsSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

import { MODULE_NAV, orgRailNav } from "../apps/web/app/[orgSlug]/_nav/org-nav"

const SLUG = "__slug__"
// Routes that intentionally exist without a nav entry (deep detail pages, the
// saved content-panel demo, etc.).
const HIDDEN_ROUTES = new Set<string>([
  "demo-table",
  "demo-launchpad",
  "demo-dashboard",
  "demo-single",
  // Accounting v2 pages — real routes, reachable by URL; the Accounting nav
  // module that lists them is wired once the full page set lands (EPIC 5).
  "denik",
  "ledger",
])

const here = dirname(fileURLToPath(import.meta.url))
const ORG_DIR = join(here, "..", "apps", "web", "app", "[orgSlug]")

function leafHrefs(nav: SidebarNavEntry[]): string[] {
  const out: string[] = []
  for (const entry of nav) {
    const pages = "href" in entry ? [entry] : entry.pages
    for (const page of pages) {
      out.push(page.href)
      for (const sub of page.subpages ?? []) out.push(sub.href)
    }
  }
  return out
}

// Collect every nav href and reduce it to a route path (relative to the org
// root; "" = the index).
const navHrefs = new Set<string>()
for (const item of orgRailNav(SLUG)) {
  if (item !== "separator" && item.href) navHrefs.add(item.href)
}
for (const key of Object.keys(MODULE_NAV)) {
  const base = key ? `/${SLUG}/${key}` : `/${SLUG}`
  for (const href of leafHrefs(MODULE_NAV[key]!(base))) navHrefs.add(href)
}
const navPaths = new Set(
  [...navHrefs].map((href) => href.replace(`/${SLUG}`, "").replace(/^\//, "")),
)

// Walk the route tree: a directory with a `page.tsx` is a route; "" = index.
function routePaths(dir: string, prefix = ""): string[] {
  const out: string[] = []
  if (existsSync(join(dir, "page.tsx"))) out.push(prefix)
  for (const name of readdirSync(dir)) {
    if (name.startsWith("_") || name.startsWith(".")) continue
    if (name.startsWith("[") || name.startsWith("(")) continue
    const child = join(dir, name)
    if (!statSync(child).isDirectory()) continue
    out.push(...routePaths(child, prefix ? `${prefix}/${name}` : name))
  }
  return out
}
const routes = new Set(routePaths(ORG_DIR))

const deadLinks = [...navPaths].filter((path) => !routes.has(path))
const orphanRoutes = [...routes].filter(
  (path) => !navPaths.has(path) && !HIDDEN_ROUTES.has(path),
)

let failed = false
if (deadLinks.length > 0) {
  failed = true
  console.error("[check-nav] nav hrefs with no route folder:")
  for (const path of deadLinks) console.error(`  /${SLUG}/${path}`)
}
if (orphanRoutes.length > 0) {
  failed = true
  console.error(
    "[check-nav] route folders missing from nav (add to a nav.ts or HIDDEN_ROUTES):",
  )
  for (const path of orphanRoutes) console.error(`  ${path || "(index)"}`)
}
if (failed) process.exit(1)
console.log(
  `[check-nav] OK — ${routes.size} routes and ${navPaths.size} nav links in sync.`,
)
