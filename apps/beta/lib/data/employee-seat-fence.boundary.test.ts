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
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const BETA_ROOT = resolve(__dirname, "..", "..")
const ORG_TREE = join(BETA_ROOT, "app", "(portal)", "[orgSlug]")

/**
 * The gates that count — each one refuses an employee seat, by a different
 * route.
 *
 *   assertNotEmployeeSeat    — this PR's gate: refuses the seat and nobody else.
 *   requireOwner             — owner-only surfaces (Pro účetní). A seat is a
 *                              `guest`, so it is already refused; a second gate
 *                              would be noise.
 *   assertAssistantAvailable — Asistent (PR 36). Spec §2.8 hides the module from
 *                              "guest and employee seat", and it implements that
 *                              by admitting only owner/admin/member. A seat is a
 *                              `guest`, so the exclusion covers it — which
 *                              `refuses a guest, and therefore a seat` below
 *                              pins, so this entry cannot go stale if that role
 *                              set is ever widened.
 */
const SEAT_GATES = new Set([
  "assertNotEmployeeSeat",
  "requireOwner",
  "assertAssistantAvailable",
])

/**
 * The failure text is DERIVED from `SEAT_GATES` rather than spelled out beside
 * it. The hand-written version said "calls neither assertNotEmployeeSeat nor
 * requireOwner" and stayed that way when `assertAssistantAvailable` was added —
 * so the one sentence a failing contributor reads listed two of the three gates
 * and quietly hid the third. A message that cannot disagree with the set it
 * describes is the fix; adding a fourth gate now updates the diagnostic for
 * free.
 */
const GATE_LIST = [...SEAT_GATES].join(" / ")

/** Mzdy's leaves gate on the payroll arm instead — see the last case in this file. */
const PAYROLL_GATE = new Set(["payrollScope"])

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

/**
 * Leaves INSIDE an allowlisted module.
 *
 * Allowlisting a module root says the seat may reach the module; it says
 * nothing about what hangs under it. The previous version of this fence checked
 * the three leaf names that happened to exist the day it was written
 * (`dokumenty/firma`, `dokumenty/stavby`, `nastaveni/spolecnost`) — a leaf added
 * afterwards was covered by nothing at all, inside precisely the three modules
 * a seat can walk into. Every leaf under an allowlisted module is now walked and
 * must either call a gate or be listed here with the reason.
 *
 * `mzdy` is exempt from THIS list because its leaves are gated on a different
 * axis — the payroll arm — and have their own case below.
 */
const SEAT_REACHABLE_LEAVES: Record<string, string> = {
  "nastaveni/ucet":
    "spec §2.6.1 exception — the viewer's own password and second factor",
  "nastaveni/lide":
    "`peopleForScope` 404s for every guest, seat included — a data-layer refusal, not a page gate",
}

/** Module roots that are pages rather than layouts get checked as pages. */
function moduleRootFiles(dir: string): string[] {
  return ["layout.tsx", "page.tsx"]
    .map((name) => join(dir, name))
    .filter((file) => existsSync(file))
}

function parseTsx(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
}

/**
 * Does this file contain a REAL call to one of `names`?
 *
 * `accept` narrows further where the argument matters — the payroll arm cares
 * that the call is `payrollScope(scope)` and not `payrollScope(somethingElse)`.
 */
