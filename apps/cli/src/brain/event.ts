// `afframe brain event` — propose the accounting EVENT (case) for an extracted invoice, carrying the
// supplier/customer IDENTITY, so the derived invoice books against the RIGHT counterparty instead of
// holding on a null one (openObligation fails closed on a null counterparty).
//
// DETERMINISTIC, no agent session: a plain operator-key `client.POST /v1/accounting/events`, exactly like
// `brain onboard`'s create calls. `invoiceToEvent` (@workspace/intake) is a pure mapping — there is nothing
// for a model to reason about, so no sandbox is involved. The write is GATED: at cold start it HOLDS
// (202 → reviewId); a human approves it at /approvals (verifying the extracted {name, ico, dic}), then
// passes the applied eventId to `brain book`. This command emits the identity; the human still reviews it.

import { createHash } from "node:crypto"

import type { AfframeClient } from "@afframe/sdk"
import { invoiceToEvent, type IrToEventContext } from "@workspace/intake"
import type { Invoice } from "@workspace/brain"
import type { CreateAccountingEventRequest } from "@workspace/shared/api"

import { indent } from "./render"

/** Recursively key-sorted JSON — a stable serialization so the idempotency key is order-independent. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify(
            (value as Record<string, unknown>)[k],
          )}`,
      )
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/**
 * Deterministic, clock-free idempotency key = sha256 of the canonical event request. Stable across retries
 * and a killed-then-resumed run, so the server dedups a re-POST of the SAME event into a replay — never a
 * duplicate event. (The event request carries no `_minor` bigint fields, so plain serialization is safe.)
 */
export function eventIdempotencyKey(
  request: CreateAccountingEventRequest,
): string {
  return createHash("sha256").update(stableStringify(request)).digest("hex")
}

/** The assembled event proposal: the request body + whether an identity was extracted (drives the gate). */
export interface EventProposal {
  request: CreateAccountingEventRequest
  hasCounterparty: boolean
}

/** Build the event proposal from an extracted IR invoice + the operator context. PURE (delegates to the pure adapter). */
export function buildEventProposal(
  invoice: Invoice,
  ctx: IrToEventContext,
): EventProposal {
  const request = invoiceToEvent(invoice, ctx)
  return { request, hasCounterparty: request.counterparty != null }
}

/**
 * Render the proposal for operator inspection: a LOUD warning when no counterparty was extracted (the
 * derived invoice would hold on a null counterparty), then the verbatim request body. Tenancy is injected
 * server-side, so the body carries no organization_id / user_id / workspace_id / role.
 */
export function renderEventProposal(proposal: EventProposal): string {
  const lines: string[] = []
  lines.push(
    "Afframe brain event — proposed accounting EVENT (NOT executed unless --execute).",
  )
  lines.push("")
  if (!proposal.hasCounterparty) {
    lines.push(
      "  ⚠ No counterparty identity extracted (no supplier/customer name in the IR). The derived invoice " +
        "will HOLD on a null counterparty when booked (openObligation fails closed). Fix the source/IR, or " +
        "pass --allow-missing-counterparty to propose a bare event anyway.",
    )
    lines.push("")
  }
  lines.push("  create_accounting_event request body:")
  lines.push(indent(JSON.stringify(proposal.request, null, 2), 6))
  return lines.join("\n") + "\n"
}

/** The outcome of a live event-create POST — HELD (the expected cold-start result), APPLIED, or FAILED. */
export type EventExecuteResult =
  | { status: "held"; reviewId: string; idempotencyKey: string }
  | { status: "applied"; eventId: string; idempotencyKey: string }
  | { status: "failed"; error: string; idempotencyKey: string }

/**
 * POST the event request to the GATED create endpoint, with the required deterministic Idempotency-Key
 * header, via the injected client. Returns the gate outcome: `held` (202 + reviewId — the expected
 * cold-start posture) or `applied` (201 + eventId). A network/API error is CAUGHT and returned as `failed`
 * (never a fabricated success). The tenant + responsible user come only from the operator's API-key
 * principal — never this body.
 */
export async function executeEventCreate(
  request: CreateAccountingEventRequest,
  client: AfframeClient,
  idempotencyKey: string,
): Promise<EventExecuteResult> {
  try {
    const res = await client.POST("/v1/accounting/events", {
      body: request,
      params: { header: { "idempotency-key": idempotencyKey } },
    })
    if (res.error) throw res.error
    const data = res.data as {
      status?: string
      eventId?: string
      reviewId?: string
    }
    if (data.status === "held" && data.reviewId) {
      return { status: "held", reviewId: data.reviewId, idempotencyKey }
    }
    if (data.eventId) {
      return { status: "applied", eventId: data.eventId, idempotencyKey }
    }
    return {
      status: "failed",
      error: `unexpected create_accounting_event response: ${JSON.stringify(data)}`,
      idempotencyKey,
    }
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      idempotencyKey,
    }
  }
}

/**
 * Render the execute outcome + the exact next command. On HELD (the cold-start norm) it names the approval
 * gate and the `<APPROVED_EVENT_ID>` hand-off; on APPLIED it hands off the real eventId; on FAILED it
 * surfaces the error.
 */
export function renderEventResult(result: EventExecuteResult): string {
  const lines: string[] = []
  if (result.status === "applied") {
    lines.push(`Event APPLIED — eventId = ${result.eventId}`)
    lines.push("")
    lines.push(
      "Next: book the invoice against this event (set eventId in the book --context):",
    )
    lines.push(
      indent(
        `brain book <pdf> --extracted <ir.json> --context <ctx with eventId=${result.eventId}>`,
        2,
      ),
    )
  } else if (result.status === "held") {
    lines.push(
      `Event HELD for review — reviewId = ${result.reviewId} (the expected cold-start outcome).`,
    )
    lines.push("")
    lines.push(
      "Next: approve it at /{org}/accounting/approvals (a human verifies the extracted counterparty), then",
    )
    lines.push("book the invoice against the APPROVED event:")
    lines.push(
      indent(
        "brain book <pdf> --extracted <ir.json> --context <ctx with eventId=<APPROVED_EVENT_ID>>",
        2,
      ),
    )
  } else {
    lines.push(`Event create FAILED: ${result.error}`)
  }
  return lines.join("\n") + "\n"
}
