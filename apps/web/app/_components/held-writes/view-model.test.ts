/**
 * Unit tests for the held-write review view-model shaping (M0.5). Pure data
 * shaping, no DB / React — fixtures mirror the real gate output shapes:
 * `CaptureAccountingDocumentRequest` input (packages/shared/src/api/
 * accounting-writes.ts) and `output_json.serverGate` (apps/api/src/v1/
 * accounting/accounting-writes.gate.ts).
 */
import { describe, expect, it } from "vitest"

import {
  buildHeldWriteViewModel,
  groupHeldWritesByCase,
  holdReasonsFrom,
  type HeldWriteReviewSource,
} from "./view-model"

const CONVERSATION_A = "0196f1de-0000-7000-8000-0000000000a1"
const CONVERSATION_B = "0196f1de-0000-7000-8000-0000000000b2"

/** A held `captureAccountingDocument` write: two lines, two VAT rates (21 % and 12 %). */
function captureFixture(
  overrides: Partial<HeldWriteReviewSource> = {},
): HeldWriteReviewSource {
  return {
    id: "write-1",
    tool_name: "captureAccountingDocument",
    conversation_id: CONVERSATION_A,
    rationale: "Standard domestic service invoice, VAT 21% deductible.",
    counterparty_name: "Acme s.r.o.",
    input_json: {
      periodId: "period-1",
      seriesId: "series-1",
      type: "RECEIVED_INVOICE",
      issuedAt: "2026-06-01",
      lines: [
        {
          eventId: "event-1",
          description: "Nájem kanceláře",
          partials: [
            {
              baseAmount: "10000.00",
              vatMode: "STANDARD",
              vatRate: "21",
              vatAmount: "2100.00",
              currencyCode: "CZK",
            },
            {
              baseAmount: "1000.00",
              vatMode: "STANDARD",
              vatRate: "12",
              vatAmount: "120.00",
              currencyCode: "CZK",
            },
            // Second line at the SAME 21 % rate — must roll up into the first.
            {
              baseAmount: "500.00",
              vatMode: "STANDARD",
              vatRate: "21",
              vatAmount: "105.00",
              currencyCode: "CZK",
            },
          ],
        },
      ],
    },
    output_json: {
      status: "held",
      reviewId: "write-1",
      serverGate: {
        veto: { held: false, signals: [] },
        score: {
          cRaw: 0,
          cFinal: 0,
          isGreen: false,
          blocked: false,
          firedSignals: ["extraction_failed"],
          reasons: ["blocked: extraction_failed"],
        },
        templateId: null,
        templateNovel: false,
        ocrUnverified: false,
      },
    },
    ...overrides,
  }
}

