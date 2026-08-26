/**
 * Every static top-level route is a reserved organization slug.
 *
 * `/[orgSlug]` (PR 09) is a catch-all over the root of this app, and a static
 * route always beats it in Next's router. So the day someone adds
 * `app/nastaveni/page.tsx`, an organization whose slug is `nastaveni` becomes
 * permanently unreachable — its members land on the new page instead, and the
 * failure has no error message anywhere.
 *
 * The reserved list in `org-slug.ts` is written out (a runtime filesystem walk
 * would be slow, and wrong in a standalone build where `app/` is gone). THIS is
 * what keeps it honest: it derives the segments Next will actually serve from
 * the real tree and fails if one is missing from the list.
 *
 * Advisor carry-in from the PR 07 gate.
 */
import { readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { isReservedOrgSlug, isValidOrgSlugFormat } from "./org-slug"

const APP_ROOT = resolve(__dirname, "..", "..", "app")

/**
 * The static URL segments a directory contributes at ITS level.
 *
 *   `(group)`  a route group: contributes nothing itself, its children land at
 *              this level, so recurse and hoist.
 *   `_private` a private folder: never routable.
 *   `@slot`    a parallel route slot: not a path segment.
 *   `[param]`  a dynamic segment — including the catch-all this whole rule
 *              exists to protect. Not a static route, so not reserved.
 *   anything   a real static segment.
 *   else
 *
 * Files contribute nothing: `page.tsx` and `layout.tsx` are the folder's, and
 * `robots.ts` / `icon.svg` are metadata routes whose names contain a dot and so
 * can never collide with a slug (the DB CHECK forbids one).
 */
export function staticTopLevelSegments(dir: string): string[] {
  const segments: string[] = []
  for (const entry of readdirSync(dir)) {
    if (!statSync(join(dir, entry)).isDirectory()) continue
    if (entry.startsWith("_") || entry.startsWith("@")) continue
    if (entry.startsWith("[")) continue
    if (entry.startsWith("(") && entry.endsWith(")")) {
      segments.push(...staticTopLevelSegments(join(dir, entry)))
      continue
    }
    segments.push(entry)
  }
  return segments
}

const derived = staticTopLevelSegments(APP_ROOT).sort()

describe("reserved organization slugs", () => {
  it("derives the real route tree (non-vacuous)", () => {
    // If this list ever comes back empty the whole check would pass vacuously.
    expect(derived).toContain("admin")
    expect(derived).toContain("api")
    expect(derived).toContain("healthz")
    // Hoisted out of the `(auth)` route group.
    expect(derived).toContain("sign-in")
    expect(derived).toContain("setup")
    expect(derived).toContain("reset")
  })

  it("reserves every static top-level segment", () => {
    const missing = derived.filter((segment) => !isReservedOrgSlug(segment))
    expect(
      missing,
      `add these to RESERVED_ORG_SLUGS in lib/data/org-slug.ts: ${missing.join(", ")}`,
    ).toEqual([])
  })

  it("does not reserve a dynamic segment or a private folder", () => {
    expect(derived.some((segment) => segment.startsWith("["))).toBe(false)
    expect(derived.some((segment) => segment.startsWith("_"))).toBe(false)
    expect(derived.some((segment) => segment.startsWith("("))).toBe(false)
  })
})

describe("slug format", () => {
  it("mirrors the organization_slug_format CHECK", () => {
    for (const good of ["a", "a1", "firma", "firma-s-r-o", "x".repeat(64)]) {
      expect(isValidOrgSlugFormat(good), good).toBe(true)
    }
    for (const bad of [
      "",
      "-firma",
      "firma-",
      "Firma",
      "fir ma",
      "firma_sro",
      "../etc",
      "x".repeat(65),
    ]) {
      expect(isValidOrgSlugFormat(bad), bad || "<empty>").toBe(false)
    }
  })

  it("folds case before checking the reserved list", () => {
    expect(isReservedOrgSlug("ADMIN")).toBe(true)
    expect(isReservedOrgSlug("  admin  ")).toBe(true)
    expect(isReservedOrgSlug("administrativa")).toBe(false)
  })
})
