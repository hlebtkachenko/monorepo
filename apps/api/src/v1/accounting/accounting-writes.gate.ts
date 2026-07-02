import { createHash } from "node:crypto"

import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import {
  updateToolCallLogOutput,
  withOrganization,
  writeToolCallLog,
} from "@workspace/db"
import {
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  ValidationError,
} from "@workspace/shared/errors"

import { translateAccountingError } from "./accounting-error"

const AUTO_APPLY_THRESHOLD = Number(
  process.env["ACCOUNTING_AUTO_APPLY_THRESHOLD"] ?? "0.9",
)
/** Any single amount above this (CZK) is HELD regardless of claimed confidence. */
const ALWAYS_HOLD_AMOUNT = Number(
  process.env["ACCOUNTING_ALWAYS_HOLD_AMOUNT"] ?? "100000",
)

/** The organization-bound tx handle `withOrganization` hands its callback. */
type OrgTx = Parameters<Parameters<typeof withOrganization>[2]>[0]

/** Sorted-key canonical JSON → stable idempotency payload hash. */
export function canonicalHash(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys)
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
      )
    }
    return v
  }
  return createHash("sha256")
    .update(JSON.stringify(sortKeys(value)), "utf8")
    .digest("hex")
}

export interface GatedWriteResult {
  httpStatus: number
  body: Record<string, unknown>
  replayed: boolean
}

export interface GatedWriteOptions<T> {
  principal: ApiKeyPrincipal
  idempotencyKey: string | undefined
  operationId: string
  /** Full request body — hashed for idempotency + persisted to the audit log. */
  body: unknown
  confidence: number
  rationale: string
  conversationId?: string
  /** Decimal-string amounts tested against the always-hold ceiling. */
  holdAmounts: string[]
  /** Run the domain mutation. Only called when the write auto-applies. */
  run: (
    db: OrgTx,
    ctx: { organizationId: string; workspaceId: string },
  ) => Promise<T>
  /** Map the domain result to the applied-response body (sans `status`). */
  applied: (result: T) => Record<string, unknown>
}

/**
 * The write gate for the Afframe Brain: idempotency (via `tool_call_log`) +
 * confidence/amount hold, in ONE `withOrganization` transaction so the audit
 * log row and the domain write commit or roll back together (a failed write
 * never burns the idempotency key). The tenant + responsible user come only
 * from the principal.
 */
export async function runGatedWrite<T>(
  opts: GatedWriteOptions<T>,
): Promise<GatedWriteResult> {
  const { principal, idempotencyKey, operationId, body } = opts

  if (!idempotencyKey || idempotencyKey.length > 255) {
    throw new ValidationError(
      "An Idempotency-Key header (1–255 chars) is required for accounting writes",
    )
  }
  if (principal.userId === null) {
    throw new ForbiddenError(
      "Accounting writes require a user-bound API key (responsible person)",
    )
  }
  const userId = principal.userId

  const payloadHash = canonicalHash(body)
  const amountHold = opts.holdAmounts.some(
    (a) => Math.abs(Number(a)) > ALWAYS_HOLD_AMOUNT,
  )
  const actorKind = opts.conversationId ? "ai_on_behalf" : "human"

  type TxOutcome =
    | { kind: "replay"; prior: Record<string, unknown> }
    | { kind: "applied"; body: Record<string, unknown> }
    | { kind: "held"; body: Record<string, unknown> }

  let outcome: TxOutcome
  try {
    outcome = await withOrganization(
      principal.organizationId,
      userId,
      async (db): Promise<TxOutcome> => {
        const log = await writeToolCallLog(db, {
          organizationId: principal.organizationId,
          toolName: operationId,
          idempotencyKey,
          actorKind,
          userId,
          conversationId: opts.conversationId ?? null,
          input: body,
          confidence: opts.confidence,
        })

        if (log.replayed) {
          const prior = log.existingOutput as
            | (Record<string, unknown> & { payloadHash?: string })
            | null
          if (!prior) {
            throw new ConflictError(
              "A previous request with this idempotency key is still in progress or failed; use a new key",
            )
          }
          if (prior.payloadHash !== payloadHash) {
            throw new IdempotencyConflictError(
              "This idempotency key was used with a different request body",
            )
          }
          return { kind: "replay", prior }
        }

        if (opts.confidence >= AUTO_APPLY_THRESHOLD && !amountHold) {
          const result = await opts.run(db, {
            organizationId: principal.organizationId,
            workspaceId: principal.workspaceId,
          })
          const appliedBody = { status: "applied", ...opts.applied(result) }
          await updateToolCallLogOutput(db, {
            toolCallLogId: log.toolCallLogId,
            output: { payloadHash, ...appliedBody },
            autoApplied: true,
            rationale: opts.rationale,
          })
          return { kind: "applied", body: appliedBody }
        }

        const heldBody = { status: "held", reviewId: log.toolCallLogId }
        await updateToolCallLogOutput(db, {
          toolCallLogId: log.toolCallLogId,
          output: { payloadHash, status: "held" },
          autoApplied: false,
          rationale: opts.rationale,
        })
        return { kind: "held", body: heldBody }
      },
    )
  } catch (e) {
    translateAccountingError(e)
  }

  if (outcome.kind === "replay") {
    const { payloadHash: _omit, ...replayBody } = outcome.prior
    return { httpStatus: 200, body: replayBody, replayed: true }
  }
  if (outcome.kind === "applied") {
    return { httpStatus: 201, body: outcome.body, replayed: false }
  }
  return { httpStatus: 202, body: outcome.body, replayed: false }
}
