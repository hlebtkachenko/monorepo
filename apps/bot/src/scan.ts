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
export function renderScanReport(
  points: ScanPoint[],
  bonus = false,
  stale: HeartbeatSpec[] = [],
): string {
  const allOk = points.every((p) => p.ok)
  const head = `${bonus ? "🔍 Bonus scan" : "🩺 Scheduled scan"} — ${allOk ? "all green" : "ISSUES"}`
  const lines = points.map(
    (p) => `${p.ok ? "✅" : "🔴"} ${p.name} — ${p.detail}`,
  )
  const staleLine =
    stale.length === 0
      ? "✅ heartbeats fresh"
      : `⚠️ stale: ${stale.map((s) => s.key).join(", ")}`
  return `${head}\n${lines.join("\n")}\n${staleLine}`
}

/** Morning briefing: endpoint health + heartbeat freshness. Plain text. */
export function renderBriefing(
  points: ScanPoint[],
  stale: HeartbeatSpec[],
): string {
  const down = points.filter((p) => !p.ok)
  const health =
    down.length === 0
      ? "✅ all endpoints green"
      : `🔴 down: ${down.map((p) => p.name).join(", ")}`
  const beats =
    stale.length === 0
      ? "✅ heartbeats fresh"
      : `⚠️ stale: ${stale.map((s) => s.key).join(", ")}`
  const details = down.map((p) => `  - ${p.name}: ${p.detail}`)
  return `🌅 Daily briefing\n${health}\n${beats}${details.length ? `\n${details.join("\n")}` : ""}`
}
