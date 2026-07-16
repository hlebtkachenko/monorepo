import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * [I9] Boundary gate: "Read-side IR only; no write templates." Per the
 * constitution (`packages/brain/.brain/constitution.md` §I9): "Canonical IR
 * + per-format mapping rules are parse-side only. The write side is agent
 * conversation with the typed functions — no XML / transformation
 * templates." The canonical IR (`src/ir/**`) maps every SOURCE format
 * (Money S3, Pohoda, GPC/CAMT/Fio, PDF, CSV, ISDOC) INTO the IR; nothing
 * maps back OUT via a template. Every write reaches the accounting API
 * through the typed Zod request schemas (`@workspace/shared/api`), composed
 * by agent conversation — never through a template engine or a hand-rolled
 * XML/transformation template that renders a write payload.
 *
 * This scans every production (non-test) source file under
 * `packages/brain/src` for the two concrete forms a write-template could
 * take:
 *
 *   (a) an import of a template-engine package (handlebars / mustache /
 *       nunjucks / ejs / pug / dot), or
 *   (b) an identifier that pairs "template" with a write-side concept
 *       (post/posting, write, booking, xml) in the SAME identifier — e.g.
 *       `postingTemplate`, `writeTemplate`, `renderXmlTemplate`,
 *       `bookingTemplate`, `templateToPosting`.
 *
 * Deliberately does NOT flag the legitimate `OcrTemplate` / `ocr-templates`
 * surface (`packages/shared/src/api/ocr-templates.ts`,
 * `apps/api/src/v1/ocr-templates/**`) — that is a READ-side EXTRACTION
 * layout template (the Brain's learned supplier-invoice-parsing shape,
 * mapping a source PDF/image INTO the IR), the mirror image of what I9
 * blesses, never a write-payload transform. `WRITE_TEMPLATE_NAME_RE` only
 * fires when "template" is paired with a write-side word in the SAME
 * identifier, so "OcrTemplate" / "ocrTemplate" never matches.
 *
 * ── §I9 allowlist — exact-match, non-widening, currently EMPTY ──────────────
 *
 * `M2_1_BOOKING_TEMPLATE_ALLOWLIST` (below) is the reviewed, exact-identifier
 * escape hatch for a read-side / routing-only name that legitimately pairs
 * "book(ing)" with "template" and must NOT count as a write-template violation.
 * It is checked against the FULL enclosing identifier (see `expandToIdentifier`),
 * so a name that merely CONTAINS an allowed substring never slips through, and
 * adding an entry requires a reviewed change to THIS file — never a regex
 * loosening.
 *
 * It is EMPTY today: its sole historical entry, the M2.1 `BookingTemplateMatch`
 * routing input (a client-side `{ matched: boolean }` consumed only by the
 * inert model-routing path), was deleted in WP5 (#775) with that dead path, so
 * no carve-out is needed and every write-template identifier now trips.
 */

const BRAIN_SRC = resolve(__dirname) // packages/brain/src

const TEMPLATE_ENGINE_RE = /\b(?:handlebars|mustache|nunjucks|ejs|pug)\b/i
const WRITE_TEMPLATE_NAME_RE =
  /(?:post(?:ing)?|writ(?:e|ing)|book(?:ing)?|xml)[a-z]*template|template[a-z]*(?:post(?:ing)?|writ(?:e|ing)|book(?:ing)?|xml)/gi

/**
 * Exact-identifier allowlist (§I9 amendment): read-side / routing-only names
 * that legitimately pair "book(ing)" with "template" and must NOT count as
 * write-template violations. Matched case-insensitively against the FULL
 * enclosing identifier (never a substring), so an entry can only ever narrow,
 * not widen, what counts as a violation. Add an entry ONLY alongside the PR
 * that introduces it, and only for a genuinely read-side / routing-only concept
 * — never for anything that renders or transforms a write payload.
 *
 * Currently EMPTY: the sole entry (`bookingtemplatematch`, the inert M2.1
 * model-routing input) was removed in WP5 (#775) together with its dead routing
 * path, so no carve-out is needed. Keeping it would be a latent false-negative
 * — it would bless a future WRITE helper that reused that exact name.
 */
const M2_1_BOOKING_TEMPLATE_ALLOWLIST = new Set<string>()

const IDENTIFIER_CHAR_RE = /[A-Za-z0-9_$]/

/**
 * Expand a regex match span to its full enclosing identifier by walking left/
 * right over identifier characters. So a match on the substring "kingTemplate"
 * inside "ConfirmedBookingTemplate" resolves to the whole identifier before
 * it is checked against the allowlist — the exception can never accidentally
 * cover a DIFFERENT, unreviewed identifier that happens to share a substring.
 */
function expandToIdentifier(
  text: string,
  matchStart: number,
  matchEnd: number,
): string {
  let start = matchStart
  while (start > 0 && IDENTIFIER_CHAR_RE.test(text[start - 1]!)) start--
  let end = matchEnd
  while (end < text.length && IDENTIFIER_CHAR_RE.test(text[end]!)) end++
  return text.slice(start, end)
}

/** All `.ts` files under `dir` (recursive), non-test only. */
function collectProdSources(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      if (entry === "node_modules") continue
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith(".test.ts")) continue
      else if (entry.endsWith(".ts")) out.push(full)
    }
  }
  walk(dir)
  return out
}

