/**
 * SPEC §2.6.1 IS A WHITELIST, AND THIS IS THE THING THAT KEEPS IT ONE.
 *
 * The employee seat's rail is three entries — Přehled (personal) · Dokumenty
 * (own) · Moje mzda — and the sentence that follows them is "Everything else
 * 404." That is a claim about EVERY module under `app/(portal)/[orgSlug]`,
 * including the ones nobody has written yet: Finance still has four sidebar
 * leaves to land (§2.4), Asistent is a whole module away (§2.8), and each of
 * them is a company surface that a bricklayer with a portal login must not see.
 *
 * A rule enforced by "remember to call `assertNotEmployeeSeat`" is a rule that
 * survives exactly as long as the next contributor's memory. So this fence walks
 * the route tree and requires EVERY module directory under `[orgSlug]` to be
 * one of three things:
 *
 *   1. GATED — its module root (`layout.tsx`, or its only `page.tsx`) calls
 *      `assertNotEmployeeSeat`. A Next layout renders for every nested route, so
 *      one call covers the subtree.
 *   2. OWNER-ONLY — its root calls `requireOwner`, which already refuses every
 *      `guest` including a seat, so a second gate would be noise.
 *   3. ALLOWLISTED below, with a reason, because the seat is entitled to it.
 *
 * A NEW MODULE FAILS THIS TEST BY DEFAULT, which is the direction that matters:
 * the author has to make a deliberate decision about the seat and write it down,
 * instead of shipping a leak by omission.
 *
 * WHY IT PARSES THE AST rather than grepping for the identifier: a call spelled
 * inside a comment, a string, or an import it never makes would satisfy a grep.
 * The parser only counts a real call expression.
 *
 * IT IS A SOURCE-TREE FENCE, so it lives in the `pure` vitest project and needs
 * no database — the same shape as `scope-brand-fence.boundary.test.ts` and
 * `db-client-fence.boundary.test.ts`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const BETA_ROOT = resolve(__dirname, "..", "..")
const ORG_TREE = join(BETA_ROOT, "app", "(portal)", "[orgSlug]")

/** The gates that count. Either one refuses an employee seat. */
const SEAT_GATES = new Set(["assertNotEmployeeSeat", "requireOwner"])

/**
 * The three surfaces spec §2.6.1 grants the seat, each with the reason it is
 * safe — which is never "it has no company data on it", but always "the DATA
 * LAYER narrows it for this viewer".
 */
const SEAT_REACHABLE: Record<string, string> = {
  /**
   * Dokumenty (own): filter 5 of `visibleDocuments` restricts every read in
   * `lib/data/documents.ts` to `uploaded_by_user_id = scope.userId` for a seat.
   * The two company sub-tabs (`firma`, `stavby`) are gated individually and are
   * asserted separately below.
   */
  dokumenty: "spec §2.6.1 — Dokumenty (own uploads), narrowed by filter 5",
  /**
   * Mzdy: the layout admits `all` and `employee` and refuses `none`; each leaf
   * then requires one specific arm, so only `moje-mzda` renders for a seat.
   * Asserted separately below.
   */
  mzdy: "spec §2.6.1 — Moje mzda, gated per leaf by payrollScope",
  /**
   * Nastavení: the seat keeps Účet (its own password and second factor) and is
   * refused Společnost by that page's own gate. Lidé already 404s for any guest
   * through `peopleForScope`. Asserted separately below.
   */
  nastaveni: "spec §2.6.1 exception — Účet is the viewer, not the company",
}

/** Module roots that are pages rather than layouts get checked as pages. */
function moduleRootFiles(dir: string): string[] {
  return ["layout.tsx", "page.tsx"]
    .map((name) => join(dir, name))
    .filter((file) => existsSync(file))
}

function callsAnyGate(file: string): boolean {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (ts.isIdentifier(callee) && SEAT_GATES.has(callee.text)) {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function moduleDirectories(): string[] {
  return (
    readdirSync(ORG_TREE, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      // `_components`, `_lib`, `_nav`, `_actions` are not routes.
      .filter((entry) => !entry.name.startsWith("_"))
      .map((entry) => entry.name)
  )
}

describe("employee-seat fence — spec §2.6.1 'Everything else 404'", () => {
  it("finds the org route tree it is meant to be walking", () => {
    // A rename of `app/(portal)/[orgSlug]` would otherwise make every assertion
    // below vacuously pass over an empty list.
    const modules = moduleDirectories()
    expect(modules.length).toBeGreaterThan(4)
    expect(modules).toContain("mzdy")
    expect(modules).toContain("dokumenty")
  })

  it("gates every org-tier module against the employee seat", () => {
    const ungated: string[] = []

    for (const name of moduleDirectories()) {
      if (name in SEAT_REACHABLE) continue

      const roots = moduleRootFiles(join(ORG_TREE, name))
      if (roots.length === 0) {
        ungated.push(`${name} (no layout.tsx or page.tsx at the module root)`)
        continue
      }
      if (!roots.some(callsAnyGate)) {
        ungated.push(
          `${name} (module root calls neither assertNotEmployeeSeat nor requireOwner)`,
        )
      }
    }

    expect(
      ungated,
      "every module under [orgSlug] must refuse the employee seat at its root, " +
        "or be added to SEAT_REACHABLE with the reason it is safe",
    ).toEqual([])
  })

  it("gates the company sub-tabs of Dokumenty, which the seat DOES reach", () => {
    // `dokumenty` is allowlisted at the module root because the seat is
    // entitled to its own uploads. Its two COMPANY tabs are not, and their
    // narrowing is a page-level gate rather than a data-layer filter.
    for (const leaf of ["firma", "stavby"]) {
      const file = join(ORG_TREE, "dokumenty", leaf, "page.tsx")
      expect(existsSync(file), `${leaf} page exists`).toBe(true)
      expect(callsAnyGate(file), `dokumenty/${leaf} refuses the seat`).toBe(
        true,
      )
    }
  })

  it("gates Nastavení › Společnost, which the seat DOES reach the section of", () => {
    const file = join(ORG_TREE, "nastaveni", "spolecnost", "page.tsx")
    expect(callsAnyGate(file)).toBe(true)
  })

  it("requires every Mzdy leaf to name the payroll arm it serves", () => {
    // Mzdy is allowlisted, so the module-root walk skips it — but its layout
    // deliberately admits BOTH `all` and `employee`, which means each leaf is
    // its own gate. A leaf that tested nothing would render a management page
    // for an employee seat.
    const mzdy = join(ORG_TREE, "mzdy")
    const leaves = readdirSync(mzdy, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => entry.name)

    // The module root (Přehled mezd) plus every leaf directory.
    const pages = [join(mzdy, "page.tsx")].concat(
      leaves.map((leaf) => join(mzdy, leaf, "page.tsx")),
    )

    const missing = pages.filter((file) => {
      const text = readFileSync(file, "utf8")
      return !text.includes("payrollScope(scope)")
    })

    expect(
      missing.map((file) => relative(BETA_ROOT, file)),
      "every Mzdy page must gate on payrollScope: management leaves on " +
        "`kind !== 'all'`, moje-mzda on `kind !== 'employee'`",
    ).toEqual([])
  })
})
