/**
 * Audit writer — writeToolCallLog + updateToolCallLogOutput.
 *
 * `writeToolCallLog` is THE audit writer. Every tool handler in the registry
 * calls this helper inside its `withOrganization` transaction. Rules:
 *
 *   1. `actorKind` validation:
 *        - 'human'        requires userId
 *        - 'ai'           requires conversationId
 *        - 'ai_on_behalf' requires BOTH userId and conversationId
 *        - 'system'       both may be null
 *   2. Idempotency: look up (organization_id, tool_name, idempotency_key).
 *      If a row exists, return it tagged `replayed: true`.
 *   3. Two-pass redaction before persistence:
 *        Pass 1: baseline key redaction (recursive walker; universal-PII keys).
 *        Pass 2: per-tool dot-path redaction (declared by the tool registry).
 *   4. INSERT tool_call_log with output_json = NULL. Caller calls
 *      `updateToolCallLogOutput` once the domain mutation completes.
 *
 * The `tx` parameter demands the `OrganizationBoundDb` brand: callers MUST be
 * inside a `withOrganization` transaction. RLS + the append-only trigger handle
 * the write-side guarantees.
 */
import { and, eq } from "drizzle-orm"
import type { OrganizationBoundDb } from "../tenancy.js"
import { tool_call_log } from "../schema/tool_call_log.js"
import { applyBaselineKeyRedactions, applyRedactions } from "./redact.js"
import type {
  UpdateOutputInput,
  WriteLogInput,
  WriteLogResult,
} from "./types.js"

export async function writeToolCallLog(
  tx: OrganizationBoundDb,
  input: WriteLogInput,
): Promise<WriteLogResult> {
  if (input.input === undefined || input.input === null) {
    throw new Error("writeToolCallLog: input is required (column is NOT NULL)")
  }
  validateActorKind(input)

  // Idempotency check. RLS ensures we only see rows for the current
  // organization, but we still scope by organization_id explicitly because
  // the UNIQUE constraint is (organization_id, tool_name, idempotency_key).
  const existing = await tx
    .select({
      id: tool_call_log.id,
      output_json: tool_call_log.output_json,
    })
    .from(tool_call_log)
    .where(
      and(
        eq(tool_call_log.organization_id, input.organizationId),
        eq(tool_call_log.tool_name, input.toolName),
        eq(tool_call_log.idempotency_key, input.idempotencyKey),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    const prior = existing[0]
    if (!prior) {
      throw new Error(
        "writeToolCallLog: idempotency lookup returned undefined row",
      )
    }
    return {
      toolCallLogId: prior.id,
      replayed: true,
      existingOutput: prior.output_json,
    }
  }

  // Two-pass redaction:
  //   Pass 1: baseline key redaction (Tier 1 + 2 + 3) walked recursively.
  //   Pass 2: per-tool exact dot-paths for tool-specific sensitive fields.
  const baselineRedacted = applyBaselineKeyRedactions(input.input)
  const redactedInput = applyRedactions(baselineRedacted, input.redactForAudit)

  const [row] = await tx
    .insert(tool_call_log)
    .values({
      organization_id: input.organizationId,
      tool_name: input.toolName,
      idempotency_key: input.idempotencyKey,
      actor_kind: input.actorKind,
      user_id: input.userId,
      conversation_id: input.conversationId ?? null,
      input_json: (redactedInput ?? null) as never,
      output_json: null,
      confidence:
        input.confidence != null ? String(input.confidence.toFixed(2)) : null,
      auto_applied: false,
      approved_by_user_id: null,
    })
    .returning({ id: tool_call_log.id })

  if (!row) {
    throw new Error("writeToolCallLog: insert returned no row")
  }

  return { toolCallLogId: row.id, replayed: false }
}

/**
 * Finalize a tool_call_log row after the domain mutation succeeds. Only
 * `output_json`, `auto_applied`, `approved_by_user_id`, and `rationale` are
 * writable (guarded by the limited-update trigger from migration 0004).
 */
export async function updateToolCallLogOutput(
  tx: OrganizationBoundDb,
  input: UpdateOutputInput,
): Promise<void> {
  // Same two-pass redaction as writeToolCallLog.
  const baselineRedacted = applyBaselineKeyRedactions(input.output)
  const redacted = applyRedactions(baselineRedacted, input.redactForAudit)

  const updates: Record<string, unknown> = {
    output_json: (redacted ?? null) as never,
  }
  if (input.autoApplied !== undefined) {
    updates["auto_applied"] = input.autoApplied
  }
  if (input.approvedByUserId !== undefined) {
    updates["approved_by_user_id"] = input.approvedByUserId
  }
  if (input.rationale !== undefined) {
    updates["rationale"] = input.rationale
  }

  await tx
    .update(tool_call_log)
    .set(
      updates as Parameters<typeof tx.update>[0] extends never
        ? never
        : typeof updates,
    )
    .where(eq(tool_call_log.id, input.toolCallLogId))
}

function validateActorKind(input: WriteLogInput): void {
  switch (input.actorKind) {
    case "human":
      if (!input.userId) {
        throw new Error("writeToolCallLog: actor_kind 'human' requires userId")
      }
      return
    case "ai":
      if (!input.conversationId) {
        throw new Error(
          "writeToolCallLog: actor_kind 'ai' requires conversationId",
        )
      }
      return
    case "ai_on_behalf":
      if (!input.userId || !input.conversationId) {
        throw new Error(
          "writeToolCallLog: actor_kind 'ai_on_behalf' requires both userId and conversationId",
        )
      }
      return
    case "system":
      return
    default: {
      const exhaustive: never = input.actorKind
      throw new Error(
        `writeToolCallLog: unknown actor_kind ${String(exhaustive)}`,
      )
    }
  }
}
