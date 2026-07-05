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
 * REFERENCE `runGatedWriteWithSeams` — the only remaining way a production caller
 * could vacate the server-score leg of the auto-apply three-way AND. It counts
 * every `Identifier` with that exact text, so it catches a direct call, a direct
 * or ALIASED import (`{ runGatedWriteWithSeams as x }`), a NAMESPACE-property call
 * (`import * as g; g.runGatedWriteWithSeams(...)`), and a re-export alike — any
 * occurrence is fail-closed. The declaration lives only in the exempted definer
 * (`accounting-writes.gate.ts`, whose production wrapper legally delegates), so an
 * identifier occurrence in any OTHER production file is a real reference.
 */

const API_SRC = resolve(__dirname, "..", "..")
const SEAM_FN = "runGatedWriteWithSeams"
const DEFINER = "accounting-writes.gate.ts" // declaration + production wrapper delegation live here
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

/**
 * Count every `Identifier` named `runGatedWriteWithSeams` in `source` via the real
 * TS AST. This is deliberately maximal: an import (default or aliased — the
 * `propertyName` identifier carries the imported name), a namespace property
 * access, a re-export specifier, and a direct call ALL surface the identifier, so
 * no import/reference form can evade it. Comments, strings, and regex literals are
 * not identifiers, so they never false-positive.
 */
function seamIdentifierCount(source: string, fileName: string): number {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
  let count = 0
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === SEAM_FN) count++
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return count
}

const countInFile = (file: string): number =>
  seamIdentifierCount(readFileSync(file, "utf8"), file)

describe("[#519] runGatedWrite seam boundary", () => {
  const { test: testFiles, prod: prodFiles } = collectSources(API_SRC)

  it("scans real sources and the AST detects the seam form (non-vacuous)", () => {
    expect(prodFiles.length).toBeGreaterThan(0)
    const seamTest = testFiles.find((f) => f.endsWith(SEAM_TEST))
    expect(seamTest).toBeDefined()
    expect(countInFile(seamTest!)).toBeGreaterThanOrEqual(1)
  })

  it("no production source references the test-only seam form", () => {
    const offenders = prodFiles
      .filter((f) => !f.endsWith(DEFINER))
      .filter((f) => countInFile(f) > 0)
      .map((f) => f.replace(API_SRC, "apps/api/src/.."))
    expect(
      offenders,
      `Production source(s) reference ${SEAM_FN}, the TEST-ONLY seam form. A permissive ` +
        `scoreEvidence there vacates the server-score leg of the auto-apply AND. Call ` +
        `runGatedWrite (one arg, fail-closed defaults) instead. Offenders: ${offenders.join(", ")}`,
    ).toEqual([])
  })

  // Prove the detector cannot be evaded by an obfuscated reference form — every
  // import/call shape that reaches the seam form must be caught (fixtures, not
  // real files, so the scan above stays truthful).
  it("detects every reference form (direct, aliased, namespace, re-export)", () => {
    const positives: Record<string, string> = {
      "direct call": `import { runGatedWriteWithSeams } from "./g"\nrunGatedWriteWithSeams(o, a, s)`,
      "aliased import + call": `import { runGatedWriteWithSeams as rgw } from "./g"\nrgw(o, a, s)`,
      "namespace property call": `import * as g from "./g"\ng.runGatedWriteWithSeams(o, a, s)`,
      "re-export": `export { runGatedWriteWithSeams } from "./g"`,
      "reference in a string is ignored (not an identifier)": `const s = "runGatedWriteWithSeams"`,
    }
    expect(
      seamIdentifierCount(positives["direct call"]!, "f.ts"),
    ).toBeGreaterThanOrEqual(1)
    expect(
      seamIdentifierCount(positives["aliased import + call"]!, "f.ts"),
    ).toBeGreaterThanOrEqual(1)
    expect(
      seamIdentifierCount(positives["namespace property call"]!, "f.ts"),
    ).toBeGreaterThanOrEqual(1)
    expect(
      seamIdentifierCount(positives["re-export"]!, "f.ts"),
    ).toBeGreaterThanOrEqual(1)
    // A string literal must NOT count — no false positive from prose/data.
    expect(
      seamIdentifierCount(
        positives["reference in a string is ignored (not an identifier)"]!,
        "f.ts",
      ),
    ).toBe(0)
  })
})
