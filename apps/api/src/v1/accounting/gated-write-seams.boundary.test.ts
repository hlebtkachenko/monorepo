import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * [#519] Boundary gate: no PRODUCTION call site overrides `runGatedWrite`'s
 * injectable test seams.
 *
 * `runGatedWrite` (accounting-writes.gate.ts) exposes two params after the
 * options object PURELY as test seams:
 *   - 2nd `admission` (a permissive AdmissionController), and
 *   - 3rd `scoreEvidence` (a scorer that can green the third AND leg).
 * Both default to the fail-closed production values (`accountingAdmission`,
 * `evaluateEvidence`). TypeScript CANNOT tell a test caller from a production
 * one, so a future production caller that passed a permissive `scoreEvidence`
 * would silently VACATE the server-score leg of the auto-apply three-way AND
 * (`confidenceOk && !veto.held && score.isGreen`) — a confident-wrong hole.
 *
 * This test reads every non-test `.ts` under `apps/api/src`, finds every
 * `runGatedWrite(` CALL, and asserts each passes exactly ONE argument (the
 * options object). Any 2nd/3rd argument in production is a hard failure.
 *
 * Test files (`*.test.ts`) are exempt — they legitimately inject the seams.
 */

const API_SRC = resolve(__dirname, "..", "..")

/** All `.ts` under `dir`, excluding `*.test.ts` and `node_modules`. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full)
    }
  }
  return out
}

/**
 * Blank out `//`+`/* *​/` comments and string / template-literal CONTENT,
 * preserving length + structural delimiters, so a `runGatedWrite(` mention
 * inside a comment or string (e.g. a docstring) is never scanned as a call.
 */
function stripCommentsAndStrings(src: string): string {
  const chars = src.split("")
  const out: string[] = new Array(chars.length)
  let i = 0
  type Mode = "code" | "line" | "block" | "sq" | "dq" | "tpl"
  let mode: Mode = "code"
  while (i < chars.length) {
    const c = chars[i]!
    const next = chars[i + 1]
    if (mode === "code") {
      if (c === "/" && next === "/") {
        mode = "line"
        out[i] = " "
        out[i + 1] = " "
        i += 2
        continue
      }
      if (c === "/" && next === "*") {
        mode = "block"
        out[i] = " "
        out[i + 1] = " "
        i += 2
        continue
      }
      if (c === "'") mode = "sq"
      else if (c === '"') mode = "dq"
      else if (c === "`") mode = "tpl"
      out[i] = c
      i += 1
      continue
    }
    if (mode === "line") {
      if (c === "\n") {
        mode = "code"
        out[i] = c
      } else {
        out[i] = " "
      }
      i += 1
      continue
    }
    if (mode === "block") {
      if (c === "*" && next === "/") {
        mode = "code"
        out[i] = " "
        out[i + 1] = " "
        i += 2
        continue
      }
      out[i] = c === "\n" ? c : " "
      i += 1
      continue
    }
    // string / template modes: blank content, keep the closing delimiter,
    // honor backslash escapes.
    if (c === "\\") {
      out[i] = " "
      out[i + 1] = " "
      i += 2
      continue
    }
    if (
      (mode === "sq" && c === "'") ||
      (mode === "dq" && c === '"') ||
      (mode === "tpl" && c === "`")
    ) {
      mode = "code"
      out[i] = c
    } else {
      out[i] = c === "\n" ? c : " "
    }
    i += 1
  }
  return out.join("")
}

/**
 * Count top-level arguments to a call whose `(` is at `openParen` in `src`.
 * Depth-tracks `()[]{}`; a top-level comma separates arguments. Assumes `src`
 * is already comment/string-stripped. Returns 0 for an empty arg list.
 */
function countCallArgs(src: string, openParen: number): number {
  let depth = 0
  let commas = 0
  let sawArg = false
  for (let i = openParen; i < src.length; i++) {
    const c = src[i]!
    if (c === "(" || c === "[" || c === "{") {
      // A nested group opening INSIDE the call (e.g. the options `{`) is content.
      if (depth >= 1) sawArg = true
      depth++
    } else if (c === ")" || c === "]" || c === "}") {
      depth--
      if (depth === 0) break
    } else if (depth >= 1) {
      if (c === "," && depth === 1) commas++
      else if (!/\s/.test(c)) sawArg = true
    }
  }
  if (!sawArg) return 0
  return commas + 1
}

interface CallSite {
  file: string
  argCount: number
}

/** Every `runGatedWrite(...)` CALL (not the `function runGatedWrite<T>(` decl). */
function findCallSites(file: string, cleaned: string): CallSite[] {
  const sites: CallSite[] = []
  // Calls carry an explicit type arg (`runGatedWrite<CapturedEvent>(`), so an
  // optional `<...>` generic clause is allowed between the name and the `(`.
  // The DECLARATION (`function runGatedWrite<T>(`) matches the same shape but is
  // excluded by the preceding `function` keyword — else its 3 params would read
  // as a 3-arg "call" and fail the invariant.
  const re = /\brunGatedWrite\s*(?:<[^(){};]*>)?\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    if (/\bfunction\s+$/.test(cleaned.slice(0, m.index))) continue
    const openParen = m.index + m[0].length - 1
    sites.push({ file, argCount: countCallArgs(cleaned, openParen) })
  }
  return sites
}

describe("[#519] runGatedWrite seam boundary", () => {
  const files = collectSourceFiles(API_SRC)
  const sites = files.flatMap((f) =>
    findCallSites(f, stripCommentsAndStrings(readFileSync(f, "utf8"))),
  )

  it("scans real production sources (non-vacuous)", () => {
    // Must find the known production call sites — else the scanner silently
    // matched nothing and the invariant below is vacuously green.
    expect(files.length).toBeGreaterThan(0)
    expect(sites.length).toBeGreaterThanOrEqual(3)
  })

  it("no production caller overrides admission / scoreEvidence", () => {
    const offenders = sites.filter((s) => s.argCount !== 1)
    expect(
      offenders,
      `Production runGatedWrite call(s) pass a 2nd/3rd argument (admission / scoreEvidence). ` +
        `Those seams are TEST-ONLY — a permissive scoreEvidence vacates the server-score leg of the ` +
        `auto-apply AND. Remove the extra argument(s). Offenders: ` +
        offenders
          .map(
            (o) =>
              `${o.file.replace(API_SRC, "apps/api/src/..")} (${o.argCount} args)`,
          )
          .join(", "),
    ).toEqual([])
  })
})