function callsAnyOf(
  file: string,
  names: ReadonlySet<string>,
  accept: (call: ts.CallExpression) => boolean = () => true,
): boolean {
  const source = parseTsx(file)

  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      if (ts.isIdentifier(callee) && names.has(callee.text) && accept(node)) {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function callsAnyGate(file: string): boolean {
  return callsAnyOf(file, SEAT_GATES)
}

/**
 * Is this leaf refused, by its own page or by a layout ABOVE it inside the
 * module?
 *
 * A sub-layout is a real gate — Next renders it for the whole subtree — so
 * demanding the call on the page itself would push a contributor into writing a
 * redundant second check, and the usual outcome of a fence that asks for
 * redundant work is a contributor who deletes the case instead. The module root
 * is excluded from the walk: the module is on `SEAT_REACHABLE` precisely because
 * its root does NOT refuse the seat.
 */
function leafIsGated(leaf: string): boolean {
  if (callsAnyGate(join(ORG_TREE, leaf, "page.tsx"))) return true

  const segments = leaf.split("/")
  // Start below the module root, stop above the leaf's own directory.
  for (let depth = 2; depth <= segments.length; depth += 1) {
    const layout = join(ORG_TREE, ...segments.slice(0, depth), "layout.tsx")
    if (existsSync(layout) && callsAnyGate(layout)) return true
  }
  return false
}

/**
 * Every route leaf under `dir`, as a path relative to the org tree — nested and
 * dynamic segments included. A one-level `readdirSync` finds `mzdy/vyplatnice`
 * and stops; it does not find `finance/partneri/[partnerId]`, and a dynamic
 * segment is exactly where a row id arrives from a URL a seat can type.
 */
function routeLeaves(dir: string, prefix: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue
    const child = join(dir, entry.name)
    const rel = `${prefix}/${entry.name}`
    if (existsSync(join(child, "page.tsx"))) found.push(rel)
    found.push(...routeLeaves(child, rel))
  }
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

      const dir = join(ORG_TREE, name)
      const roots = moduleRootFiles(dir)
      if (roots.length === 0) {
        ungated.push(`${name} (no layout.tsx or page.tsx at the module root)`)
        continue
      }
      if (!roots.some(callsAnyGate)) {
        ungated.push(`${name} (module root calls none of ${GATE_LIST})`)
        continue
      }

      // A LAYOUT covers its whole subtree. A PAGE covers exactly one route —
      // its own — so a module gated only by `page.tsx` leaves every nested leaf
      // under it with nothing between the seat and the data: `majetek/[assetId]`
      // and `finance/partneri/[partnerId]` are that shape of route, and both are
      // safe today only because their modules happen to gate in a layout. The
      // check above cannot see the difference; it accepts either root file and
      // calls the module done. This is the case that notices, and the leak it
      // catches is the invisible kind — the module still passes.
      if (!existsSync(join(dir, "layout.tsx"))) {
        const leaking = routeLeaves(dir, name).filter(
          (leaf) => !callsAnyGate(join(ORG_TREE, leaf, "page.tsx")),
        )
        if (leaking.length > 0) {
          ungated.push(
            `${name} (gated by page.tsx only, which does not cover its nested leaves: ${leaking.join(", ")})`,
          )
        }
      }
    }

    expect(
      ungated,
      "every module under [orgSlug] must refuse the employee seat at its root, " +
        "or be added to SEAT_REACHABLE with the reason it is safe",
    ).toEqual([])
  })

  it("counts a real call and not a mention of one (non-vacuous)", () => {
    // The upgrade this case pins: `text.includes("payrollScope(scope)")` was
    // satisfied by prose. Written to a temp file rather than asserted against a
    // string, because `callsAnyOf` is what the fence actually runs and reading
    // the file is half of it.
    const dir = mkdtempSync(join(tmpdir(), "seat-fence-"))
    const write = (name: string, source: string): string => {
      const file = join(dir, name)
      writeFileSync(file, source, "utf8")
      return file
    }

    const prose = write(
      "prose.tsx",
      `/** This page used to call payrollScope(scope); it no longer does. */
       const label = "assertNotEmployeeSeat"
       export default function Page() { return null }`,
    )
    expect(callsAnyOf(prose, PAYROLL_GATE)).toBe(false)
    expect(callsAnyGate(prose)).toBe(false)

    const real = write(
      "real.tsx",
      `export default function Page({ scope }) {
         if (payrollScope(scope).kind !== "all") notFound()
         return null
       }`,
    )
    expect(callsAnyOf(real, PAYROLL_GATE)).toBe(true)

    // And the argument narrowing is not decorative either.
    const wrongArgument = write(
      "wrong-arg.tsx",
      `export default function Page() { return payrollScope(someoneElse) }`,
    )
    const scopeArgument = (call: ts.CallExpression): boolean => {
      const [argument] = call.arguments
      return (
        argument !== undefined &&
        ts.isIdentifier(argument) &&
        argument.text === "scope"
      )
    }
    expect(callsAnyOf(wrongArgument, PAYROLL_GATE, scopeArgument)).toBe(false)
    expect(callsAnyOf(real, PAYROLL_GATE, scopeArgument)).toBe(true)

    rmSync(dir, { recursive: true, force: true })
  })

  it("finds the leaves inside the allowlisted modules (non-vacuous)", () => {
    // The leaf walk below is a filter over this list. If `routeLeaves` ever
    // returned nothing — a rename, a `_`-prefix convention change — every leaf
    // assertion would pass over an empty set and say so cheerfully.
    const leaves = Object.keys(SEAT_REACHABLE).flatMap((name) =>
      routeLeaves(join(ORG_TREE, name), name),
    )
    expect(leaves).toContain("dokumenty/firma")
    expect(leaves).toContain("dokumenty/stavby")
    expect(leaves).toContain("nastaveni/spolecnost")
    expect(leaves).toContain("nastaveni/ucet")
    expect(leaves).toContain("mzdy/moje-mzda")
  })

  it("gates every leaf inside an allowlisted module", () => {
    const ungated: string[] = []

    for (const name of Object.keys(SEAT_REACHABLE)) {
      // Mzdy's leaves are gated on the payroll arm rather than on a seat gate,
      // and have their own case at the bottom of this file.
      if (name === "mzdy") continue
      for (const leaf of routeLeaves(join(ORG_TREE, name), name)) {
        if (leaf in SEAT_REACHABLE_LEAVES) continue
        if (!leafIsGated(leaf)) ungated.push(leaf)
      }
    }

    expect(
      ungated,
      `every leaf under an allowlisted module must call one of ${GATE_LIST}, ` +
        "or be listed in SEAT_REACHABLE_LEAVES with the reason the seat is entitled to it",
    ).toEqual([])
  })

  it("keeps the accepted gate set to exactly these three", () => {
    // `GATE_LIST` deriving the DIAGNOSTIC from `SEAT_GATES` fixed a stale
    // message and created a smaller version of the same problem: adding a name
    // to the set now updates its own error text, so a gate that refuses nobody
    // would be accepted AND described as if it were fine. Each of these three
    // is admissible for a reason argued in the header, and two of them are
    // pinned by their own cases below (`requireOwner` refuses guests,
    // `assertAssistantAvailable` excludes them). Widening the set is a decision,
    // so it is a diff a reviewer sees.
    expect([...SEAT_GATES].sort()).toEqual([
      "assertAssistantAvailable",
      "assertNotEmployeeSeat",
      "requireOwner",
    ])
  })

  it("keeps the Nastavení exception to exactly Účet and Lidé", () => {
    // §2.6.1 grants the seat ONE Nastavení surface, and `lide` sits beside it
    // for a different reason (it refuses every guest in the data layer, not at
    // the page). Pinning the list makes a widened exception a diff a reviewer
    // sees, rather than one more key in a map nobody reads.
    expect(Object.keys(SEAT_REACHABLE_LEAVES).sort()).toEqual([
      "nastaveni/lide",
      "nastaveni/ucet",
    ])
  })

  it("keeps Asistent's own gate exclusive of guests, and therefore of seats", () => {
    // `SEAT_GATES` accepts `assertAssistantAvailable` on the strength of ONE
    // fact: its role set excludes `guest`. That fact lives in another module and
    // another PR's head, so it is asserted here rather than assumed — widening
    // `ASSISTANT_ROLES` to admit a guest would silently turn this fence's
    // acceptance of that gate into a hole, and would fail this case first.
    const source = readFileSync(
      join(BETA_ROOT, "lib", "data", "assistant.ts"),
      "utf8",
    )
    const roles = /const ASSISTANT_ROLES = new Set\(\[([^\]]*)\]\)/.exec(source)

    expect(
      roles,
      "ASSISTANT_ROLES still declared as a literal Set",
    ).not.toBeNull()
    expect(roles?.[1]).not.toContain("guest")
    expect(roles?.[1]).toContain("owner")
  })

  it("requires every Mzdy leaf to name the payroll arm it serves", () => {
    // Mzdy is allowlisted, so the module-root walk skips it — but its layout
    // deliberately admits BOTH `all` and `employee`, which means each leaf is
    // its own gate. A leaf that tested nothing would render a management page
    // for an employee seat.
    //
    // THIS IS AN AST CHECK, not `text.includes("payrollScope(scope)")`. Half the
    // pages in this module discuss `payrollScope(scope)` at length in their
    // header comments — `mzdy/layout.tsx` spells the exact call inside a
    // sentence about what it does NOT do — so a page that deleted its gate and
    // kept its prose passed the substring test with room to spare. A parser
    // counts the call and ignores the essay.
    const pages = [join(ORG_TREE, "mzdy", "page.tsx")].concat(
      routeLeaves(join(ORG_TREE, "mzdy"), "mzdy").map((leaf) =>
        join(ORG_TREE, leaf, "page.tsx"),
      ),
    )
    expect(pages.length).toBeGreaterThan(4)

    const missing = pages.filter(
      (file) =>
        !callsAnyOf(
          file,
          PAYROLL_GATE,
          // `payrollScope(scope)` and nothing else: passing some other object
          // would answer a question about a viewer this request is not.
          (call) => {
            const [argument] = call.arguments
            return (
              argument !== undefined &&
              ts.isIdentifier(argument) &&
              argument.text === "scope"
            )
          },
        ),
    )

    expect(
      missing.map((file) => relative(BETA_ROOT, file)),
      "every Mzdy page must gate on payrollScope(scope): management leaves on " +
        "`kind !== 'all'`, moje-mzda on `kind !== 'employee'`",
    ).toEqual([])
  })
})

