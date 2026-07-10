import { describe, expect, it } from "vitest"
import {
  classifyExtractionEngine,
  hasAmbiguousCzAmount,
  resolveExtractionMethod,
  type ExtractionEngine,
} from "./extraction-engine"

const DIGITAL_INVOICE_TEXT = `
Faktura - danovy doklad c. 2026-00123

Dodavatel: Afframe s.r.o., ICO 12345678
Odberatel: Testovaci firma s.r.o.

Datum vystaveni: 01.03.2026
Datum splatnosti: 15.03.2026

Polozka                 Zaklad        DPH 21%       Celkem
Konzultacni sluzby      10 000,00     2 100,00      12 100,00

Celkem k uhrade: 12 100,00 Kc
`

describe("classifyExtractionEngine — fail-closed (#565)", () => {
  it("fails closed to vision-only when there is NO text-layer signal at all", () => {
    expect(classifyExtractionEngine(null)).toBe("vision-only")
  })

  it("fails closed to vision-only on sparse/near-empty text (a stray watermark, not a real layer)", () => {
    expect(classifyExtractionEngine({ text: "" })).toBe("vision-only")
    expect(classifyExtractionEngine({ text: "   \n  " })).toBe("vision-only")
    expect(classifyExtractionEngine({ text: "Page 3" })).toBe("vision-only")
  })

  it("classifies substantial, unambiguous embedded text as digital-text-layer", () => {
    expect(classifyExtractionEngine({ text: DIGITAL_INVOICE_TEXT })).toBe(
      "digital-text-layer",
    )
  })

  it("fails closed to vision-only when the text carries a locale-AMBIGUOUS CZ amount (CZ-OCR amounts fail closed like vision)", () => {
    const withAmbiguousAmount = `${DIGITAL_INVOICE_TEXT}\nDoplatek: 1.234\n`
    expect(classifyExtractionEngine({ text: withAmbiguousAmount })).toBe(
      "vision-only",
    )
  })

  it("is deterministic for the SAME input (no clock/randomness)", () => {
    const a = classifyExtractionEngine({ text: DIGITAL_INVOICE_TEXT })
    const b = classifyExtractionEngine({ text: DIGITAL_INVOICE_TEXT })
    expect(a).toBe(b)
  })
})

describe("hasAmbiguousCzAmount", () => {
  it("flags a bare dot-grouped triplet with no decimal suffix (genuinely ambiguous)", () => {
    expect(hasAmbiguousCzAmount("Doplatek: 1.234")).toBe(true)
    expect(hasAmbiguousCzAmount("celkem 12.345 Kc")).toBe(true)
  })

  it("does NOT flag CZ-standard space-thousands + comma-decimal (unambiguous)", () => {
    expect(hasAmbiguousCzAmount("Celkem: 1 234,56 Kc")).toBe(false)
  })

  it("does NOT flag a plain 2-decimal amount (not a 3-digit group)", () => {
    expect(hasAmbiguousCzAmount("Amount: 45.67")).toBe(false)
    expect(hasAmbiguousCzAmount("Total 1234.56")).toBe(false)
  })

  it("DELIBERATELY over-flags a comma-disambiguated dot-thousands amount (conservative by design)", () => {
    // "12.345,67" is actually unambiguous to a human (the trailing ",67" proves the dot is a thousands
    // separator) but this function does not parse that far — it trips anyway. Documented + tested so the
    // conservative choice is visible, not an accidental gap. Costs nothing: it only downgrades the internal
    // engine tag, never the wire extractionMethod stamp (see extraction-engine.ts's doc comment).
    expect(hasAmbiguousCzAmount("12.345,67")).toBe(true)
  })
})

describe("resolveExtractionMethod — fail-closed proof (#565)", () => {
  it("resolves EVERY ExtractionEngine member to the weakest wire value: 'ocr'", () => {
    const engines: readonly ExtractionEngine[] = [
      "digital-text-layer",
      "vision-only",
    ]
    for (const engine of engines) {
      expect(resolveExtractionMethod(engine)).toBe("ocr")
    }
  })

  it("never resolves to 'structured' or 'manual' — there is no code path that can", () => {
    expect(resolveExtractionMethod("digital-text-layer")).not.toBe("structured")
    expect(resolveExtractionMethod("digital-text-layer")).not.toBe("manual")
    expect(resolveExtractionMethod("vision-only")).not.toBe("structured")
    expect(resolveExtractionMethod("vision-only")).not.toBe("manual")
  })
})
