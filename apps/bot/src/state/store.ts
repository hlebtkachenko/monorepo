import type { D1Database } from "@cloudflare/workers-types"

export interface DedupRecord {
  fingerprint: string
  issueId: string
  identifier: string
  count: number
  firstSeen: number
  lastSeen: number
}

export type ApprovalKind = "choice" | "text"

export interface ApprovalRecord {
  id: string
  /** 'choice' = tap an option; 'text' = reply with free text. */
  kind: ApprovalKind
  /** Chosen option label (choice) or "cancelled"; null while pending. */
  decision: string | null
  /** Free-text reply (text kind); null until replied. */
  answerText: string | null
  options: string[]
  summary: string | null
  /** When decided / replied / cancelled. */
  answeredAt: number | null
  /** Which agent/source asked (free-form label). */
  asker: string | null
  /** Decision auto-applied once exp passes (e.g. "Reject"); null = just expire. */
  onTimeout: string | null
  /** Telegram message id of the prompt, used to match a free-text reply. */
  promptMessageId: number | null
  /** Webhook to POST the answer to on resolve (answer-as-trigger). */
  callbackUrl: string | null
  /** Bearer token sent to callbackUrl (optional). */
  callbackToken: string | null
  /** GitHub workflow file to dispatch on resolve, carrying the answer as inputs. */
  resumeWorkflow: string | null
  /** 1 once the answer trigger fired (idempotent). */
  delivered: boolean
  exp: number
  created: number
}

export interface SnoozeRecord {
  until: number
  acked: boolean
}

export type DispatchStatus = "pending" | "fired" | "cancelled" | "expired"

export interface DispatchRecord {
  token: string
  kind: string
  /** JSON-encoded { workflow, ref, inputs, label }. */
  payload: string
  status: DispatchStatus
  exp: number
  created: number
}

/** Typed accessor over the bot's D1 tables. Thin SQL adapter; logic lives in callers. */
export interface Store {
  getDedup(fingerprint: string): Promise<DedupRecord | null>
  createDedup(r: DedupRecord): Promise<void>
  /** Atomically bump count + lastSeen; returns the new count. */
  bumpDedup(fingerprint: string, lastSeen: number): Promise<number>
  putApproval(r: ApprovalRecord): Promise<void>
  getApproval(id: string): Promise<ApprovalRecord | null>
  /** Look up an approval by its Telegram prompt message id (for matching a free-text reply). */
  getApprovalByPromptMessage(messageId: number): Promise<ApprovalRecord | null>
  /** Record an option decision, only if still unanswered (first wins); returns the row or null. */
  setDecision(
    id: string,
    decision: string,
    answeredAt: number,
  ): Promise<ApprovalRecord | null>
  /** Record a free-text reply, only if still unanswered (first wins); returns the row or null. */
  setAnswerText(
    id: string,
    text: string,
    answeredAt: number,
  ): Promise<ApprovalRecord | null>
  /** Open approvals (unanswered, not expired), oldest first — for /pending. */
  listPendingApprovals(now: number): Promise<ApprovalRecord[]>
  /** Retarget reply-matching to a new Telegram message (when ✍️ Custom opens a force_reply). */
  setPromptMessage(id: string, messageId: number): Promise<void>
  /** Mark the answer trigger as fired (idempotent push). */
  markDelivered(id: string): Promise<void>
  beat(jobKey: string, ts: number): Promise<void>
  lastBeat(jobKey: string): Promise<number | null>
  getSnooze(scopeKey: string): Promise<SnoozeRecord | null>
  setSnooze(scopeKey: string, until: number, acked: boolean): Promise<void>
  createDispatch(r: DispatchRecord): Promise<void>
  getDispatch(token: string): Promise<DispatchRecord | null>
  /** Atomically claim a pending dispatch (pending -> fired). Returns the row only if THIS call won. */
  claimDispatch(token: string): Promise<DispatchRecord | null>
  /** Cancel a pending dispatch. Returns the row only if it was still pending. */
  cancelDispatch(token: string): Promise<DispatchRecord | null>
  /** Force a dispatch to a terminal/retryable status (revert to pending on a failed send, mark expired). */
  setDispatchStatus(token: string, status: DispatchStatus): Promise<void>
  /** Recent dedup rows (open incidents), newest last-seen first — for /errors + the briefing. */
  recentDedup(limit: number): Promise<DedupRecord[]>
}