/**
 * SF-5 CARRY-IN — THE ROUTE WALK ABOVE SEES PAGES, AND THE SEAT ALSO HAS A
 * NETWORK.
 *
 * `app/api/orgs/[orgSlug]/**` is a second, complete surface onto the same
 * tenant: a signed-in seat can `fetch()` every one of these handlers with a
 * hand-typed URL and no page in the way. The module walk never looked at them,
 * so a route added with no narrowing at all would have failed nothing.
 *
 * These handlers do NOT gate the way pages do, and requiring them to would be
 * dishonest: none of them calls `assertNotEmployeeSeat`, because each one is a
 * thin wrapper over a data-layer function that already narrows for the viewer
 * (`uploadDocument` refuses through `canUploadDocuments`, `listDocuments` and
 * `openDocumentFile` narrow through filter 5 of `visibleDocuments`,
 * `openPayslipFile` gates on `payrollScope`, Asistent asks `assistantVisibleTo`,
 * and the payslip UPLOAD is owner-only). Enforcing "call a page gate" would push
 * contributors into adding a redundant second check, or into deleting the case.
 *
 * So the fence is a REGISTRATION: every route under `orgs/[orgSlug]` names the
 * narrowing it leans on, that name is checked to be a real call in the handler,
 * and a route with no entry fails by default — the same direction as the module
 * walk. What it cannot prove is that the named function narrows correctly; that
 * is what `documents.test.ts`, `payslips.test.ts` and `assistant.test.ts` are
 * for. What it does prove is that no route reaches the tenant with NOTHING.
 */
