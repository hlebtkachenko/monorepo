import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { planBrainDryRun } from "@workspace/intake"
import { readInputs } from "./command"

// [W1.3] `brain run --inputs <file.json>` used to break on the IR money fields: they are `bigint` minor
// units (haléř) in TypeScript, but `JSON.parse` produces `number`, so the values arrived as the wrong type
// (and lost precision past 2^53). The fix reads each `_minor` field as the platform's Money-over-JSON
// convention — an integer minor-unit STRING (packages/shared `MoneySchema`) — and reconstructs it via
// `BigInt(...)`, exactly as every IR parser builds them (`tabular.ts`, `pohoda.ts`). `brain book` never hit
// this because it parses tabular strings, never JSON.

// A minimal `--inputs` file, with every IR money field carried as an integer minor-unit STRING.
const inputsFile = (money: {
  total: unknown
  base: unknown
  tax: unknown
}): Record<string, unknown> => ({
  invoice: {
    ir_id: "ir-1",
    org_ref: "org-1",
    source: "isdoc",
    source_locator: "dump/invoices/FP-0042.xml",
    source_hash: "hash-1",
    ingested_at: "2026-07-01T00:00:00.000Z",
    confidence: 0.95,
    needs_review: false,
    raw: {},
    record_type: "invoice",
    direction: "received",
    doc_type: "invoice",
    number: "FP-2025-0042",
    issue_date: "2025-03-14",
    currency: "CZK",
    lines: [],
    vat_summary: [{ rate: 21, base_minor: money.base, tax_minor: money.tax }],
    total_minor: money.total,
  },
  sections: {
    constitution: "I1..In (locked)",
    kb: { id: "kb-1", version: "2026-07-01" },
    lawSummary: "law digest",
    confidenceProtocol: "server scores; the model never self-scores",
    escalationPolicy: "route hard cases to a human",
  },
  captureContext: {
    periodId: "00000000-0000-4000-8000-000000000001",
    seriesId: "00000000-0000-4000-8000-000000000002",
    eventId: "00000000-0000-4000-8000-000000000003",
    confidence: 0.95,
    rationale: "Standard domestic service invoice, VAT 21% deductible.",
  },
})

describe("readInputs (brain run --inputs bigint reviver) [W1.3]", () => {
  let dir: string
  const write = (obj: unknown): string => {
    const path = join(dir, "inputs.json")
    writeFileSync(path, JSON.stringify(obj))
    return path
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brain-inputs-"))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("reconstructs every IR money field as a bigint from its minor-unit string", () => {
    const path = write(
      inputsFile({ total: "121000", base: "100000", tax: "21000" }),
    )
    const parsed = readInputs(path)
    expect(parsed.invoice.total_minor).toBe(121000n)
    expect(parsed.invoice.vat_summary[0]!.base_minor).toBe(100000n)
    expect(parsed.invoice.vat_summary[0]!.tax_minor).toBe(21000n)
  })

  it("preserves full precision past 2^53 (the JSON-float-loss vector this fix closes)", () => {
    // 9_007_199_254_740_993 = Number.MAX_SAFE_INTEGER + 2; a JSON number would round it to ...992.
    const path = write(
      inputsFile({
        total: "9007199254740993",
        base: "9007199254740993",
        tax: "0",
      }),
    )
    const parsed = readInputs(path)
    expect(parsed.invoice.total_minor).toBe(9007199254740993n)
  })

  it("feeds cleanly into planBrainDryRun (the round-trip is end-to-end usable, not just typed)", () => {
    const path = write(
      inputsFile({ total: "121000", base: "100000", tax: "21000" }),
    )
    const plan = planBrainDryRun(readInputs(path))
    // The WP-A adapter serialized the reconstructed bigints back to decimals via minorToDecimal:
    // base_minor 100000n → "1000.00", tax_minor 21000n → "210.00". A `number` (or a lossy parse) here
    // would either throw in minorToDecimal (not a bigint) or mis-scale — this is the before/after proof.
    const partial = plan.captureRequest.lines[0]!.partials[0]!
    expect(partial.baseAmount).toBe("1000.00")
    expect(partial).toMatchObject({ vatAmount: "210.00" })
  })

  it("tolerates a plain integer number for a money field (hand-written fixtures)", () => {
    const path = write(inputsFile({ total: 121000, base: 100000, tax: 21000 }))
    const parsed = readInputs(path)
    expect(parsed.invoice.total_minor).toBe(121000n)
    expect(parsed.invoice.vat_summary[0]!.base_minor).toBe(100000n)
  })

  it("fails LOUD on a non-integer (float) money field rather than truncating a booked amount", () => {
    const path = write(
      inputsFile({ total: 1210.5, base: "100000", tax: "21000" }),
    )
    expect(() => readInputs(path)).toThrow(/total_minor/)
    // The reviver is a factory threaded with the real flag, so the boundary error
    // names `--inputs` (not a hardcoded flag) — proves the factory wiring.
    expect(() => readInputs(path)).toThrow(/--inputs/)
  })

  it("fails LOUD on a malformed money string", () => {
    const path = write(
      inputsFile({ total: "1_000", base: "100000", tax: "21000" }),
    )
    expect(() => readInputs(path)).toThrow(/total_minor/)
  })

  it("fails LOUD on a bare JSON number above 2^53 (already precision-lost at parse) instead of booking the rounded value", () => {
    // 9007199254740993 as a bare JSON number is rounded to ...992 by JSON.parse BEFORE the reviver
    // runs, so silently accepting it would book a wrong amount. Only the string form (tested above)
    // survives; a bare number this large must throw. This is why the reviver uses isSafeInteger.
    const path = write(
      inputsFile({ total: 9007199254740993, base: "100000", tax: "21000" }),
    )
    expect(() => readInputs(path)).toThrow(/total_minor/)
  })
})