describe("buildHeldWriteViewModel", () => {
  it("shapes the document header from a captureAccountingDocument payload", () => {
    const vm = buildHeldWriteViewModel(captureFixture())

    expect(vm.header.counterpartyName).toBe("Acme s.r.o.")
    expect(vm.header.date).toBe("2026-06-01")
    expect(vm.header.currency).toBe("CZK")
    // 10000 + 1000 + 500 base, 2100 + 120 + 105 vat = 13825.00 total.
    expect(vm.header.totalAmount).toBe("13825.00")
    // No designation exists pre-approval — never fabricated.
    expect(vm.header.documentNumber).toBeNull()
  })

  it("rolls partials up per VAT rate (per-line rollup by rate)", () => {
    const vm = buildHeldWriteViewModel(captureFixture())

    expect(vm.vatSummary).toHaveLength(2)
    const rate21 = vm.vatSummary.find((r) => r.rate === "21")
    const rate12 = vm.vatSummary.find((r) => r.rate === "12")
    expect(rate21).toEqual({
      rate: "21",
      rateLabel: "21 %",
      base: "10500.00", // 10000 + 500, the two 21 % lines rolled into one row
      vat: "2205.00", // 2100 + 105
      partialCount: 2, // rolled up from TWO partials — ambiguous, not 1:1 editable
    })
    expect(rate12).toEqual({
      rate: "12",
      rateLabel: "12 %",
      base: "1000.00",
      vat: "120.00",
      partialCount: 1, // a single source partial — safely 1:1 editable
    })
  })

  it("labels a rate-less partial by its VAT mode (exempt/reverse-charge/outside VAT)", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  baseAmount: "5000.00",
                  vatMode: "EXEMPT",
                  vatRate: null,
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
    )

    expect(vm.vatSummary).toEqual([
      {
        rate: null,
        rateLabel: "osvobozeno",
        base: "5000.00",
        vat: "0.00",
        partialCount: 1,
      },
    ])
  })

  it("carries the rationale through untouched", () => {
    const vm = buildHeldWriteViewModel(captureFixture())
    expect(vm.rationale).toBe(
      "Standard domestic service invoice, VAT 21% deductible.",
    )
  })

  it("shapes a createAccountingEvent header with no amount/VAT summary", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingEvent",
        input_json: {
          counterpartyId: "cp-1",
          description: "FP — nájem kanceláře",
          occurredAt: "2026-06-01",
        },
      }),
    )

    expect(vm.header.date).toBe("2026-06-01")
    expect(vm.header.totalAmount).toBeNull()
    expect(vm.header.currency).toBeNull()
    expect(vm.vatSummary).toEqual([])
    // [M1.7] No posting lines on an event — nothing to edit at that level.
    expect(vm.postingLines).toEqual([])
    expect(vm.postingKind).toBeNull()
  })

  it("surfaces the extracted counterparty IČO/DIČ on a createAccountingEvent header (the field the server dedups on)", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingEvent",
        counterparty_name: "Dodavatel s.r.o.",
        input_json: {
          counterparty: {
            name: "Dodavatel s.r.o.",
            ico: "10000001",
            dic: "CZ10000001",
          },
          description: "FP-2025-0042 — Dodavatel s.r.o.",
          occurredAt: "2026-06-01",
        },
      }),
    )
    expect(vm.header.counterpartyName).toBe("Dodavatel s.r.o.")
    // The IČO/DIČ (dedup keys) are visible so a reviewer can verify the field that BINDS the partner.
    expect(vm.header.counterpartyIco).toBe("10000001")
    expect(vm.header.counterpartyDic).toBe("CZ10000001")
  })

  it("leaves counterparty IČO/DIČ null on a capture header (the identity lives on the event, not the capture)", () => {
    const vm = buildHeldWriteViewModel(captureFixture())
    expect(vm.header.counterpartyIco).toBeNull()
    expect(vm.header.counterpartyDic).toBeNull()
  })

  it("shapes a createAccountingPosting header from the debit side of a double entry", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingPosting",
        input_json: {
          kind: "double",
          entry: {
            postingDate: "2026-06-01",
            lines: [
              { accountId: "acc-1", side: "DEBIT", amount: "12100.00" },
              { accountId: "acc-2", side: "CREDIT", amount: "12100.00" },
            ],
          },
        },
      }),
    )

    expect(vm.header.date).toBe("2026-06-01")
    expect(vm.header.totalAmount).toBe("12100.00")
    expect(vm.header.currency).toBe("CZK")
    expect(vm.vatSummary).toEqual([])
  })

  it("[M1.7] exposes double-entry posting lines (accountId/side/amount) for kind=double", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingPosting",
        input_json: {
          kind: "double",
          entry: {
            postingDate: "2026-06-01",
            lines: [
              { accountId: "acc-1", side: "DEBIT", amount: "12100.00" },
              { accountId: "acc-2", side: "CREDIT", amount: "12100.00" },
            ],
          },
        },
      }),
    )

    expect(vm.postingKind).toBe("double")
    expect(vm.postingLines).toEqual([
      { accountId: "acc-1", side: "DEBIT", amount: "12100.00" },
      { accountId: "acc-2", side: "CREDIT", amount: "12100.00" },
    ])
  })

  it("[M1.7] a monetary/cash posting has no editable posting lines", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingPosting",
        input_json: {
          kind: "monetary",
          entry: {
            postingDate: "2026-06-01",
            lines: [
              {
                location: "BANK",
                direction: "OUTFLOW",
                isTaxRelevant: false,
                amount: "500.00",
              },
            ],
          },
        },
      }),
    )

    expect(vm.postingKind).toBe("monetary")
    expect(vm.postingLines).toEqual([])
  })
})