interface DedupRow {
  fingerprint: string
  issue_id: string
  identifier: string
  count: number
  first_seen: number
  last_seen: number
}
interface ApprovalRow {
  id: string
  kind: string
  decision: string | null
  answer_text: string | null
  options: string
  summary: string | null
  answered_at: number | null
  asker: string | null
  on_timeout: string | null
  prompt_message_id: number | null
  callback_url: string | null
  callback_token: string | null
  resume_workflow: string | null
  delivered: number
  exp: number
  created: number
}
interface DispatchRow {
  token: string
  kind: string
  payload: string
  status: string
  exp: number
  created: number
}

function toDispatch(row: DispatchRow): DispatchRecord {
  return {
    token: row.token,
    kind: row.kind,
    payload: row.payload,
    status: row.status as DispatchStatus,
    exp: row.exp,
    created: row.created,
  }
}

function toApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    kind: (row.kind as ApprovalKind) ?? "choice",
    decision: row.decision,
    answerText: row.answer_text,
    options: JSON.parse(row.options) as string[],
    summary: row.summary,
    answeredAt: row.answered_at,
    asker: row.asker,
    onTimeout: row.on_timeout,
    promptMessageId: row.prompt_message_id,
    callbackUrl: row.callback_url,
    callbackToken: row.callback_token,
    resumeWorkflow: row.resume_workflow,
    delivered: row.delivered === 1,
    exp: row.exp,
    created: row.created,
  }
}

