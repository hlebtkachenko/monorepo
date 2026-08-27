/**
 * The brand cannot be asserted into existence.
 *
 * `OrgScope` and `OfficeScope` are proof objects: each carries a module-private
 * `Symbol` key, so an object literal shaped like one is a TYPE ERROR outside
 * `scope.ts` and the only way to obtain one is `requireScope()` /
 * `requireOffice()` — which is what makes "this data function is unreachable
 * without a resolved membership" a compile-time fact rather than a convention.
 *
 * A type ASSERTION erases that in one token. `{} as OrgScope`,
 * `input as unknown as OfficeScope`, `<OrgScope>value` — each of them hands a
 * caller a handle that proves nothing, and none of them is a type error. Worse,
 * the most tempting place to write one is a test fixture ("I just need a scope
 * to call this function"), which would make the tenancy suite assert about a
 * world the application never runs in.
 *
 * So the fence covers TEST FILES TOO, deliberately, and it reads the real
 * TypeScript AST rather than grepping — the assertion can be spelled across a
 * line break, nested in a generic, or hidden inside a union, and the parser
 * sees all of those.
 *
 * Advisor carry-in from the PR 07 gate.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const BETA_ROOT = resolve(__dirname, "..", "..")

/**
 * The four brands, and the one file allowed to name them in an assertion.
 *
 * `AgentScope` (PR 24) is on the list for the same reason the other three are,
 * and its minting lives in the SAME file on purpose: a second brand home would
 * be a second place to audit, and the whole value of this fence is that there is
 * exactly one.
 */
const BRANDED_TYPES = ["OrgScope", "OfficeScope", "OwnerScope", "AgentScope"]
const BRAND_HOME = "lib/data/scope.ts"

/**
 * Skipped by PATH relative to `dir` (always `BETA_ROOT` here), not by bare
 * basename. `node_modules`/`.next` are excluded no matter where they occur —
 * once skipped once, the walker never descends into them, so a nested
 * instance is never actually reached — but `migrations`/`fonts`/`public` name
 * the app's own top-level directories specifically, and matching those by
 * basename alone used to silently exempt any FUTURE directory that happened
 * to share one of those names deeper in the tree from this fence's AST scan.
 */
const SKIP_DIR_PATHS = new Set([
  "node_modules",
  ".next",
  "db/migrations",
  "fonts",
  "public",
])

function collectSources(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (SKIP_DIR_PATHS.has(relative(dir, full))) continue
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) files.push(full)
    }
  }
  walk(dir)
  return files
}

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
}

/** Does this type node mention a branded type anywhere inside it? */
function mentionsBrand(node: ts.TypeNode, sf: ts.SourceFile): string | null {
  let found: string | null = null
  const visit = (current: ts.Node): void => {
    if (found !== null) return
    if (ts.isTypeReferenceNode(current)) {
      const name = current.typeName.getText(sf)
      // `OrgScope`, and also a qualified `scope.OrgScope`.
      const last = name.split(".").pop() ?? name
      if (BRANDED_TYPES.includes(last)) {
        found = last
        return
      }
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return found
}

type Finding = { file: string; detail: string }

/** Every `x as OrgScope` and `<OfficeScope>x` in one file. */
export function brandAssertions(sf: ts.SourceFile, file: string): Finding[] {
  const findings: Finding[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const brand = mentionsBrand(node.type, sf)
      if (brand !== null) {
        findings.push({ file, detail: `asserts ${brand}` })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return findings
}

const parsed = collectSources(BETA_ROOT).map((file) => ({
  file: relative(BETA_ROOT, file).split("\\").join("/"),
  source: readFileSync(file, "utf8"),
}))

describe("scope brand fence", () => {
  it("scans the real app, tests included (non-vacuous)", () => {
    const files = parsed.map((entry) => entry.file)
    expect(files).toContain(BRAND_HOME)
    expect(files).toContain("lib/data/scope.test.ts")
    expect(files.length).toBeGreaterThan(30)
  })

  it("nobody asserts their way to a scope", () => {
    const findings = parsed
      .filter((entry) => entry.file !== BRAND_HOME)
      .flatMap((entry) =>
        brandAssertions(parse(entry.source, entry.file), entry.file),
      )
    expect(findings).toEqual([])
  })

  it("catches every spelling of the assertion (non-vacuous)", () => {
    const hostile = [
      `const a = {} as OrgScope`,
      `const b = input as unknown as OfficeScope`,
      `const c = rows.map((r) => r as OrgScope)`,
      `const d = value as Readonly<OrgScope>`,
      `const e = value as OrgScope & { extra: true }`,
      `const f = orgScope as OwnerScope`,
      `const g = input as unknown as OwnerScope`,
      `const h = {} as AgentScope`,
    ].join("\n")

    const findings = brandAssertions(parse(hostile, "hostile.ts"), "hostile.ts")
    expect(findings.map((f) => f.detail)).toEqual([
      "asserts OrgScope",
      "asserts OfficeScope",
      "asserts OrgScope",
      "asserts OrgScope",
      "asserts OrgScope",
      "asserts OwnerScope",
      "asserts OwnerScope",
      "asserts AgentScope",
    ])
  })

  it("does not fire on an honest annotation or a satisfies", () => {
    const innocent = [
      `function f(scope: OrgScope) { return scope.organizationId }`,
      `const g: (o: OfficeScope) => void = () => {}`,
      `type H = { scope: OrgScope }`,
      // `satisfies` is CHECKED, so it cannot manufacture a brand.
      `const i = { organizationId: "x" } satisfies Partial<OrgScope>`,
    ].join("\n")

    expect(
      brandAssertions(parse(innocent, "innocent.ts"), "innocent.ts"),
    ).toEqual([])
  })
})