describe("MD/D preview (buildHeldWriteViewModel.mddPreview)", () => {
  it("re-derives the předkontace scenario for a standard domestic RECEIVED service invoice", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          type: "RECEIVED_INVOICE",
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  baseAmount: "10000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "2100.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "SERVICES",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
    )

    expect(vm.mddPreview).not.toBeNull()
    expect(vm.mddPreview?.scenarioId).toBe("P-SERVICES-21")
    expect(vm.mddPreview?.lines).toEqual([
      {
        account: "518",
        side: "DEBIT",
        amount: "10000.00",
        label: "Ostatní služby",
      },
      { account: "343", side: "DEBIT", amount: "2100.00", label: null },
      { account: "321", side: "CREDIT", amount: "12100.00", label: null },
    ])
    expect(vm.mddPreview?.totalDebit).toBe("12100.00")
    expect(vm.mddPreview?.totalCredit).toBe("12100.00")
    expect(vm.mddPreview?.balanced).toBe(true)
  })

  it("labels a preview line from the passed-in chart of accounts when the scenario entry has no description", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          type: "RECEIVED_INVOICE",
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  baseAmount: "10000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "2100.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "SERVICES",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
      [{ id: "acc-343", number: "343", name: "DPH" }],
    )

    const line343 = vm.mddPreview?.lines.find((l) => l.account === "343")
    expect(line343?.label).toBe("DPH")
  })

  // #779 follow-up: bookDocument books a document all-or-nothing, so if ANY partial would hold at book time
  // (null / ASSET / ADVANCE supply_kind, or an unclassifiable row) the WHOLE document holds. The preview must
  // mirror that — a whole-document hold with the reason, NOT a partial posting of the bookable survivors
  // (which would over-state what the approve actually books).
  it("[#779] holds the WHOLE document (no partial posting) when one partial is an ASSET — matches bookDocument", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          type: "RECEIVED_INVOICE",
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  baseAmount: "90000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "18900.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "ASSET",
                  currencyCode: "CZK",
                },
                {
                  baseAmount: "1000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "210.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "SERVICES",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
    )

    expect(vm.mddPreview).not.toBeNull()
    expect(vm.mddPreview?.heldWholeDocument).toBe(true)
    // The bookable SERVICES survivor is NOT previewed — the whole document holds, so nothing books.
    expect(vm.mddPreview?.lines).toEqual([])
    expect(
      vm.mddPreview?.caveats.some((c) => c.includes("Dlouhodobý majetek")),
    ).toBe(true)
  })

  it("[#779] holds the WHOLE document when one partial has NO supply_kind — never a fabricated 548 posting", () => {
    // The core defect: an absent supplyKind previously defaulted to OTHER → a confident 548 posting the
    // approve then threw on. The preview must now mirror bookDocument's whole-document hold.
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          type: "RECEIVED_INVOICE",
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  baseAmount: "5000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "1050.00",
                  vatJurisdiction: "DOMESTIC",
                  // supplyKind deliberately absent
                  currencyCode: "CZK",
                },
                {
                  baseAmount: "1000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "210.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "SERVICES",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
    )

    expect(vm.mddPreview).not.toBeNull()
    expect(vm.mddPreview?.heldWholeDocument).toBe(true)
    // No lines at all — and certainly no fabricated 548 for the supply-kind-less partial.
    expect(vm.mddPreview?.lines).toEqual([])
    expect(vm.mddPreview?.caveats.some((c) => c.includes("druh plnění"))).toBe(
      true,
    )
  })

  it("[#779] a lone supply-kind-less partial previews as a whole-document HOLD (never a fabricated 548)", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          type: "RECEIVED_INVOICE",
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  baseAmount: "5000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "1050.00",
                  vatJurisdiction: "DOMESTIC",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
    )
    expect(vm.mddPreview).not.toBeNull()
    expect(vm.mddPreview?.heldWholeDocument).toBe(true)
    expect(vm.mddPreview?.lines).toEqual([])
  })

  it("[#779] holds the WHOLE document when one partial is an ADVANCE (§37a) — matches bookDocument", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          type: "RECEIVED_INVOICE",
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  baseAmount: "20000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "4200.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "ADVANCE",
                  currencyCode: "CZK",
                },
                {
                  baseAmount: "1000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "210.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "SERVICES",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
    )

    expect(vm.mddPreview).not.toBeNull()
    expect(vm.mddPreview?.heldWholeDocument).toBe(true)
    expect(vm.mddPreview?.lines).toEqual([])
    expect(vm.mddPreview?.caveats.some((c) => c.includes("Záloha"))).toBe(true)
  })

  it("[#779] previews the posting (heldWholeDocument false) when EVERY partial is bookable", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          type: "RECEIVED_INVOICE",
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  baseAmount: "10000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "2100.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "SERVICES",
                  currencyCode: "CZK",
                },
                {
                  baseAmount: "5000.00",
                  vatMode: "STANDARD",
                  vatRate: "12",
                  vatAmount: "600.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "SERVICES",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
    )

    expect(vm.mddPreview).not.toBeNull()
    expect(vm.mddPreview?.heldWholeDocument).toBe(false)
    expect(vm.mddPreview?.lines.length).toBeGreaterThan(0)
  })

  it("reverses the MD/D sides for a credit note captured with negative amounts (§42 dobropis)", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          type: "RECEIVED_INVOICE",
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  // Negative base/VAT is the only credit-note signal a capture
                  // carries — a normal supplyKind, no explicit isCreditNote fact.
                  baseAmount: "-10000.00",
                  vatMode: "STANDARD",
                  vatRate: "21",
                  vatAmount: "-2100.00",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "SERVICES",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
    )

    expect(vm.mddPreview).not.toBeNull()
    // Routed through the reverse-side template, not a normal-sided invoice.
    expect(vm.mddPreview?.scenarioId).toBe("P-CREDIT-NOTE-STD")
    // 321 debit (cut the payable), 518 credit (cut the cost), 343 credit (reverse input VAT).
    const line321 = vm.mddPreview?.lines.find((l) => l.account === "321")
    expect(line321?.side).toBe("DEBIT")
    expect(line321?.amount).toBe("12100.00")
    const line518 = vm.mddPreview?.lines.find((l) => l.account === "518")
    expect(line518?.side).toBe("CREDIT")
    expect(line518?.amount).toBe("10000.00")
    expect(vm.mddPreview?.balanced).toBe(true)
    // Amounts are shown as magnitudes, never the raw negatives.
    expect(vm.mddPreview?.lines.every((l) => !l.amount.startsWith("-"))).toBe(
      true,
    )
    // The reviewer is warned this is a credit note (special-regime sign caveat).
    expect(vm.mddPreview?.caveats.some((c) => c.includes("dobropis"))).toBe(
      true,
    )
  })

  it("degrades a partial whose derivation throws (implausible vat_rate) to a whole-document hold, never an exception", () => {
    const build = () =>
      buildHeldWriteViewModel(
        captureFixture({
          input_json: {
            type: "RECEIVED_INVOICE",
            issuedAt: "2026-06-01",
            lines: [
              {
                eventId: "event-1",
                partials: [
                  {
                    // 99 % is not a valid CZ VAT rate — classifyEvent throws.
                    baseAmount: "5000.00",
                    vatMode: "STANDARD",
                    vatRate: "99",
                    vatAmount: "4950.00",
                    vatJurisdiction: "DOMESTIC",
                    supplyKind: "SERVICES",
                    currencyCode: "CZK",
                  },
                  {
                    // A valid partial in the same document — but the doc still holds as a whole (bookDocument
                    // would throw on the implausible-rate partial and roll back the entire approve).
                    baseAmount: "1000.00",
                    vatMode: "STANDARD",
                    vatRate: "21",
                    vatAmount: "210.00",
                    vatJurisdiction: "DOMESTIC",
                    supplyKind: "SERVICES",
                    currencyCode: "CZK",
                  },
                ],
              },
            ],
          },
        }),
      )

    // The bad partial must NOT crash the whole (read-only) page render.
    expect(build).not.toThrow()
    const vm = build()
    expect(vm.mddPreview).not.toBeNull()
    // The whole document holds — no partial posting of the valid survivor.
    expect(vm.mddPreview?.heldWholeDocument).toBe(true)
    expect(vm.mddPreview?.lines).toEqual([])
    expect(
      vm.mddPreview?.caveats.some((c) => c.includes("nebylo možné zařadit")),
    ).toBe(true)
  })

  it("returns null for a non-invoice capture (bank statement — not booked via předkontace)", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        input_json: {
          type: "BANK_STATEMENT",
          issuedAt: "2026-06-01",
          lines: [
            {
              eventId: "event-1",
              partials: [
                {
                  baseAmount: "500.00",
                  vatMode: "OUTSIDE_VAT",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        },
      }),
    )

    expect(vm.mddPreview).toBeNull()
  })

  it("shows a createAccountingPosting's proposed double-entry lines verbatim, resolving accountId to a chart number/name", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingPosting",
        input_json: {
          kind: "double",
          entry: {
            postingDate: "2026-06-01",
            lines: [
              { accountId: "acc-1", side: "DEBIT", amount: "12100.00" },
              { accountId: "acc-2", side: "CREDIT", amount: "12100.00" },
            ],
          },
        },
      }),
      [
        { id: "acc-1", number: "321", name: "Dodavatelé" },
        { id: "acc-2", number: "221", name: "Bankovní účty" },
      ],
    )

    expect(vm.mddPreview).toEqual({
      scenarioId: null,
      scenarioLabel: null,
      lines: [
        {
          account: "321",
          side: "DEBIT",
          amount: "12100.00",
          label: "Dodavatelé",
        },
        {
          account: "221",
          side: "CREDIT",
          amount: "12100.00",
          label: "Bankovní účty",
        },
      ],
      totalDebit: "12100.00",
      totalCredit: "12100.00",
      balanced: true,
      heldWholeDocument: false,
      caveats: [],
    })
  })

  it("flags an unbalanced proposed posting instead of silently accepting it", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingPosting",
        input_json: {
          kind: "double",
          entry: {
            postingDate: "2026-06-01",
            lines: [
              { accountId: "acc-1", side: "DEBIT", amount: "12100.00" },
              { accountId: "acc-2", side: "CREDIT", amount: "12000.00" },
            ],
          },
        },
      }),
    )

    expect(vm.mddPreview?.balanced).toBe(false)
  })

  it("flags a sub-half-cent imbalance the old float epsilon (< 0.005) masked (exact integer minor-unit math)", () => {
    // DEBIT 100.00 vs CREDIT 100.004: the old `Math.abs(100 - 100.004) < 0.005`
    // float check reported this as BALANCED; exact ten-thousandth minor units
    // (1000000 ≠ 1000040) correctly flag it. The displayed 2dp totals are
    // identical ("100.00"), so ONLY the exact `balanced` boolean distinguishes
    // the fix — this test fails under the old float summation, passes under it.
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingPosting",
        input_json: {
          kind: "double",
          entry: {
            postingDate: "2026-06-01",
            lines: [
              { accountId: "acc-1", side: "DEBIT", amount: "100.00" },
              { accountId: "acc-2", side: "CREDIT", amount: "100.004" },
            ],
          },
        },
      }),
    )

    expect(vm.mddPreview?.totalDebit).toBe("100.00")
    expect(vm.mddPreview?.totalCredit).toBe("100.00")
    expect(vm.mddPreview?.balanced).toBe(false)
  })

  it("sums posting totals with exact integer minor-unit math, no float drift", () => {
    // 0.10 + 0.20 float-sums to 0.30000000000000004, and 0.10 × 3 to the same;
    // exact minor units give a clean 0.30 on both sides and a balanced entry.
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingPosting",
        input_json: {
          kind: "double",
          entry: {
            postingDate: "2026-06-01",
            lines: [
              { accountId: "acc-1", side: "DEBIT", amount: "0.10" },
              { accountId: "acc-1", side: "DEBIT", amount: "0.20" },
              { accountId: "acc-2", side: "CREDIT", amount: "0.10" },
              { accountId: "acc-2", side: "CREDIT", amount: "0.10" },
              { accountId: "acc-2", side: "CREDIT", amount: "0.10" },
            ],
          },
        },
      }),
    )

    expect(vm.mddPreview?.totalDebit).toBe("0.30")
    expect(vm.mddPreview?.totalCredit).toBe("0.30")
    expect(vm.mddPreview?.balanced).toBe(true)
  })

  it("returns null for a monetary (cash-regime) posting — předkontace/MD-D is double-entry only", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingPosting",
        input_json: {
          kind: "monetary",
          entry: {
            postingDate: "2026-06-01",
            lines: [
              {
                location: "BANK",
                direction: "OUTFLOW",
                isTaxRelevant: false,
                amount: "500.00",
              },
            ],
          },
        },
      }),
    )

    expect(vm.mddPreview).toBeNull()
  })

  it("returns null for a createAccountingEvent (no posting data at all)", () => {
    const vm = buildHeldWriteViewModel(
      captureFixture({
        tool_name: "createAccountingEvent",
        input_json: {
          counterpartyId: "cp-1",
          description: "FP — nájem kanceláře",
          occurredAt: "2026-06-01",
        },
      }),
    )

    expect(vm.mddPreview).toBeNull()
  })
})