/**
 * Strip line + block comments from `source` (and, when `dropStrings` is set,
 * the CONTENTS of string / template literals too), so the detectors scan CODE,
 * not prose. A single-pass scanner tracks string-vs-comment state, so a `//`
 * inside a string, or a URL inside a string, never confuses the comment
 * stripper. Best-effort: it does not descend into template-literal `${…}`
 * interpolations — all a tripwire needs. String DELIMITERS are preserved so
 * token boundaries survive (`from ""` still reads as an import).
 */
function stripCommentsAndStrings(source: string, dropStrings: boolean): string {
  let out = ""
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    const next = source[i + 1]
    if (c === "/" && next === "/") {
      i += 2
      while (i < n && source[i] !== "\n") i++
      continue
    }
    if (c === "/" && next === "*") {
      i += 2
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c
      out += quote
      i++
      let body = ""
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          body += source[i]! + (source[i + 1] ?? "")
          i += 2
          continue
        }
        body += source[i]
        i++
      }
      if (!dropStrings) out += body
      if (i < n) out += source[i] // closing quote
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * Every write-template indicator `source` contains, or `[]` if clean.
 *
 * Both detectors scan COMMENT-STRIPPED code so a doc comment that merely
 * MENTIONS a write-template word (e.g. `// unlike a writeTemplate, we compose
 * via typed functions`) can never false-positive and break the build. The
 * engine detector keeps string literals (a template-engine's name legitimately
 * lives in its import specifier, `from "mustache"`); the name detector also
 * drops string contents, so a benign string like `"postingTemplate"` is not
 * mistaken for a real identifier.
 *
 * The name detector scans for ALL matches (not just the first) and expands
 * each to its full enclosing identifier before deciding whether it is a
 * violation — an identifier exactly on the M2.1 allowlist is skipped; every
 * other identifier (or the same identifier found again in a DIFFERENT file
 * outside the reviewed surface) still trips. This means a file can carry the
 * one blessed identifier AND a real violation simultaneously without the
 * blessing masking the violation.
 */
function findViolations(source: string): string[] {
  const hits: string[] = []
  // Engine imports live in string specifiers → keep strings, drop only comments.
  const engineMatch = TEMPLATE_ENGINE_RE.exec(
    stripCommentsAndStrings(source, false),
  )
  if (engineMatch) hits.push(`template-engine import: ${engineMatch[0]}`)

  // A write-template is a real IDENTIFIER → drop comments AND string contents.
  const nameCheckedSource = stripCommentsAndStrings(source, true)
  const nameRe = new RegExp(WRITE_TEMPLATE_NAME_RE.source, "gi")
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = nameRe.exec(nameCheckedSource))) {
    if (m[0].length === 0) {
      nameRe.lastIndex++
      continue
    }
    const identifier = expandToIdentifier(
      nameCheckedSource,
      m.index,
      m.index + m[0].length,
    )
    if (M2_1_BOOKING_TEMPLATE_ALLOWLIST.has(identifier.toLowerCase())) continue
    if (!seen.has(identifier)) {
      seen.add(identifier)
      hits.push(`write-template identifier: ${identifier}`)
    }
  }
  return hits
}

