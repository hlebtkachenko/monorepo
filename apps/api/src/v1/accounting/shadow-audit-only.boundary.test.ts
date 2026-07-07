import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * [W1.5] Boundary gate: the shadow score is PURE, AUDIT-ONLY instrumentation — NO
 * production module reads the shadow to make a decision.
 *
 * The shadow is WRITTEN by the gate via a local `const shadow = buildShadowScore(...)`
 * plus the `{ shadow }` object-literal shorthand into `serverGate` — NEITHER is a
 * READ (a bound identifier and an object-literal property, not a property access).
 * `shadow-score.ts` builds it and reads only its OWN locals (`.serverLane`, `.cRaw`,
 * ...), never `.shadow`. So EVERY production file — the producers INCLUDED — has
 * ZERO `.shadow` reads today, and this test allowlists NONE of them: any production
 * `.shadow` read anywhere in `apps/api/src` fails, INCLUDING inside the gate.
 *
 * That is deliberate. Exempting the gate would bless a future edit that wires
 * `shadow.serverLane.cRaw` into `autoApply` in the very file where a read would gate
 * enforcement — the exact failure W1.5 must prevent. With an empty allowlist the
 * only way this test stays green is if no production code reads the shadow at all;
 * the moment one does (in the gate or anywhere), it goes red.
 *
 * TWO legs cover the two ways the shadow could reach an enforcement decision:
 *
 *   1. PERSISTED-RECORD READ — a consumer reads it back off the audit record: a
 *      `.shadow` property access (`x.shadow`) or a `["shadow"]` bracket access with a
 *      `"shadow"` string-literal key. Scanned across EVERY production file with an
 *      EMPTY allowlist (gate + producer included). A bare string literal and the
 *      write site's `{ shadow }` shorthand are NOT reads, so they never false-positive.
 *   2. LOCAL-BINDING WIRING — the gate holds the ONLY local `shadow` binding; wiring
 *      it into `autoApply` (`shadow.serverLane.cRaw`) does NOT surface as a `.shadow`
 *      property access (the leading `shadow` is a bound identifier, not `x.shadow`),
 *      so leg 1 cannot see it. Leg 2 classifies every `shadow` identifier use in the
 *      gate as a WRITE (its definition + the `{ shadow }` / long-form write into
 *      serverGate) or a NON-WRITE (any other read), and asserts zero non-writes.
 */

const API_SRC = resolve(__dirname, "..", "..")
// apps/web — the other place the persisted `serverGate` audit record is read, but
// via raw SQL jsonb paths (`output_json->'serverGate'->>'templateId'`), which the
// TS AST scan cannot see. A lightweight string guard covers that surface too.
const WEB_SRC = resolve(API_SRC, "..", "..", "web")

/** All source files under `dir` (recursive) matching `exts`, non-test only. */
function collectSources(dir: string, exts: readonly string[]): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules") continue
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx"))
        continue
      else if (exts.some((e) => entry.endsWith(e))) out.push(full)
    }
  }
  walk(dir)
  return out
}

/** All `.ts` under `dir` (recursive), non-test only. */
function collectProdSources(dir: string): string[] {
  return collectSources(dir, [".ts"])
}

/**
 * A raw-SQL jsonb read of the shadow off the `serverGate` audit record — e.g.
 * `output_json->'serverGate'->'shadow'` or `->>'shadow'`. The `serverGate` anchor
 * keeps this from firing on unrelated `'shadow'` string occurrences.
 */
const SERVERGATE_SHADOW_JSONB = /serverGate[\s\S]{0,40}->>?\s*'shadow'/

/**
 * Count shadow READS in `source` via the real TS AST — both `<expr>.shadow`
 * (property access) and `<expr>["shadow"]` (bracket/dynamic access with a
 * string-literal key). An object-literal key or a bare string literal is not a
 * read, so the write site (`{ shadow }`) and prose never count.
 */
function shadowReadCount(source: string, fileName: string): number {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
  let count = 0
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === "shadow") {
      count++
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === "shadow"
    ) {
      count++
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return count
}

const countInFile = (file: string): number =>
  shadowReadCount(readFileSync(file, "utf8"), file)

/**
 * The gate WRITES the shadow through a local `shadow` binding: it appears exactly
 * twice — the `const shadow = buildShadowScore(...)` VariableDeclaration and the
 * `{ shadow }` ShorthandPropertyAssignment into `serverGate`. Wiring that local
 * into `autoApply` (the coordinator's exact fear — `shadow.serverLane.cRaw`) adds a
 * THIRD `shadow` identifier whose parent is a PropertyAccessExpression / a plain
 * read, which this classifier flags as a non-write use. Neither of the two writes
 * is a `.shadow` property access, so the `shadowReadCount` scan above cannot see the
 * local-binding wiring — this AST classifier is the leg that catches it.
 */
function gateShadowBindingUses(
  source: string,
  fileName: string,
): {
  writes: number
  nonWrites: number
} {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  )
  let writes = 0
  let nonWrites = 0
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === "shadow") {
      const parent = node.parent
      const isDefinition =
        ts.isVariableDeclaration(parent) && parent.name === node
      const isShorthandWrite = ts.isShorthandPropertyAssignment(parent)
      // `serverGate = { shadow: shadow }` (explicit long-form write) is also a write.
      const isLongFormWriteValue =
        ts.isPropertyAssignment(parent) && parent.initializer === node
      if (isDefinition || isShorthandWrite || isLongFormWriteValue) writes++
      else nonWrites++
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { writes, nonWrites }
}

