import { describe, expect, it, vi } from "vitest"

import type { AfframeClient } from "@afframe/sdk"
import type { Invoice } from "@workspace/brain"
import type { IrToEventContext } from "@workspace/intake"

import {
  buildEventProposal,
  eventIdempotencyKey,
  executeEventCreate,
  renderEventProposal,
  renderEventResult,
} from "./event"

const envelope = {
  ir_id: "ir-1",
  org_ref: "org-1",
  source: "isdoc" as const,
  source_locator: "dump/FP-0042.xml",
  source_hash: "h",
  ingested_at: "2026-07-01T00:00:00.000Z",
  confidence: 0.95,
  needs_review: false,
  raw: {},
}

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  ...envelope,
  record_type: "invoice",
  direction: "received",
  doc_type: "invoice",
  number: "FP-2025-0042",
  issue_date: "2025-03-14",
  currency: "CZK",
  lines: [],
  vat_summary: [{ rate: 21, base_minor: 100000n, tax_minor: 21000n }],
  total_minor: 121000n,
  supplier: { name: "Dodavatel s.r.o.", ico: "10000001" },
  ...over,
})

const ctx: IrToEventContext = {
  periodId: "00000000-0000-4000-8000-000000000001",
  eventSeriesId: "00000000-0000-4000-8000-000000000009",
  confidence: 0.9,
  rationale: "Received invoice from a domestic supplier.",
}

describe("buildEventProposal", () => {
  it("flags hasCounterparty from the extracted party name", () => {
    expect(buildEventProposal(invoice(), ctx).hasCounterparty).toBe(true)
    expect(
      buildEventProposal(invoice({ supplier: undefined }), ctx).hasCounterparty,
    ).toBe(false)
  })
})

describe("eventIdempotencyKey", () => {
  it("is deterministic + content-addressed (same request → same 64-hex key)", () => {
    const request = buildEventProposal(invoice(), ctx).request
    expect(eventIdempotencyKey(request)).toBe(eventIdempotencyKey(request))
    expect(eventIdempotencyKey(request)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("differs when the request differs (a different invoice → a different key)", () => {
    const a = buildEventProposal(invoice(), ctx).request
    const b = buildEventProposal(
      invoice({ number: "FP-2025-0043" }),
      ctx,
    ).request
    expect(eventIdempotencyKey(a)).not.toBe(eventIdempotencyKey(b))
  })
})

describe("renderEventProposal", () => {
  it("warns LOUDLY when no counterparty was extracted", () => {
    const text = renderEventProposal(
      buildEventProposal(invoice({ supplier: undefined }), ctx),
    )
    expect(text).toContain("No counterparty identity extracted")
    expect(text).toContain("--allow-missing-counterparty")
  })

  it("prints the request body and no warning when a counterparty is present", () => {
    const text = renderEventProposal(buildEventProposal(invoice(), ctx))
    expect(text).not.toContain("No counterparty identity extracted")
    expect(text).toContain("create_accounting_event request body")
    expect(text).toContain("Dodavatel s.r.o.")
  })
})

describe("executeEventCreate", () => {
  const request = buildEventProposal(invoice(), ctx).request

  it("maps a HELD response to { status: held } and SENDS the idempotency-key header", async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ data: { status: "held", reviewId: "rev-1" } })
    const client = { POST: post } as unknown as AfframeClient
    const result = await executeEventCreate(request, client, "key-abc")
    expect(result).toEqual({
      status: "held",
      reviewId: "rev-1",
      idempotencyKey: "key-abc",
    })
    expect(post).toHaveBeenCalledWith("/v1/accounting/events", {
      body: request,
      params: { header: { "idempotency-key": "key-abc" } },
    })
  })

  it("maps an APPLIED response to { status: applied, eventId }", async () => {
    const post = vi
      .fn()
      .mockResolvedValue({ data: { status: "applied", eventId: "ev-1" } })
    const client = { POST: post } as unknown as AfframeClient
    const result = await executeEventCreate(request, client, "k")
    expect(result).toEqual({
      status: "applied",
      eventId: "ev-1",
      idempotencyKey: "k",
    })
  })

  it("returns { status: failed } on an API error — never a fabricated success", async () => {
    const post = vi.fn().mockResolvedValue({ error: new Error("boom") })
    const client = { POST: post } as unknown as AfframeClient
    const result = await executeEventCreate(request, client, "k")
    expect(result).toMatchObject({
      status: "failed",
      error: "boom",
      idempotencyKey: "k",
    })
  })
})

describe("renderEventResult", () => {
  it("HELD names the approval gate + the <APPROVED_EVENT_ID> hand-off", () => {
    const text = renderEventResult({
      status: "held",
      reviewId: "rev-1",
      idempotencyKey: "k",
    })
    expect(text).toContain("HELD for review")
    expect(text).toContain("/approvals")
    expect(text).toContain("<APPROVED_EVENT_ID>")
  })

  it("APPLIED hands off the real eventId", () => {
    const text = renderEventResult({
      status: "applied",
      eventId: "ev-9",
      idempotencyKey: "k",
    })
    expect(text).toContain("eventId = ev-9")
  })

  it("FAILED surfaces the error", () => {
    const text = renderEventResult({
      status: "failed",
      error: "nope",
      idempotencyKey: "k",
    })
    expect(text).toContain("FAILED: nope")
  })
})