export function createStore(db: D1Database): Store {
  return {
    async getDedup(fingerprint) {
      const row = await db
        .prepare("SELECT * FROM dedup WHERE fingerprint = ?")
        .bind(fingerprint)
        .first<DedupRow>()
      if (!row) return null
      return {
        fingerprint: row.fingerprint,
        issueId: row.issue_id,
        identifier: row.identifier,
        count: row.count,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
      }
    },
    async createDedup(r) {
      await db
        .prepare(
          "INSERT INTO dedup (fingerprint, issue_id, identifier, count, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(fingerprint) DO NOTHING",
        )
        .bind(
          r.fingerprint,
          r.issueId,
          r.identifier,
          r.count,
          r.firstSeen,
          r.lastSeen,
        )
        .run()
    },
    async bumpDedup(fingerprint, lastSeen) {
      const row = await db
        .prepare(
          "UPDATE dedup SET count = count + 1, last_seen = ? WHERE fingerprint = ? RETURNING count",
        )
        .bind(lastSeen, fingerprint)
        .first<{ count: number }>()
      return row?.count ?? 0
    },
    async putApproval(r) {
      await db
        .prepare(
          "INSERT INTO approval (id, kind, decision, answer_text, options, summary, answered_at, asker, on_timeout, prompt_message_id, callback_url, callback_token, resume_workflow, delivered, exp, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, options=excluded.options, summary=excluded.summary, asker=excluded.asker, on_timeout=excluded.on_timeout, prompt_message_id=excluded.prompt_message_id, callback_url=excluded.callback_url, callback_token=excluded.callback_token, resume_workflow=excluded.resume_workflow, exp=excluded.exp",
        )
        .bind(
          r.id,
          r.kind,
          r.decision,
          r.answerText,
          JSON.stringify(r.options),
          r.summary,
          r.answeredAt,
          r.asker,
          r.onTimeout,
          r.promptMessageId,
          r.callbackUrl,
          r.callbackToken,
          r.resumeWorkflow,
          r.delivered ? 1 : 0,
          r.exp,
          r.created,
        )
        .run()
    },
    async getApproval(id) {
      const row = await db
        .prepare("SELECT * FROM approval WHERE id = ?")
        .bind(id)
        .first<ApprovalRow>()
      return row ? toApproval(row) : null
    },
    async getApprovalByPromptMessage(messageId) {
      const row = await db
        .prepare("SELECT * FROM approval WHERE prompt_message_id = ?")
        .bind(messageId)
        .first<ApprovalRow>()
      return row ? toApproval(row) : null
    },
    async setDecision(id, decision, answeredAt) {
      const row = await db
        .prepare(
          "UPDATE approval SET decision = ?, answered_at = ? WHERE id = ? AND decision IS NULL AND answer_text IS NULL RETURNING *",
        )
        .bind(decision, answeredAt, id)
        .first<ApprovalRow>()
      return row ? toApproval(row) : null
    },
    async setAnswerText(id, text, answeredAt) {
      const row = await db
        .prepare(
          "UPDATE approval SET answer_text = ?, answered_at = ? WHERE id = ? AND decision IS NULL AND answer_text IS NULL RETURNING *",
        )
        .bind(text, answeredAt, id)
        .first<ApprovalRow>()
      return row ? toApproval(row) : null
    },
    async listPendingApprovals(now) {
      const { results } = await db
        .prepare(
          "SELECT * FROM approval WHERE decision IS NULL AND answer_text IS NULL AND exp > ? ORDER BY created ASC LIMIT 20",
        )
        .bind(now)
        .all<ApprovalRow>()
      return (results ?? []).map(toApproval)
    },
    async setPromptMessage(id, messageId) {
      await db
        .prepare("UPDATE approval SET prompt_message_id = ? WHERE id = ?")
        .bind(messageId, id)
        .run()
    },
    async markDelivered(id) {
      await db
        .prepare("UPDATE approval SET delivered = 1 WHERE id = ?")
        .bind(id)
        .run()
    },
    async beat(jobKey, ts) {
      await db
        .prepare(
          "INSERT INTO heartbeat (job_key, last_run) VALUES (?, ?) ON CONFLICT(job_key) DO UPDATE SET last_run=excluded.last_run",
        )
        .bind(jobKey, ts)
        .run()
    },
    async lastBeat(jobKey) {
      const row = await db
        .prepare("SELECT last_run FROM heartbeat WHERE job_key = ?")
        .bind(jobKey)
        .first<{ last_run: number }>()
      return row?.last_run ?? null
    },
    async getSnooze(scopeKey) {
      const row = await db
        .prepare("SELECT until, acked FROM snooze WHERE scope_key = ?")
        .bind(scopeKey)
        .first<{ until: number; acked: number }>()
      if (!row) return null
      return { until: row.until, acked: row.acked === 1 }
    },
    async setSnooze(scopeKey, until, acked) {
      await db
        .prepare(
          "INSERT INTO snooze (scope_key, until, acked) VALUES (?, ?, ?) ON CONFLICT(scope_key) DO UPDATE SET until=excluded.until, acked=excluded.acked",
        )
        .bind(scopeKey, until, acked ? 1 : 0)
        .run()
    },
    async createDispatch(r) {
      await db
        .prepare(
          "INSERT INTO dispatch (token, kind, payload, status, exp, created) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(r.token, r.kind, r.payload, r.status, r.exp, r.created)
        .run()
    },
    async getDispatch(token) {
      const row = await db
        .prepare("SELECT * FROM dispatch WHERE token = ?")
        .bind(token)
        .first<DispatchRow>()
      return row ? toDispatch(row) : null
    },
    async claimDispatch(token) {
      const row = await db
        .prepare(
          "UPDATE dispatch SET status = 'fired' WHERE token = ? AND status = 'pending' RETURNING *",
        )
        .bind(token)
        .first<DispatchRow>()
      return row ? toDispatch(row) : null
    },
    async cancelDispatch(token) {
      const row = await db
        .prepare(
          "UPDATE dispatch SET status = 'cancelled' WHERE token = ? AND status = 'pending' RETURNING *",
        )
        .bind(token)
        .first<DispatchRow>()
      return row ? toDispatch(row) : null
    },
    async setDispatchStatus(token, status) {
      await db
        .prepare("UPDATE dispatch SET status = ? WHERE token = ?")
        .bind(status, token)
        .run()
    },
    async recentDedup(limit) {
      const { results } = await db
        .prepare("SELECT * FROM dedup ORDER BY last_seen DESC LIMIT ?")
        .bind(limit)
        .all<DedupRow>()
      return (results ?? []).map((row) => ({
        fingerprint: row.fingerprint,
        issueId: row.issue_id,
        identifier: row.identifier,
        count: row.count,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
      }))
    },
  }
}
