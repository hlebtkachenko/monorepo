// In-memory Store for unit tests (no D1 / miniflare). Mirrors the SQL semantics that matter:
// first-tap-wins on setDecision/claimDispatch/cancelDispatch, atomic dedup bump.
import type {
  ApprovalRecord,
  DedupRecord,
  DispatchRecord,
  SnoozeRecord,
  Store,
} from "./store.js"

export function fakeStore(): Store {
  const dedup = new Map<string, DedupRecord>()
  const approvals = new Map<string, ApprovalRecord>()
  const beats = new Map<string, number>()
  const snoozes = new Map<string, SnoozeRecord>()
  const dispatches = new Map<string, DispatchRecord>()

  return {
    async getDedup(fp) {
      return dedup.get(fp) ?? null
    },
    async createDedup(r) {
      if (!dedup.has(r.fingerprint)) dedup.set(r.fingerprint, { ...r })
    },
    async bumpDedup(fp, lastSeen) {
      const r = dedup.get(fp)
      if (!r) return 0
      r.count += 1
      r.lastSeen = lastSeen
      return r.count
    },
    async putApproval(r) {
      approvals.set(r.id, { ...r })
    },
    async getApproval(id) {
      const r = approvals.get(id)
      return r ? { ...r } : null
    },
    async setDecision(id, decision) {
      const r = approvals.get(id)
      if (!r || r.decision !== null) return null
      r.decision = decision
      return { ...r }
    },
    async beat(jobKey, ts) {
      beats.set(jobKey, ts)
    },
    async lastBeat(jobKey) {
      return beats.get(jobKey) ?? null
    },
    async getSnooze(scopeKey) {
      return snoozes.get(scopeKey) ?? null
    },
    async setSnooze(scopeKey, until, acked) {
      snoozes.set(scopeKey, { until, acked })
    },
    async createDispatch(r) {
      dispatches.set(r.token, { ...r })
    },
    async getDispatch(token) {
      const r = dispatches.get(token)
      return r ? { ...r } : null
    },
    async claimDispatch(token) {
      const r = dispatches.get(token)
      if (!r || r.status !== "pending") return null
      r.status = "fired"
      return { ...r }
    },
    async cancelDispatch(token) {
      const r = dispatches.get(token)
      if (!r || r.status !== "pending") return null
      r.status = "cancelled"
      return { ...r }
    },
    async setDispatchStatus(token, status) {
      const r = dispatches.get(token)
      if (r) r.status = status
    },
    async recentDedup(limit) {
      return [...dedup.values()]
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, limit)
        .map((r) => ({ ...r }))
    },
  }
}