describe("[I9] no write-side templates (packages/brain/src)", () => {
  const prodFiles = collectProdSources(BRAIN_SRC)

  it("scans real sources (non-vacuous)", () => {
    expect(prodFiles.length).toBeGreaterThan(0)
  })

  // BEST-EFFORT tripwire, NOT robust enforcement: it catches the two OBVIOUS
  // reintroduction forms — a named template-engine import, or a `*Template`
  // identifier paired with a write word — on comment-/string-stripped code. It
  // does not attempt to defeat a determined author (dynamic `require`, string
  // concatenation of the engine name, an aliased identifier). Its job is to
  // make the easy backslide loud, and to NOT fire on prose that merely names a
  // write-template.
  it("detects the obvious reintroduction forms and ignores the legit OcrTemplate surface (best-effort tripwire)", () => {
    expect(findViolations(`import Handlebars from "handlebars"`)).not.toEqual(
      [],
    )
    expect(findViolations(`import { compile } from "mustache"`)).not.toEqual([])
    expect(
      findViolations(`const postingTemplate = "<Doklad>{{amount}}</Doklad>"`),
    ).not.toEqual([])
    expect(
      findViolations(`function renderXmlTemplate(p: Posting) {}`),
    ).not.toEqual([])
    expect(
      findViolations(`const writeTemplate = loadTemplate("booking.xml")`),
    ).not.toEqual([])
    expect(
      findViolations(`const bookingTemplate = compile(source)`),
    ).not.toEqual([])
    // The legitimate READ-side OCR extraction template surface must NEVER
    // false-positive — "template" alone, or paired with "ocr", is fine.
    expect(
      findViolations(`export interface OcrTemplate { supplierKey: string }`),
    ).toEqual([])
    expect(
      findViolations(
        `import { CreateOcrTemplateRequestSchema } from "@workspace/shared/api"`,
      ),
    ).toEqual([])
    expect(findViolations(`const templateId = capture.templateId`)).toEqual([])
  })

  it("does NOT trip on a comment or string literal that merely NAMES a write-template (scans code, not prose)", () => {
    // The exact false-positive that would otherwise break the build: an honest
    // doc comment explaining what we DON'T do.
    expect(
      findViolations(
        `// unlike a writeTemplate, we compose via typed functions`,
      ),
    ).toEqual([])
    expect(
      findViolations(`/* renderXmlTemplate is exactly what I9 forbids */`),
    ).toEqual([])
    // A block comment mentioning an engine by name is prose, not an import.
    expect(
      findViolations(`/* we deliberately avoid handlebars and mustache */`),
    ).toEqual([])
    // A string literal whose VALUE happens to contain the identifier pattern is
    // data, not a write-template — the name detector drops string contents.
    expect(findViolations(`const label = "postingTemplate"`)).toEqual([])
    // A comment containing a URL must not confuse the line-comment stripper.
    expect(
      findViolations(
        `const u = "https://afframe.com" // see writeTemplate note`,
      ),
    ).toEqual([])
    // ...but a REAL engine import surrounded by comments still trips.
    expect(
      findViolations(
        `// harmless comment\nimport { compile } from "mustache" // engine`,
      ),
    ).not.toEqual([])
  })

  // ── §I9 — the allowlist is exact-match + non-widening (currently empty) ────
  // The M2.1 `BookingTemplateMatch` carve-out was removed in WP5 (#775) with its
  // dead routing path; with an empty allowlist EVERY write-template identifier —
  // including `book(ing)`+`template` names — is a violation, so these confirm the
  // exact-match machinery still trips on such names rather than blessing them.
  it("trips on `book(ing)`+`template` identifiers now that the allowlist is empty", () => {
    expect(
      findViolations(`function bookingTemplateXmlRenderer(p: Posting) {}`),
    ).not.toEqual([])
    expect(
      findViolations(`const renderBookingTemplateWrite = (p: Posting) => p`),
    ).not.toEqual([])
    expect(findViolations(`class BookingTemplateMatchRenderer {}`)).not.toEqual(
      [],
    )
  })

  it("no production source under packages/brain/src declares a write-side template", () => {
    const offenders = prodFiles
      .map((file) => ({
        file,
        hits: findViolations(readFileSync(file, "utf8")),
      }))
      .filter((r) => r.hits.length > 0)
      .map(
        (r) =>
          `${r.file.replace(BRAIN_SRC, "packages/brain/src")}: ${r.hits.join(", ")}`,
      )
    expect(
      offenders,
      `Production source(s) under packages/brain/src declare a write-side ` +
        `template. I9: the write path is agent conversation with the typed ` +
        `functions, never a template-rendered payload. Offenders: ` +
        `${offenders.join(" | ")}`,
    ).toEqual([])
  })
})
