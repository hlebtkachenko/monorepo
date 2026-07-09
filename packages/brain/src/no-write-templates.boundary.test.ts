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
 */

const BRAIN_SRC = resolve(__dirname) // packages/brain/src

const TEMPLATE_ENGINE_RE = /\b(?:handlebars|mustache|nunjucks|ejs|pug)\b/i
const WRITE_TEMPLATE_NAME_RE =
  /(?:post(?:ing)?|writ(?:e|ing)|book(?:ing)?|xml)[a-z]*template|template[a-z]*(?:post(?:ing)?|writ(?:e|ing)|book(?:ing)?|xml)/i

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

/** Every write-template indicator `source` contains, or `[]` if clean. */
function findViolations(source: string): string[] {
  const hits: string[] = []
  const engineMatch = TEMPLATE_ENGINE_RE.exec(source)
  if (engineMatch) hits.push(`template-engine import: ${engineMatch[0]}`)
  const nameMatch = WRITE_TEMPLATE_NAME_RE.exec(source)
  if (nameMatch) hits.push(`write-template identifier: ${nameMatch[0]}`)
  return hits
}

describe("[I9] no write-side templates (packages/brain/src)", () => {
  const prodFiles = collectProdSources(BRAIN_SRC)

  it("scans real sources (non-vacuous)", () => {
    expect(prodFiles.length).toBeGreaterThan(0)
  })

  it("detects every realistic evasion form and ignores the legitimate OcrTemplate surface (the detector is real)", () => {
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