const API_ROOT = join(BETA_ROOT, "app", "api")
const API_TREE = join(API_ROOT, "orgs", "[orgSlug]")

/**
 * Route handlers Next will serve. Matching the literal string `route.ts` misses
 * `route.tsx` and both JavaScript spellings — all four are handlers Next mounts,
 * and a fence that a file extension walks past is a fence with a documented
 * bypass.
 */
const ROUTE_FILE = /^route\.(ts|tsx|js|jsx)$/

/**
 * Trees under `app/api` that this fence deliberately does not walk, each with
 * the premise that makes it safe. Asserted below, so an exemption cannot
 * quietly grow to cover a route it was never argued for.
 */
const API_EXEMPT: Record<string, string> = {
  /**
   * The agent ingestion API authenticates with an API KEY, not a session:
   * `resolveAgentScope` hashes the bearer credential and derives an
   * `OwnerScope` from the key's own organization. An employee seat has no key
   * and cannot mint one, so there is no session for a seat gate to inspect and
   * nothing here a seat can reach. Pinned by `agent-api.test.ts`.
   */
  "agent/v1": "key-authenticated (resolveAgentScope), not session-scoped",
  /**
   * Better Auth's own catch-all — sign-in, sign-out, TOTP. It predates every
   * scope in this app and is the thing a seat uses to HAVE a session.
   */
  "auth/[...all]":
    "Better Auth's own handler; no organization scope exists yet",
}

