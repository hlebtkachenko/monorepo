#!/usr/bin/env tsx
/**
 * `/o` nav-drift guard — the rebuilt org tree's own parity check.
 *
 * Kept SEPARATE from `scripts/check-nav.ts` (which imports the FROZEN old nav
 * and must not be touched during coexistence — see the new tree's README). This
 * one is self-contained (fs + regex, no app-module import), so it needs no
 * `@/*` alias resolution and can never couple to the old nav.
 *
 * It asserts two invariants over `apps/web/app/o/[orgSlug]`:
 *
 *   1. No dead links — every STATIC `orgHref(slug, "literal")` target resolves
 *      to a real `page.tsx`. This scans nav entries AND hardcoded shell chrome
 *      links (header actions, org switcher), the ones a nav-only check misses —
 *      exactly the settings-class links that used to point at a page that was
 *      being removed. A 1-arg `orgHref(slug)` targets the index (`""`). A call
 *      whose 2nd arg is not a string literal (`orgHref(slug, favorite.route)`)
 *      is dynamic by design and skipped.
 *
 *   2. No orphan pages — every `page.tsx` route is the target of some static
 *      link (nav or chrome) or is explicitly allowlisted. This is the guard that
 *      would have caught the unrequested `settings` page: a page reachable from
 *      nowhere in nav is an orphan and fails here until it is linked or
 *      allowlisted with a reason.
 *
 * README rule #4 ("every link goes through `orgHref`") is what makes the literal
 * scan a complete view of the tree's static links.
 *
 * Wired as the `org-new-nav-drift` lefthook pre-push hook (glob `app/o/**`),
 * mirroring `nav-drift`. Sub-second; runs where the source is present.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const TREE = join(here, "..", "apps", "web", "app", "o", "[orgSlug]")

/**
 * Routes a legitimately link-less page may occupy. Empty by design — add a
 * route here (with a one-line reason) only for a page reached purely
 * dynamically (e.g. a future detail/editor page opened from data, not nav).
 */
const ALLOWLIST = new Set<string>([
  // Redirect-only parent: the Archetype Table reference lives in its two
  // subpages (normal-table, pivot-table), which the nav links directly. The
  // bare route just `redirect()`s to normal-table, so it is link-less by design.
  "debug/archetype-table",
])

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

/** Every `*.ts(x)` file under the tree. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue
    const child = join(dir, name)
    if (statSync(child).isDirectory()) {
      out.push(...sourceFiles(child))
    } else if (/\.tsx?$/.test(name)) {
      out.push(child)
    }
  }
  return out
}

/**
 * Static `orgHref(...)` link targets across the tree. Matches `orgHref(<ident>)`
 * → `""` and `orgHref(<ident>, "literal")` → the literal (leading slash
 * stripped). A call whose 2nd arg is not a string literal produces no match, so
 * dynamic links are skipped. `[^,()]` on the first arg keeps the match anchored
 * to a single plain-identifier call.
 */
function staticLinkTargets(files: string[]): Set<string> {
  const targets = new Set<string>()
  const re =
    /orgHref\(\s*[^,()]+?\s*(?:,\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`))?\s*\)/g
  for (const file of files) {
    const src = readFileSync(file, "utf-8")
    let match: RegExpExecArray | null
    while ((match = re.exec(src)) !== null) {
      const literal = match[1] ?? match[2] ?? match[3] ?? ""
      targets.add(literal.replace(/^\/+/, ""))
    }
  }
  return targets
}

const routes = new Set(routePaths(TREE))
const links = staticLinkTargets(sourceFiles(TREE))

const deadLinks = [...links].filter((path) => !routes.has(path)).sort()
const orphanRoutes = [...routes]
  .filter((path) => !links.has(path) && !ALLOWLIST.has(path))
  .sort()

let failed = false
if (deadLinks.length > 0) {
  failed = true
  console.error("[check-org-new-nav] orgHref links with no page.tsx:")
  for (const path of deadLinks) console.error(`  /o/<slug>/${path}`)
}
if (orphanRoutes.length > 0) {
  failed = true
  console.error(
    "[check-org-new-nav] pages linked from nowhere (add a nav entry / link, or ALLOWLIST with a reason):",
  )
  for (const path of orphanRoutes) console.error(`  ${path || "(index)"}`)
}

if (failed) process.exit(1)
console.log(
  `[check-org-new-nav] OK — ${routes.size} pages and ${links.size} static links in sync.`,
)