describe("holdReasonsFrom", () => {
  it("decodes the server veto signals when the veto held", () => {
    const reasons = holdReasonsFrom({
      serverGate: {
        veto: { held: true, signals: ["asset_vs_expense"] },
        score: { reasons: ["green"] },
      },
    })
    expect(reasons).toEqual([
      "Ověřovací kontrola: možná záměna aktivum / náklad (DHM ≥ 40 000 Kč)",
    ])
  })

  it("[S8] treats a skipped veto as not-evaluated (surfaces no veto reason)", () => {
    // A sub-threshold write records `veto: {skipped:true}` instead of {held:false}.
    // holdReasonsFrom must not mistake it for a held/evaluated veto — only the
    // score reasons surface, never a veto line.
    const reasons = holdReasonsFrom({
      serverGate: {
        veto: { skipped: true, reason: "confidence_below_threshold" },
        score: { reasons: ["below green threshold 0.9", "green"] },
      },
    })
    expect(reasons).toEqual([
      "Jistota pod prahem pro automatické zaúčtování (0.9)",
    ])
  })

  it("decodes score reasons and drops the literal 'green'", () => {
    const reasons = holdReasonsFrom({
      serverGate: {
        veto: { held: false, signals: [] },
        score: {
          reasons: [
            "below green threshold 0.9",
            "capped by vat_mismatch at 0.8",
            "green",
          ],
        },
      },
    })
    expect(reasons).toEqual([
      "Jistota pod prahem pro automatické zaúčtování (0.9)",
      "Omezeno signálem „nesoulad vypočtené a uvedené DPH“ na jistotu 0.8",
    ])
  })

  it("returns an empty list when there is no serverGate (defensive)", () => {
    expect(holdReasonsFrom(null)).toEqual([])
    expect(holdReasonsFrom({})).toEqual([])
  })

  it("surfaces the openObligation directive on a held createAccountingPosting so the reviewer sees it", () => {
    const vm = buildHeldWriteViewModel({
      id: "p1",
      tool_name: "createAccountingPosting",
      conversation_id: null,
      rationale: null,
      counterparty_name: "ACME s.r.o.",
      input_json: {
        kind: "double",
        entry: {
          periodId: "00000000-0000-4000-8000-000000000001",
          summaryRecordId: "00000000-0000-4000-8000-000000000002",
          accountingEventId: "00000000-0000-4000-8000-000000000003",
          postingDate: "2026-03-14",
          lines: [
            { accountId: "a", side: "DEBIT", amount: "1000.00" },
            { accountId: "b", side: "CREDIT", amount: "1000.00" },
          ],
        },
        openObligation: {
          saldoAccountNumber: "321",
          direction: "PAYABLE",
          issueDate: "2026-03-14",
          dueDate: "2026-04-14",
          variableSymbol: "12345",
        },
      },
      output_json: null,
    })
    expect(vm.header.obligation).toEqual({
      saldoAccountNumber: "321",
      direction: "PAYABLE",
      issueDate: "2026-03-14",
      dueDate: "2026-04-14",
      variableSymbol: "12345",
    })
  })

  it("leaves obligation null for a posting with no openObligation directive", () => {
    const vm = buildHeldWriteViewModel({
      id: "p2",
      tool_name: "createAccountingPosting",
      conversation_id: null,
      rationale: null,
      counterparty_name: null,
      input_json: {
        kind: "double",
        entry: {
          periodId: "00000000-0000-4000-8000-000000000001",
          summaryRecordId: "00000000-0000-4000-8000-000000000002",
          accountingEventId: "00000000-0000-4000-8000-000000000003",
          postingDate: "2026-03-14",
          lines: [],
        },
      },
      output_json: null,
    })
    expect(vm.header.obligation).toBeNull()
  })

  it("labels the Tier-1.5 counterparty_register_mismatch cap in Czech, not the raw token", () => {
    const reasons = holdReasonsFrom({
      serverGate: {
        veto: { held: false, signals: [] },
        score: { reasons: ["capped by counterparty_register_mismatch at 0.7"] },
      },
    })
    expect(reasons).toEqual([
      "Omezeno signálem „název protistrany neodpovídá rejstříku ARES (ověřte IČO)“ na jistotu 0.7",
    ])
    expect(reasons[0]).not.toContain("counterparty_register_mismatch")
  })

  it("labels every Tier-1/Tier-3 block signal kind in Czech, not the raw token", () => {
    // extraction_failed is the dominant pre-launch cold-start hold reason (signals.ts TIER3_DEFER_KINDS)
    // — it MUST render as Czech prose, never as the raw "extraction_failed" jargon.
    const cases: Array<[kind: string, expectedCzech: string]> = [
      ["extraction_failed", "extrakce dokladu selhala, nutná ruční kontrola"],
      ["no_source_doc", "chybí zdrojový doklad"],
      ["closed_period", "účetní období je uzavřené"],
    ]

    for (const [kind, expectedCzech] of cases) {
      const reasons = holdReasonsFrom({
        serverGate: {
          veto: { held: false, signals: [] },
          score: { reasons: [`blocked: ${kind}`] },
        },
      })
      expect(reasons).toEqual([`Blokováno: ${expectedCzech}`])
      // The raw token must never leak into the rendered reason.
      expect(reasons[0]).not.toContain(kind)
    }
  })

  it("falls back to the raw string for an unknown/future signal kind (never crashes)", () => {
    const reasons = holdReasonsFrom({
      serverGate: {
        veto: { held: false, signals: [] },
        score: { reasons: ["blocked: some_future_signal"] },
      },
    })
    expect(reasons).toEqual(["Blokováno: some_future_signal"])
  })
})