const API_SEAT_NARROWING: Record<string, readonly string[]> = {
  /** Spec §2.8 — `assistantVisibleTo` admits owner/admin/member, so a guest 404s. */
  "asistent/route.ts": ["assistantVisibleTo"],
  /**
   * POST is `uploadDocument` (refuses through `canUploadDocuments`, and stamps
   * `uploaded_by_user_id` on what it does accept); GET is `listDocuments`, whose
   * rows come from `visibleDocuments` filter 5.
   */
  "documents/route.ts": ["uploadDocument", "listDocuments"],
  /** The bytes behind one row — `openDocumentFile` applies the same filter 5. */
  "documents/[documentId]/file/route.ts": ["openDocumentFile"],
  /** Payslip upload is the office's write: owner-only, outright. */
  "payroll/payslips/route.ts": ["requireOwner"],
  /** `openPayslipFile` gates on `payrollScope`, so a seat gets its own payslip and no other. */
  "payroll/payslips/[documentId]/file/route.ts": ["openPayslipFile"],
}

function apiRoutes(dir: string, prefix = ""): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory())
      found.push(...apiRoutes(join(dir, entry.name), rel))
    else if (ROUTE_FILE.test(entry.name)) found.push(rel)
  }
  return found
}

/** The route's directory, which is what an exemption is stated against. */
const routeDir = (route: string): string =>
  route.split("/").slice(0, -1).join("/")

describe("employee-seat fence — the org API surface", () => {
  it("finds the org API tree it is meant to be walking", () => {
    const routes = apiRoutes(API_TREE)
    expect(routes.length).toBeGreaterThan(3)
    expect(routes).toContain("documents/route.ts")
  })

  /**
   * WALKING `orgs/[orgSlug]` ONLY WAS ITSELF A DODGE. A new session-scoped
   * handler mounted anywhere else under `app/api` — `app/api/payroll/`,
   * `app/api/export/` — is exactly the surface this fence exists for, and it
   * would have been invisible because the walk started one directory too deep.
   *
   * So the walk starts at `app/api` and every route is either registered above
   * or covered by a STATED exemption whose premise is asserted, rather than by
   * the accident of where the old walk began.
   */
  it("accounts for every route under app/api, registered or exempt", () => {
    const unaccounted = apiRoutes(API_ROOT).filter((route) => {
      const dir = routeDir(route)
      // SEGMENT-WISE, not string-wise. `dir.startsWith("agent/v1")` also
      // matches `agent/v10`, so the day a v10 is mounted it would silently
      // inherit v1's key-authentication exemption without anyone arguing for it.
      if (
        Object.keys(API_EXEMPT).some(
          (tree) => dir === tree || dir.startsWith(`${tree}/`),
        )
      ) {
        return false
      }
      const underOrgs = route.startsWith("orgs/[orgSlug]/")
      return (
        !underOrgs ||
        !(route.slice("orgs/[orgSlug]/".length) in API_SEAT_NARROWING)
      )
    })

    expect(
      unaccounted,
      "a route handler under app/api must either be registered in " +
        "API_SEAT_NARROWING or sit under a tree listed in API_EXEMPT with the " +
        "premise that makes it safe",
    ).toEqual([])
  })

  it("holds the premise under each API exemption", () => {
    // An exemption is a claim about HOW a tree authenticates. Both claims live
    // in another module, so they are checked rather than trusted — the agent
    // arm resolving a scope from a hashed key rather than a session is the only
    // reason a seat cannot reach it.
    // `authenticateAgent` is the door every agent route goes through, and the
    // premise is that it resolves a scope from a HASHED KEY rather than from a
    // session — which is why no seat can arrive here at all.
    const agentAuth = readFileSync(
      join(BETA_ROOT, "lib", "agent", "auth.ts"),
      "utf8",
    )
    expect(agentAuth).toMatch(/resolveAgentScope/)
    expect(agentAuth).toMatch(/hashAgentKey/)

    // Two entrypoints, both key-authenticated: `meta` calls the door directly,
    // and every org-scoped ingest route goes through `handleAgentIngest`, which
    // is checked here to call it rather than assumed to.
    const agentEntrypoints = new Set(["authenticateAgent", "handleAgentIngest"])
    expect(
      callsAnyOf(
        join(BETA_ROOT, "lib", "agent", "route.ts"),
        new Set(["authenticateAgent"]),
      ),
      "handleAgentIngest authenticates before it ingests",
    ).toBe(true)

    const agentRoutes = apiRoutes(join(API_ROOT, "agent"))
    expect(agentRoutes.length).toBeGreaterThan(5)
    for (const route of agentRoutes) {
      const file = join(API_ROOT, "agent", ...route.split("/"))
      expect(
        callsAnyOf(file, agentEntrypoints),
        `${route} authenticates by key, which is what its exemption claims`,
      ).toBe(true)
    }

    // And no exemption silently covers the org tree it was never argued for.
    for (const tree of Object.keys(API_EXEMPT)) {
      expect(tree.startsWith("orgs/")).toBe(false)
    }
  })

  it("matches every spelling of a route file Next will mount", () => {
    // `route.ts` as a literal string is a fence with a documented bypass:
    // rename to `route.tsx` and the walk stops seeing the handler.
    for (const name of ["route.ts", "route.tsx", "route.js", "route.jsx"]) {
      expect(ROUTE_FILE.test(name), name).toBe(true)
    }
    for (const name of ["route.test.ts", "routes.ts", "my-route.ts"]) {
      expect(ROUTE_FILE.test(name), name).toBe(false)
    }
  })

  it("registers a narrowing for every org-scoped API route", () => {
    const unregistered = apiRoutes(API_TREE).filter(
      (route) => !(route in API_SEAT_NARROWING),
    )
    expect(
      unregistered,
      "a new route under app/api/orgs/[orgSlug] must be added to " +
        "API_SEAT_NARROWING, naming the data-layer function that narrows it " +
        "for an employee seat",
    ).toEqual([])
  })

  it("calls the narrowing each route claims", () => {
    // The registration is only worth the paper it is written on if the named
    // function is actually reached. A route that kept its entry and dropped the
    // call would otherwise pass forever.
    const broken: string[] = []
    for (const [route, names] of Object.entries(API_SEAT_NARROWING)) {
      const file = join(API_TREE, ...route.split("/"))
      expect(existsSync(file), `${route} exists`).toBe(true)
      for (const name of names) {
        if (!callsAnyOf(file, new Set([name]))) {
          broken.push(`${route} no longer calls ${name}`)
        }
      }
    }
    expect(broken).toEqual([])
  })

  it("resolves the scope from the URL segment in every route (non-vacuous)", () => {
    // Every handler above narrows against a scope, and every one of them gets
    // that scope from `resolveOrgScope(orgSlug)` — which is what turns "the URL
    // named an org" into "this session has a membership there". A handler that
    // built a scope some other way would not be covered by any of the reasoning
    // above, so the shared premise is asserted rather than assumed.
    const missing = apiRoutes(API_TREE).filter(
      (route) =>
        !callsAnyOf(
          join(API_TREE, ...route.split("/")),
          new Set(["resolveOrgScope"]),
        ),
    )
    expect(missing).toEqual([])
  })
})

