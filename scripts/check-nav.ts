#!/usr/bin/env tsx
/**
 * Nav drift guard — the lean alternative to a route-manifest codegen. Asserts
 * the hand-authored nav trees stay in sync with the real route trees:
 *   - every nav href resolves to a real route folder (no dead links), and
 *   - every route folder appears in some nav (no orphan pages) — minus dynamic
 *     `[param]` segments, route groups `(group)`, private `_dirs`, and an
 *     explicit HIDDEN_ROUTES allowlist.
 *
 * Covers BOTH tenant tiers: the org surface (`app/[orgSlug]` + `org-nav.ts`) and
 * the workspace surface (`app/workspace` + `workspace-nav.ts`). One walker, two
 * trees.
 *
 * Runs where the source IS present (dev / CI), so `output: "standalone"`
 * stripping the app source from the prod image is irrelevant here. This is the
 * whole value of the codegen drift gate, with none of the pipeline.
 */
import { existsSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

import { MODULE_NAV, orgRailNav } from "../apps/web/app/[orgSlug]/_nav/org-nav"
import {
  WORKSPACE_MODULE_NAV,
  workspaceRailNav,
} from "../apps/web/app/_components/workspace-nav"

const SLUG = "__slug__"

const here = dirname(fileURLToPath(import.meta.url))
const APP_DIR = join(here, "..", "apps", "web", "app")

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

/** Reduce absolute nav hrefs to route paths relative to `prefix` ("" = index). */
function navPathsFrom(hrefs: Iterable<string>, prefix: string): Set<string> {
  return new Set(
    [...hrefs].map((href) =>
      (href.startsWith(prefix) ? href.slice(prefix.length) : href).replace(
        /^\//,
        "",
      ),
    ),
  )
}

/** Walk the route tree: a directory with a `page.tsx` is a route; "" = index. */
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

interface Tier {
  label: string
  dir: string
  prefix: string
  navPaths: Set<string>
  hidden: Set<string>
}

// --- Org tier ---------------------------------------------------------------
const orgHrefs = new Set<string>()
for (const item of orgRailNav(SLUG)) {
  if (item !== "separator" && item.href) orgHrefs.add(item.href)
}
for (const key of Object.keys(MODULE_NAV)) {
  const base = key ? `/${SLUG}/${key}` : `/${SLUG}`
  for (const href of leafHrefs(MODULE_NAV[key]!(base))) orgHrefs.add(href)
}

// --- Workspace tier ---------------------------------------------------------
const wsHrefs = new Set<string>()
for (const item of workspaceRailNav()) {
  if (item !== "separator" && item.href) wsHrefs.add(item.href)
}
for (const key of Object.keys(WORKSPACE_MODULE_NAV)) {
  for (const href of leafHrefs(WORKSPACE_MODULE_NAV[key]!())) wsHrefs.add(href)
}

const tiers: Tier[] = [
  {
    label: "org",
    dir: join(APP_DIR, "[orgSlug]"),
    prefix: `/${SLUG}`,
    navPaths: navPathsFrom(orgHrefs, `/${SLUG}`),
    // Saved dev-only content-panel demos: exist without a nav entry. Plus the
    // doklad editor — a detail workspace in the Records (documents) module,
    // not a sidebar list page, so it has no nav.ts slot.
    hidden: new Set([
      "demo-table",
      "demo-launchpad",
      "demo-dashboard",
      "demo-single",
      "documents/doklad",
    ]),
  },
  {
    label: "workspace",
    dir: join(APP_DIR, "workspace"),
    prefix: "/workspace",
    navPaths: navPathsFrom(wsHrefs, "/workspace"),
    // demo-inbox: saved dev-only demo (pre-stub Inbox mock UI), kept for
    // reference. organizations/new: the "add organization" create wizard —
    // reached from a button (companies view), an action route with no
    // sidebar-nav slot.
    hidden: new Set(["demo-inbox", "organizations/new"]),
  },
]

let failed = false
let totalRoutes = 0
let totalNav = 0
for (const tier of tiers) {
  const routes = new Set(routePaths(tier.dir))
  totalRoutes += routes.size
  totalNav += tier.navPaths.size

  const deadLinks = [...tier.navPaths].filter((path) => !routes.has(path))
  const orphanRoutes = [...routes].filter(
    (path) => !tier.navPaths.has(path) && !tier.hidden.has(path),
  )

  if (deadLinks.length > 0) {
    failed = true
    console.error(`[check-nav] (${tier.label}) nav hrefs with no route folder:`)
    for (const path of deadLinks) console.error(`  ${tier.prefix}/${path}`)
  }
  if (orphanRoutes.length > 0) {
    failed = true
    console.error(
      `[check-nav] (${tier.label}) route folders missing from nav (add to a nav.ts or HIDDEN_ROUTES):`,
    )
    for (const path of orphanRoutes) console.error(`  ${path || "(index)"}`)
  }
}

if (failed) process.exit(1)
console.log(
  `[check-nav] OK — ${totalRoutes} routes and ${totalNav} nav links in sync across org + workspace.`,
)
