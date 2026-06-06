import type { D1Database } from "@cloudflare/workers-types"

export interface DedupRecord {
  fingerprint: string
  issueId: string
  identifier: string
  count: number
  firstSeen: number
  lastSeen: number
}

export interface ApprovalRecord {
  id: string
  decision: string | null
  options: string[]
  summary: string | null
  exp: number
  created: number
}

export interface SnoozeRecord {
  until: number
  acked: boolean
}

/** Typed accessor over the bot's D1 tables. Thin SQL adapter; logic lives in callers. */
export interface Store {
  getDedup(fingerprint: string): Promise<DedupRecord | null>
  createDedup(r: DedupRecord): Promise<void>
  /** Atomically bump count + lastSeen; returns the new count. */
  bumpDedup(fingerprint: string, lastSeen: number): Promise<number>
  putApproval(r: ApprovalRecord): Promise<void>
  getApproval(id: string): Promise<ApprovalRecord | null>
  /** Records the decision only if still pending (first tap wins); returns the updated row or null. */
  setDecision(id: string, decision: string): Promise<ApprovalRecord | null>
  beat(jobKey: string, ts: number): Promise<void>
  lastBeat(jobKey: string): Promise<number | null>
  getSnooze(scopeKey: string): Promise<SnoozeRecord | null>
  setSnooze(scopeKey: string, until: number, acked: boolean): Promise<void>
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
  decision: string | null
  options: string
  summary: string | null
  exp: number
  created: number
}

function toApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    decision: row.decision,
    options: JSON.parse(row.options) as string[],
    summary: row.summary,
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
          "INSERT INTO approval (id, decision, options, summary, exp, created) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET options=excluded.options, summary=excluded.summary, exp=excluded.exp",
        )
        .bind(
          r.id,
          r.decision,
          JSON.stringify(r.options),
          r.summary,
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
    async setDecision(id, decision) {
      const row = await db
        .prepare(
          "UPDATE approval SET decision = ? WHERE id = ? AND decision IS NULL RETURNING *",
        )
        .bind(decision, id)
        .first<ApprovalRow>()
      return row ? toApproval(row) : null
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
  }
}