/**
 * SF-5, THE THIRD SURFACE — AND THE ONE THE WALKER WAS STRUCTURALLY BLIND TO.
 *
 * A `"use server"` module is a set of PUBLIC POST ENDPOINTS with generated
 * names. `lib/data/office/office.test.ts` says why that matters in one
 * sentence: an action "does not run the layout that rendered its form, so 'the
 * page is behind a gate' says nothing about whether the ACTION is".
 *
 * The route walk cannot see them by construction — every one lives in an
 * `_actions/` directory, and `moduleDirectories` / `routeLeaves` skip
 * `_`-prefixed folders precisely because they are not routes. They are not
 * routes. They are still endpoints.
 *
 * Nothing here is a live hole: all seventeen modules gate correctly today. This
 * is the anti-rot half — an eighteenth added with only `requireScope` (which
 * proves membership and nothing about ROLE, so it admits a seat) fails by
 * default instead of shipping.
 *
 * FOUR ACCEPTED SHAPES, because these modules genuinely gate four ways:
 *   1. a `SEAT_GATES` member — `requireOwner`, `assertAssistantAvailable`;
 *   2. a registered narrowing in `ACTION_SEAT_NARROWING`, whose own refusal is
 *      asserted below rather than taken on trust;
 *   3. no exported function at all — the `state.ts` shims are type re-export
 *      files (a `"use server"` module may only export async functions, which is
 *      why they exist), so there is no endpoint to gate.
 */
