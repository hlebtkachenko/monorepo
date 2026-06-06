import type { IssueEvent } from "./issues/types.js"
import type { HeartbeatSpec } from "./heartbeats.js"

export interface ScanPoint {
  name: string
  ok: boolean
  detail: string
}

// Public health endpoints reachable from a Worker (no AWS creds). Deep AWS metrics
// (RDS/Fargate/cost) arrive via the CloudWatch->SNS fan-in (DEV-50), not this scan.
const ENDPOINTS: { name: string; url: string }[] = [
  { name: "web", url: "https://app.afframe.com/api/version" },
  { name: "api", url: "https://api.afframe.com/api/health" },
  { name: "admin", url: "https://admin.afframe.com/api/health" },
]

export async function pollEndpoints(
  fetchImpl: typeof fetch = fetch,
): Promise<ScanPoint[]> {
  return Promise.all(
    ENDPOINTS.map(async (e): Promise<ScanPoint> => {
      try {
        const res = await fetchImpl(e.url, {
          signal: AbortSignal.timeout(5000),
        })
        return { name: e.name, ok: res.ok, detail: `HTTP ${res.status}` }
      } catch (err) {
        return {
          name: e.name,
          ok: false,
          detail: err instanceof Error ? err.message : "unreachable",
        }
      }
    }),
  )
}

/** Full checklist — green report too, as required. Plain text (no HTML). */
export function renderScanReport(points: ScanPoint[], bonus = false): string {
  const allOk = points.every((p) => p.ok)
  const head = `${bonus ? "🔍 Bonus scan" : "🩺 Scheduled scan"} — ${allOk ? "all green" : "ISSUES"}`
  const lines = points.map(
    (p) => `${p.ok ? "✅" : "🔴"} ${p.name} — ${p.detail}`,
  )
  return `${head}\n${lines.join("\n")}`
}

/** Morning briefing: endpoint health + open-incident count + heartbeat freshness. Plain text. */
export function renderBriefing(
  points: ScanPoint[],
  openIncidents: { identifier: string; count: number }[],
  stale: HeartbeatSpec[],
): string {
  const down = points.filter((p) => !p.ok)
  const health =
    down.length === 0
      ? "✅ all endpoints green"
      : `🔴 down: ${down.map((p) => p.name).join(", ")}`
  const incidents =
    openIncidents.length === 0
      ? "✅ no tracked incidents"
      : `📋 ${openIncidents.length} tracked · ${openIncidents
          .slice(0, 5)
          .map((i) => `${i.identifier}${i.count > 1 ? `×${i.count}` : ""}`)
          .join(", ")}`
  const beats =
    stale.length === 0
      ? "✅ heartbeats fresh"
      : `⚠️ stale: ${stale.map((s) => s.key).join(", ")}`
  return `🌅 Daily briefing\n${health}\n${incidents}\n${beats}`
}

/** Any red point -> one deduped incident event (stable fingerprint over the down names). */
export function scanToIssue(points: ScanPoint[]): IssueEvent | null {
  const bad = points.filter((p) => !p.ok)
  if (bad.length === 0) return null
  return {
    source: "error",
    title: `Health scan: ${bad.map((b) => b.name).join(", ")} down`,
    body: bad.map((b) => `🔴 ${b.name}: ${b.detail}`).join("\n"),
    fingerprintParts: ["health-scan", ...bad.map((b) => b.name).sort()],
    area: "observability",
    risk: "high",
  }
}