describe("groupHeldWritesByCase", () => {
  it("groups multiple held writes sharing a conversationId into one case", () => {
    const eventWrite = buildHeldWriteViewModel(
      captureFixture({
        id: "write-event",
        tool_name: "createAccountingEvent",
        conversation_id: CONVERSATION_A,
        input_json: { description: "FP", occurredAt: "2026-06-01" },
      }),
    )
    const captureWrite = buildHeldWriteViewModel(
      captureFixture({ id: "write-capture", conversation_id: CONVERSATION_A }),
    )
    const unrelatedWrite = buildHeldWriteViewModel(
      captureFixture({ id: "write-other", conversation_id: CONVERSATION_B }),
    )
    const soloWrite = buildHeldWriteViewModel(
      captureFixture({ id: "write-solo", conversation_id: null }),
    )

    const groups = groupHeldWritesByCase([
      eventWrite,
      captureWrite,
      unrelatedWrite,
      soloWrite,
    ])

    expect(groups).toHaveLength(3)

    const caseA = groups.find((g) => g.conversationId === CONVERSATION_A)
    expect(caseA?.writes.map((w) => w.id)).toEqual([
      "write-event",
      "write-capture",
    ])

    const caseB = groups.find((g) => g.conversationId === CONVERSATION_B)
    expect(caseB?.writes.map((w) => w.id)).toEqual(["write-other"])

    const solo = groups.find((g) => g.writes[0]?.id === "write-solo")
    expect(solo?.conversationId).toBeNull()
    expect(solo?.writes).toHaveLength(1)
  })
})