const ACTION_SEAT_NARROWING: Record<string, readonly string[]> = {
  /**
   * `managesPeople` admits owner | admin only, so every guest — seat included —
   * is refused before any membership is read or written.
   */
  "nastaveni/_actions/people.ts": ["managesPeople"],
  /**
   * Delegates to `inviteEmployeeSeat`, which gates on `mayInviteEmployeeSeat`
   * (owner | admin) AND `payrollScope(scope).kind === "all"` — its own header
   * calls those gates 1 and 2 of three.
   */
  "mzdy/_actions/employee-seat.ts": ["inviteEmployeeSeat"],
}

/**
 * The `"use server"` directive, and everything Next lets sit in front of it.
 *
 * A directive prologue may be preceded by comments of BOTH kinds. Allowing only
 * `/* *\/` meant one `// eslint-disable` or one `// TODO` above the directive
 * took the whole module out of the walk — a bypass a contributor could hit by
 * accident, which is the worst kind.
 */
const USE_SERVER = /^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*["']use server["']/

function serverActionModules(dir: string, prefix = ""): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      found.push(...serverActionModules(join(dir, entry.name), rel))
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      USE_SERVER.test(readFileSync(join(dir, entry.name), "utf8"))
    ) {
      found.push(rel)
    }
  }
  return found
}

/**
 * Does this module export a function at all — i.e. is there an endpoint?
 *
 * BOTH SPELLINGS. `export async function a() {}` and `export const a = async
 * () => {}` are the same endpoint to Next, and counting only the declaration
 * form meant an arrow-const module reported "no endpoint here" and was skipped
 * by the gate walk entirely.
 */
function exportsAFunction(file: string): boolean {
  const isExported = (
    modifiers: ts.NodeArray<ts.ModifierLike> | undefined,
  ): boolean =>
    modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    ) === true

  return parseTsx(file).statements.some((statement) => {
    if (ts.isFunctionDeclaration(statement)) {
      return isExported(statement.modifiers)
    }
    if (ts.isVariableStatement(statement)) {
      return (
        isExported(statement.modifiers) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            declaration.initializer !== undefined &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer)),
        )
      )
    }
    return false
  })
}

