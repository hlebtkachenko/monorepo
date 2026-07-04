import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * [#519] Boundary gate: no PRODUCTION call site vacates `runGatedWrite`'s
 * fail-closed admission / scoring seams.
 *
 * The primary defense is the TYPE SYSTEM: `runGatedWrite(opts)` takes exactly
 * one parameter, so a production caller cannot pass a permissive `scoreEvidence`
 * (it is a TS2554 compile error). The injectable seams live on a separate,
 * exported-but-TEST-ONLY `runGatedWriteWithSeams(opts, admission, scoreEvidence)`.
 *
 * This test is the belt-and-braces residual: it walks the real TypeScript AST of
 * every non-test source file under `apps/api/src` and asserts none of them
 * IMPORT or CALL `runGatedWriteWithSeams` — the only remaining way a production
 * caller could vacate the server-score leg of the auto-apply three-way AND. The
 * defining module (`accounting-writes.gate.ts`, whose production wrapper legally
 * delegates to the seam form) is exempt. Using the compiler's parser means
 * comments, strings, regex literals, and template interpolations are handled
 * correctly — no hand-rolled lexer to go silently blind.
 */

const API_SRC = resolve(__dirname, "..", "..")
const SEAM_FN = "runGatedWriteWithSeams"
const DEFINER = "accounting-writes.gate.ts" // production wrapper + declaration live here
const SEAM_TEST = "accounting-writes.gate.test.ts" // exercises the seam form (non-vacuous anchor)

/** All `.ts` under `dir` (recursive), partitioned into test vs non-test. */
function collectSources(dir: string): { test: string[]; prod: string[] } {
  const test: string[] = []
  const prod: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules") continue
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith(".test.ts")) test.push(full)
      else if (entry.endsWith(".ts")) prod.push(full)
    }
  }
  walk(dir)
  return { test, prod }
}

/** Count IMPORTs + CALLs of `runGatedWriteWithSeams` via the real TS AST. The
 * `function runGatedWriteWithSeams(...)` DECLARATION is neither, so it is not
 * counted — the definer's own wrapper delegation IS a call and is why the
 * definer file is exempted at the call site, not here. */
function seamReferenceCount(file: string): number {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
  let count = 0
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === SEAM_FN
    ) {
      count++
    } else if (ts.isImportSpecifier(node) && node.name.text === SEAM_FN) {
      count++
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return count
}

describe("[#519] runGatedWrite seam boundary", () => {
  const { test: testFiles, prod: prodFiles } = collectSources(API_SRC)

  it("scans real sources and the AST detects the seam form (non-vacuous)", () => {
    expect(prodFiles.length).toBeGreaterThan(0)
    // The seam test must reference the seam form, proving the AST walk detects it.
    const seamTest = testFiles.find((f) => f.endsWith(SEAM_TEST))
    expect(seamTest).toBeDefined()
    expect(seamReferenceCount(seamTest!)).toBeGreaterThanOrEqual(1)
  })

  it("no production source imports or calls the test-only seam form", () => {
    const offenders = prodFiles
      .filter((f) => !f.endsWith(DEFINER))
      .filter((f) => seamReferenceCount(f) > 0)
      .map((f) => f.replace(API_SRC, "apps/api/src/.."))
    expect(
      offenders,
      `Production source(s) reference ${SEAM_FN}, the TEST-ONLY seam form. A permissive ` +
        `scoreEvidence there vacates the server-score leg of the auto-apply AND. Call ` +
        `runGatedWrite (one arg, fail-closed defaults) instead. Offenders: ${offenders.join(", ")}`,
    ).toEqual([])
  })
})