describe("[W1.5] shadow is audit-only (no production consumer reads it)", () => {
  const prodFiles = collectProdSources(API_SRC)

  it("scans real sources (non-vacuous)", () => {
    expect(prodFiles.length).toBeGreaterThan(0)
  })

  it("detects both read forms and ignores writes/strings (the detector is real)", () => {
    // A property-access read of the persisted audit record.
    expect(shadowReadCount("const x = gate.shadow", "f.ts")).toBe(1)
    // A bracket/dynamic read with a string-literal key.
    expect(shadowReadCount(`const x = gate["shadow"]`, "f.ts")).toBe(1)
    // An object-literal key (how the gate WRITES it) is NOT a read → not counted.
    expect(shadowReadCount("const g = { shadow }", "f.ts")).toBe(0)
    // A string literal on its own is not a property/element access.
    expect(shadowReadCount(`const s = "shadow"`, "f.ts")).toBe(0)
  })

  it("NO production module reads the persisted `.shadow` — allowlist is EMPTY, gate included", () => {
    // No exemptions: the producers (shadow-score.ts + accounting-writes.gate.ts)
    // have zero `.shadow` / `["shadow"]` reads today, so they pass on merit —
    // proving the shadow is written, never read back for a decision, and that a
    // future consumer reading the persisted audit record would fail this test.
    const offenders = prodFiles
      .filter((f) => countInFile(f) > 0)
      .map((f) => f.replace(API_SRC, "apps/api/src/.."))
    expect(
      offenders,
      `Production source(s) read the shadow score. The shadow is PURE, audit-only M3 ` +
        `instrumentation and must NEVER affect enforcement — no production file (the gate ` +
        `included) may read it. Offenders: ${offenders.join(", ")}`,
    ).toEqual([])
  })

  it("classifies gate shadow-binding uses (write vs non-write) correctly (the detector is real)", () => {
    const def = `const shadow = buildShadowScore(a, b, c)`
    expect(gateShadowBindingUses(def, "f.ts")).toEqual({
      writes: 1,
      nonWrites: 0,
    })
    // The two legitimate writes: definition + `{ shadow }` shorthand.
    const legit = `const shadow = buildShadowScore(a, b, c)\nconst g = { veto, shadow }`
    expect(gateShadowBindingUses(legit, "f.ts")).toEqual({
      writes: 2,
      nonWrites: 0,
    })
    // The exact enforcement-wiring W1.5 must forbid: `shadow.serverLane.cRaw` read
    // into an autoApply decision → a NON-WRITE use.
    const wired = `const shadow = buildShadowScore(a, b, c)\nconst autoApply = ok && shadow.serverLane.cRaw > 0.9`
    const w = gateShadowBindingUses(wired, "f.ts")
    expect(w.writes).toBe(1)
    expect(w.nonWrites).toBeGreaterThanOrEqual(1)
  })

  it("the gate's local `shadow` binding is ONLY written, never wired into a decision", () => {
    // The gate is the ONE production file that holds a local `shadow` binding. It
    // must use it purely to WRITE into serverGate — its definition + the `{ shadow }`
    // (or long-form) write, and NOTHING else. A non-write use is the enforcement
    // wiring (`shadow.serverLane.cRaw` in autoApply) the pure-instrumentation
    // invariant forbids.
    const gate = prodFiles.find((f) => f.endsWith("accounting-writes.gate.ts"))
    expect(gate, "the gate file must exist (non-vacuous)").toBeDefined()
    const uses = gateShadowBindingUses(readFileSync(gate!, "utf8"), gate!)
    // Exactly the two writes present today: the definition + the serverGate write.
    expect(uses.writes).toBe(2)
    expect(
      uses.nonWrites,
      `The gate reads its local \`shadow\` binding for something other than writing it ` +
        `into serverGate — the pure-instrumentation invariant forbids wiring the shadow ` +
        `into enforcement (autoApply). Non-write \`shadow\` uses: ${uses.nonWrites}.`,
    ).toBe(0)
  })

  it("the jsonb-path regex detects a serverGate->shadow read (the detector is real)", () => {
    expect(
      `output_json->'serverGate'->>'shadow'`.match(SERVERGATE_SHADOW_JSONB),
    ).not.toBeNull()
    expect(
      `output_json->'serverGate'->'shadow'->>'serverLane'`.match(
        SERVERGATE_SHADOW_JSONB,
      ),
    ).not.toBeNull()
    // The live web reader (templateId) must NOT match.
    expect(
      `(l.output_json->'serverGate'->>'templateId')`.match(
        SERVERGATE_SHADOW_JSONB,
      ),
    ).toBeNull()
  })

  it("no apps/web SQL reads serverGate->'shadow' off the audit record (bonus web guard)", () => {
    const webFiles = collectSources(WEB_SRC, [".ts", ".tsx"])
    expect(
      webFiles.length,
      "apps/web must be reachable (non-vacuous)",
    ).toBeGreaterThan(0)
    const offenders = webFiles
      .filter((f) => SERVERGATE_SHADOW_JSONB.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(WEB_SRC, "apps/web"))
    expect(
      offenders,
      `apps/web reads the shadow off the persisted serverGate via a jsonb path. The shadow ` +
        `is PURE, audit-only M3 instrumentation — the web review UI must NOT read it for any ` +
        `decision. Offenders: ${offenders.join(", ")}`,
    ).toEqual([])
  })
})
