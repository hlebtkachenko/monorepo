/**
 * Audit types for tool call logging and the audit timeline.
 *
 * `writeToolCallLog` is the single writer helper every tool handler uses.
 * Redaction paths (`redactForAudit`) are declared per-tool and stripped from
 * `input_json` / `output_json` BEFORE persistence. AI-initiated calls carry
 * `actor_kind in ('ai', 'ai_on_behalf')` + `conversation_id`.
 *
 * Fields NOT present (accounting/AI bundle deferred):
 *   - periodId / period_id
 *   - flowRunId / flow_run_id
 */

export type ActorKind = "human" | "ai" | "ai_on_behalf" | "system"

/**
 * Declarative redaction rules. Each string is a dot-path with optional `*`
 * wildcard for array element traversal.
 *
 * Examples:
 *   ['password']           -> { password: 'x' } -> { password: '[REDACTED]' }
 *   ['nested.cardNumber']  -> strips inside nested objects
 *   ['lines.*.pin']        -> strips pin on every element of `lines`
 *   ['a.*.b.*.c']          -> nested wildcards supported
 */
export type RedactionPath = string
export type RedactionRules = readonly RedactionPath[]

export interface WriteLogInput {
  organizationId: string
  toolName: string
  idempotencyKey: string
  actorKind: ActorKind
  userId: string | null
  conversationId?: string | null
  /** Raw input. Redaction is applied before persistence. */
  input: unknown
  /** Per-tool redaction paths declared by the tool registry. */
  redactForAudit?: RedactionRules
  confidence?: number | null
}

export interface WriteLogResult {
  toolCallLogId: string
  replayed: boolean
  /** When replayed=true, the prior row's output_json (after redaction at write time). */
  existingOutput?: unknown
}

export interface UpdateOutputInput {
  toolCallLogId: string
  output: unknown
  redactForAudit?: RedactionRules
  autoApplied?: boolean
  approvedByUserId?: string | null
  rationale?: string | null
}

/**
 * Input for `writeAuditEvent` (workspace-tier, requires WorkspaceBoundDb).
 */
export interface WriteAuditEventInput {
  workspaceId: string
  organizationId?: string | null
  actorUserId?: string | null
  action: string
  payload: Record<string, unknown>
}

/**
 * Input for `writeAuditEventGlobal` (admin bypass, no workspace tx needed).
 *
 * `workspaceId` is optional: an absent / null value means this is a pre-account
 * event (failed login for an unknown email, signup probe, magic-link
 * send/consume failure before a session exists). The row is persisted with
 * `workspace_id = NULL` per migration 0021 (AFF-208); tenant-bound RLS policies
 * exclude NULL rows, so only `withAdminBypass` can read them.
 */
export interface WriteAuditEventGlobalInput {
  workspaceId?: string | null
  organizationId?: string | null
  actorUserId?: string | null
  action: string
  payload: Record<string, unknown>
}

/**
 * Filter shape for the audit timeline read API.
 */
export interface AuditTimelineFilter {
  actorKind?: ActorKind
  userId?: string
  toolName?: string
  dateFrom?: string
  dateTo?: string
}

/**
 * One row of the audit timeline list view. `input_json` + `output_json` are
 * intentionally NOT returned here; the click-through drawer fetches them
 * individually via `getAuditDetail`.
 */
export interface AuditTimelineRow {
  id: string
  createdAt: string
  actorKind: ActorKind
  userName: string | null
  toolName: string
  conversationId: string | null
  confidence: number | null
  autoApplied: boolean
}

export interface AuditTimelineInput {
  organizationId: string
  filters?: AuditTimelineFilter
  pageIndex: number
  pageSize: number
}

export interface AuditTimelineResult {
  rows: AuditTimelineRow[]
  total: number
}
