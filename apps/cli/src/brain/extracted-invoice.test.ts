/**
 * [#570 · WP2 Task 2.2] The machine IR contract shared by `brain extract --out` (emit) and
 * `brain event`/`book --extracted` (read): `parseExtractedInvoice` (the single validator) + `extractIrJson`
 * (the sentinel-block reader). Proves the fail-closed guarantees Advisor A3 required: required fields asserted
 * (a bare `{record_type:"invoice"}` is rejected), money round-trips losslessly through the `*_minor` string
 * form, and an unsafe JSON number is rejected — so `--out` can never write an IR a later `--extracted` trusts.
 */
import { describe, expect, it } from "vitest"

import { extractIrJson, parseExtractedInvoice } from "./command"
import { IR_BEGIN, IR_END } from "./extract-config"

const validInvoice = {
  record_type: "invoice",
  direction: "received",
  doc_type: "invoice",
  number: "FP2026-001",
  issue_date: "2026-06-01",
  currency: "CZK",
  lines: [{ description: "Nájem kanceláře", unit_price_minor: "150000" }],
  vat_summary: [{ rate: 21, base_minor: "150000", tax_minor: "31500" }],
  total_minor: "181500",
}

/** Serialize an object the way `--out` writes it (bigint → canonical integer string). */
function emit(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  )
}

describe("parseExtractedInvoice (#570 shared IR validator)", () => {
  it("revives every *_minor money field to a bigint", () => {
    const ir = parseExtractedInvoice(JSON.stringify(validInvoice), "--out")
    expect(ir.total_minor).toBe(181500n)
    expect(ir.lines[0]?.unit_price_minor).toBe(150000n)
    expect(ir.vat_summary[0]?.base_minor).toBe(150000n)
    expect(ir.vat_summary[0]?.tax_minor).toBe(31500n)
  })

  it("rejects a shallow {record_type:'invoice'} — required fields are asserted", () => {
    expect(() =>
      parseExtractedInvoice(
        JSON.stringify({ record_type: "invoice" }),
        "--out",
      ),
    ).toThrow(/missing required field/i)
  })

  it("names every missing required field", () => {
    const { total_minor: _t, currency: _c, ...partial } = validInvoice
    expect(() =>
      parseExtractedInvoice(JSON.stringify(partial), "--out"),
    ).toThrow(/total_minor/)
  })

  it("rejects a non-invoice record_type", () => {
    expect(() =>
      parseExtractedInvoice(
        JSON.stringify({ ...validInvoice, record_type: "bank_transaction" }),
        "--out",
      ),
    ).toThrow(/record_type/)
  })

  it("rejects an unsafe-integer JSON number in a money field (no silent precision loss)", () => {
    // 9007199254740993 is > Number.MAX_SAFE_INTEGER — as a JSON number it would lose precision.
    const raw = `{"record_type":"invoice","direction":"received","doc_type":"invoice","number":"x","issue_date":"2026-01-01","currency":"CZK","lines":[],"vat_summary":[],"total_minor":9007199254740993}`
    expect(() => parseExtractedInvoice(raw, "--out")).toThrow(
      /integer minor-unit/,
    )
  })

  it("round-trips a large money value losslessly through the string form", () => {
    const big = { ...validInvoice, total_minor: "9007199254740993000" }
    const ir = parseExtractedInvoice(emit(big), "--out")
    expect(ir.total_minor).toBe(9007199254740993000n)
    // emit → parse → emit is stable.
    expect(parseExtractedInvoice(emit({ ...ir }), "--out").total_minor).toBe(
      9007199254740993000n,
    )
  })
})

describe("extractIrJson (sentinel-block reader)", () => {
  const block = (json: string) => `${IR_BEGIN}\n${json}\n${IR_END}`

  it("returns the inner JSON of a single sentinel block", () => {
    const report = `human report...\n${block('{"record_type":"invoice"}')}\n`
    expect(extractIrJson(report)).toBe('{"record_type":"invoice"}')
  })

  it("returns null when no sentinel block is present (fail-closed)", () => {
    expect(
      extractIrJson("just a free-text report, no machine block"),
    ).toBeNull()
  })

  it("returns the LAST block when the model emits more than one (IR is the final output)", () => {
    const report = `${block('{"n":1}')}\nmore text\n${block('{"n":2}')}`
    expect(extractIrJson(report)).toBe('{"n":2}')
  })

  it("returns null on an unterminated block (begin without end)", () => {
    expect(extractIrJson(`${IR_BEGIN}\n{"record_type":"invoice"}`)).toBeNull()
  })

  it("feeds straight into parseExtractedInvoice for the full emit→read path", () => {
    const report = `report\n${block(emit(validInvoice))}`
    const raw = extractIrJson(report)
    expect(raw).not.toBeNull()
    expect(parseExtractedInvoice(raw as string, "--out").total_minor).toBe(
      181500n,
    )
  })
})