describe("Tier-3 register-card detail sections (buildHeldWriteViewModel.details)", () => {
  function sourceFor(
    tool_name: string,
    input_json: Record<string, unknown>,
  ): HeldWriteReviewSource {
    return {
      id: "write-t3",
      tool_name,
      conversation_id: null,
      rationale: "Tier-3 register-card creator.",
      counterparty_name: null,
      input_json,
      output_json: { status: "held", payloadHash: "hash" },
    }
  }

  it("createAsset: name+acquisitionCost in the header, every other field as a labeled detail row", () => {
    const vm = buildHeldWriteViewModel(
      sourceFor("createAsset", {
        periodId: "0196f1de-0000-7000-8000-000000000101",
        seriesId: "0196f1de-0000-7000-8000-000000000102",
        name: "Notebook Dell Latitude",
        category: "TANGIBLE_DEPRECIABLE",
        accountNumber: "022",
        commissioningDate: "2025-03-14",
        acquisitionCost: "45000.00",
        location: "Praha",
        // gate envelope — must never surface as a detail row.
        confidence: 0.6,
        rationale: "Nová karta majetku",
      }),
    )
    expect(vm.detailsTitle).toBe("Detaily karty majetku")
    expect(vm.header.caseDescription).toBe("Notebook Dell Latitude")
    expect(vm.header.totalAmount).toBe("45000.00")
    expect(vm.header.currency).toBe("CZK")
    const byLabel = Object.fromEntries(
      vm.details.map((d) => [d.label, d.value]),
    )
    expect(byLabel["Kategorie"]).toBe("hmotný odpisovaný majetek")
    expect(byLabel["Účet"]).toBe("022")
    expect(byLabel["Datum zařazení"]).toBe("2025-03-14")
    expect(byLabel["Umístění"]).toBe("Praha")
    // The gate envelope is never a detail row.
    expect(vm.details.some((d) => d.label === "confidence")).toBe(false)
    expect(vm.details.some((d) => d.label === "rationale")).toBe(false)
  })

  it("createDepreciationPlan: method label in the header, monthlyAmount as the total", () => {
    const vm = buildHeldWriteViewModel(
      sourceFor("createDepreciationPlan", {
        periodId: "0196f1de-0000-7000-8000-000000000101",
        assetId: "0196f1de-0000-7000-8000-000000000501",
        method: "STRAIGHT_LINE",
        startDate: "2025-03-14",
        monthlyAmount: "1250.00",
        expenseAccountNumber: "551",
        accumulatedAccountNumber: "082",
      }),
    )
    expect(vm.detailsTitle).toBe("Detaily odpisového plánu")
    expect(vm.header.caseDescription).toBe("Odpisový plán — rovnoměrné odpisy")
    expect(vm.header.totalAmount).toBe("1250.00")
    const byLabel = Object.fromEntries(
      vm.details.map((d) => [d.label, d.value]),
    )
    expect(byLabel["Nákladový účet"]).toBe("551")
    expect(byLabel["Účet oprávek"]).toBe("082")
  })

  it("createInventoryCount: description as the header, seriesId+countDate as details", () => {
    const vm = buildHeldWriteViewModel(
      sourceFor("createInventoryCount", {
        periodId: "0196f1de-0000-7000-8000-000000000101",
        seriesId: "0196f1de-0000-7000-8000-000000000102",
        countDate: "2025-12-31",
        description: "Roční inventura skladu",
      }),
    )
    expect(vm.detailsTitle).toBe("Detaily inventurního soupisu")
    expect(vm.header.caseDescription).toBe("Roční inventura skladu")
    const byLabel = Object.fromEntries(
      vm.details.map((d) => [d.label, d.value]),
    )
    expect(byLabel["Datum inventury"]).toBe("2025-12-31")
  })

  it("an UNMAPPED future op renders a generic key/value dump (envelope peeled), never blind", () => {
    const vm = buildHeldWriteViewModel(
      sourceFor("createSomethingBrandNew", {
        widgetId: "w-1",
        quantity: 3,
        nested: { a: 1 },
        confidence: 0.6,
        rationale: "future op",
        signals: { kbRule: "x" },
      }),
    )
    expect(vm.detailsTitle).toBe("Nestrukturovaný náhled")
    const byLabel = Object.fromEntries(
      vm.details.map((d) => [d.label, d.value]),
    )
    expect(byLabel["widgetId"]).toBe("w-1")
    expect(byLabel["quantity"]).toBe("3")
    expect(byLabel["nested"]).toBe('{"a":1}')
    // The gate envelope (confidence/rationale/signals) is stripped, not dumped.
    expect(vm.details.some((d) => d.label === "confidence")).toBe(false)
    expect(vm.details.some((d) => d.label === "rationale")).toBe(false)
    expect(vm.details.some((d) => d.label === "signals")).toBe(false)
  })
})
