import type { IssueEvent } from "./issues/types.js"

// Dead-man's-switch (DEV-62). Jobs we EXPECT to check in via POST /beat. On each scheduled
// run the bot compares each spec's last beat against maxAgeMs; a previously-seen job that has
// gone quiet past its window is "stale" -> a deduped incident. The bot's own scan beats "scan"
// (proves the cron itself is still firing); external jobs beat their key from their workflow.
export interface HeartbeatSpec {
  key: string
  label: string
  maxAgeMs: number
}

const HOUR = 3_600_000

export const HEARTBEATS: HeartbeatSpec[] = [
  // Bot scheduled scan: fires every ~12h; allow one window + grace before flagging.
  { key: "scan", label: "Bot health scan (cron)", maxAgeMs: 13 * HOUR },
  // Nightly nuclei DAST: beats once a day from nuclei-dast.yml.
  { key: "dast", label: "Nightly DAST (nuclei)", maxAgeMs: 26 * HOUR },
  // OpenStatus prober on the OVH VPS (OBS-10: "the watchdog has no watchdog").
  // A VPS-side cron POSTs /beat hourly once wired (launch-checklist OBS-10
  // same-morning ops item); until the first beat arrives the dead-man stays
  // quiet by design (never-seen keys don't false-alarm — see staleHeartbeats).
  {
    key: "status-page",
    label: "Status page prober (OpenStatus)",
    maxAgeMs: 3 * HOUR,
  },
]

export interface BeatEntry {
  spec: HeartbeatSpec
  lastRun: number | null
}

/**
 * Pure staleness check. A job is stale only if it was seen at least once (lastRun != null)
 * and its last beat is older than its window — so a never-yet-seen job doesn't false-alarm
 * before its first run.
 */
export function staleHeartbeats(
  entries: BeatEntry[],
  now: number,
): HeartbeatSpec[] {
  return entries
    .filter((e) => e.lastRun !== null && now - e.lastRun > e.spec.maxAgeMs)
    .map((e) => e.spec)
}

/** Turn stale heartbeats into one deduped incident (stable fingerprint over the job keys). */
export function deadManToIssue(stale: HeartbeatSpec[]): IssueEvent | null {
  if (stale.length === 0) return null
  const keys = stale.map((s) => s.key).sort()
  return {
    source: "error",
    title: `Dead-man: ${stale.map((s) => s.label).join(", ")} missed`,
    body: stale
      .map((s) => `🔇 ${s.label} (\`${s.key}\`) has not checked in`)
      .join("\n"),
    fingerprintParts: ["dead-man", ...keys],
    area: "observability",
    risk: "high",
  }
}