describe("employee-seat fence — Server Actions are endpoints too", () => {
  it("finds the action modules it is meant to be walking", () => {
    const modules = serverActionModules(ORG_TREE)
    expect(modules.length).toBeGreaterThanOrEqual(11)
    expect(modules).toContain("nastaveni/_actions/people.ts")
    expect(modules).toContain("pro-ucetni/_actions/uzaverka.ts")
    expect(modules.every((file) => file.includes("/_actions/"))).toBe(true)
  })

  it("gates every Server Action module against the employee seat", () => {
    const ungated: string[] = []

    for (const module of serverActionModules(ORG_TREE)) {
      const file = join(ORG_TREE, ...module.split("/"))
      if (!exportsAFunction(file)) continue
      if (callsAnyGate(file)) continue

      const registered = ACTION_SEAT_NARROWING[module]
      if (
        registered &&
        registered.every((n) => callsAnyOf(file, new Set([n])))
      ) {
        continue
      }
      ungated.push(module)
    }

    expect(
      ungated,
      `every "use server" module under [orgSlug] must call one of ${GATE_LIST}, ` +
        "or be registered in ACTION_SEAT_NARROWING with the narrowing it leans " +
        "on. `requireScope` alone is NOT a gate: it proves membership, and an " +
        "employee seat has one.",
    ).toEqual([])
  })

  it("holds the premise under each registered action narrowing", () => {
    // Both narrowings live in other modules. Widening either would turn this
    // fence's acceptance into a hole, and would fail here first.
    const invitePolicy = readFileSync(
      join(BETA_ROOT, "lib", "auth", "invite-policy.ts"),
      "utf8",
    )
    const managesPeople = /export function managesPeople[\s\S]{0,400}?\n}/.exec(
      invitePolicy,
    )
    expect(
      managesPeople,
      "managesPeople is still a function here",
    ).not.toBeNull()
    expect(managesPeople?.[0]).not.toContain("guest")

    // The seat-invite door gates on the payroll arm as well as the role.
    const seatInvite = join(BETA_ROOT, "lib", "data", "employee-seat.ts")
    expect(callsAnyOf(seatInvite, new Set(["mayInviteEmployeeSeat"]))).toBe(
      true,
    )
    expect(callsAnyOf(seatInvite, new Set(["payrollScope"]))).toBe(true)
  })

  it("reads the DIRECTIVE, not a mention of it in prose (non-vacuous)", () => {
    // The same lesson as the Mzdy arm, found the same way. Grepping for
    // `"use server"` returns seventeen files here; six of them are the
    // `state.ts` type modules, which contain the phrase only inside a comment
    // explaining why they exist ("a `"use server"` file may only export async
    // functions, so a type ... has to live somewhere else"). Those six are not
    // endpoints, and a fence that demanded a seat gate from them would be
    // demanding it from a type re-export.
    const dir = mkdtempSync(join(tmpdir(), "directive-fence-"))
    const write = (name: string, source: string): string => {
      writeFileSync(join(dir, name), source, "utf8")
      return name
    }

    write(
      "prose.ts",
      `/** A "use server" file may only export async functions. */
       export type State = { ok: boolean }`,
    )
    write("real.ts", `"use server"\nexport async function a() {}`)
    write(
      "after-docblock.ts",
      `/* leading block */\n"use server"\nexport async function b() {}`,
    )
    // A directive prologue may be preceded by comments of BOTH kinds. One
    // `// eslint-disable` above the directive used to take a whole module out
    // of the walk.
    write(
      "after-line-comment.ts",
      `// eslint-disable-next-line\n// TODO: split this up\n"use server"\nexport async function c() {}`,
    )

    expect(serverActionModules(dir).sort()).toEqual([
      "after-docblock.ts",
      "after-line-comment.ts",
      "real.ts",
    ])

    rmSync(dir, { recursive: true, force: true })
  })

  it("counts an arrow-const export as an endpoint (non-vacuous)", () => {
    // `export const a = async () => {}` is the same endpoint to Next as the
    // declaration form. Counting only declarations made an arrow-const module
    // report "no endpoint here" and skip the gate walk entirely — a bypass
    // available to anyone who prefers that style.
    const dir = mkdtempSync(join(tmpdir(), "exports-fence-"))
    const write = (name: string, source: string): string => {
      const file = join(dir, name)
      writeFileSync(file, source, "utf8")
      return file
    }

    expect(
      exportsAFunction(
        write("arrow.ts", `"use server"\nexport const a = async () => {}`),
      ),
    ).toBe(true)
    expect(
      exportsAFunction(
        write("expr.ts", `"use server"\nexport const b = async function () {}`),
      ),
    ).toBe(true)
    expect(
      exportsAFunction(
        write("decl.ts", `"use server"\nexport async function c() {}`),
      ),
    ).toBe(true)
    // Still not an endpoint: a plain value, and a non-exported arrow.
    expect(
      exportsAFunction(write("value.ts", `export const d = { ok: true }`)),
    ).toBe(false)
    expect(
      exportsAFunction(write("private.ts", `const e = async () => {}`)),
    ).toBe(false)

    rmSync(dir, { recursive: true, force: true })
  })

  it("does not let a sibling version inherit an exemption (non-vacuous)", () => {
    // `dir.startsWith("agent/v1")` also matches `agent/v10`.
    const matches = (dir: string, tree: string): boolean =>
      dir === tree || dir.startsWith(`${tree}/`)

    expect(matches("agent/v1", "agent/v1")).toBe(true)
    expect(matches("agent/v1/meta", "agent/v1")).toBe(true)
    expect(matches("agent/v10", "agent/v1")).toBe(false)
    expect(matches("agent/v10/meta", "agent/v1")).toBe(false)
  })

  it("catches an action that only proves membership (non-vacuous)", () => {
    // `requireScope` is the shape a new contributor reaches for, and it is
    // exactly the one that admits a seat: it proves THIS PERSON IS A MEMBER,
    // which an employee seat is.
    const dir = mkdtempSync(join(tmpdir(), "action-fence-"))
    const file = join(dir, "hostile.ts")
    writeFileSync(
      file,
      `"use server"
       import { requireScope } from "@/lib/data/scope"
       export async function payEveryoneAction(formData) {
         const scope = await requireScope(formData.get("orgSlug"))
         return doSomethingSensitive(scope)
       }`,
      "utf8",
    )

    expect(serverActionModules(dir)).toEqual(["hostile.ts"])
    expect(exportsAFunction(file)).toBe(true)
    expect(callsAnyGate(file)).toBe(false)

    rmSync(dir, { recursive: true, force: true })
  })
})
