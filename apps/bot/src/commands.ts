import type { Env } from "./env.js"
import { pollEndpoints, renderScanReport } from "./scan.js"
import { createGitHubClient, repoOf, type GitHubClient } from "./github.js"
import { createStore } from "./state/store.js"

export type CommandResult = string

function github(env: Env): GitHubClient | null {
  if (!env.GITHUB_DISPATCH_TOKEN) return null
  return createGitHubClient(env.GITHUB_DISPATCH_TOKEN, repoOf(env))
}

const NO_GH = "GitHub control not configured (set GITHUB_DISPATCH_TOKEN)."

function runIcon(conclusion: string | null, status: string): string {
  if (status !== "completed") return "⏳"
  return conclusion === "success"
    ? "✅"
    : conclusion === "failure"
      ? "🔴"
      : conclusion === "cancelled"
        ? "🚫"
        : "⚪️"
}

/**
 * Whitelisted READ + inspect commands — no side effects. `arg` is the raw text after the
 * command (used by /logs). Each builds its own client from env so the bot stays a pure
 * per-request object.
 */
export const READ_COMMANDS: Record<
  string,
  (env: Env, arg: string) => Promise<CommandResult> | CommandResult
> = {
  ping: () => "🏓 pong",
  version: (env) => `afframe-bot · env=${env.ENVIRONMENT ?? "?"}`,
  status: async (env) => {
    if (!env.API_URL)
      return "🟢 bot up · api: not configured (local experiment)"
    try {
      const res = await fetch(`${env.API_URL.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(3000),
      })
      return res.ok
        ? "🟢 bot up · api: healthy"
        : `🟡 bot up · api: ${res.status}`
    } catch {
      return "🔴 bot up · api: unreachable"
    }
  },
  scan: async () => renderScanReport(await pollEndpoints(), true),

  // Recent GitHub Actions runs (status across the repo).
  ci: async (env) => {
    const gh = github(env)
    if (!gh) return NO_GH
    const runs = await gh.listRuns(8)
    if (runs.length === 0) return "No recent runs."
    return (
      "Recent runs:\n" +
      runs
        .map(
          (r) =>
            `${runIcon(r.conclusion, r.status)} ${r.name} · ${r.branch} · ${r.event}`,
        )
        .join("\n")
    )
  },

  // Recent deploy runs only.
  deploys: async (env) => {
    const gh = github(env)
    if (!gh) return NO_GH
    const runs = (await gh.listRuns(20)).filter((r) => /deploy/i.test(r.name))
    if (runs.length === 0) return "No recent deploy runs."
    return (
      "Recent deploys:\n" +
      runs
        .slice(0, 8)
        .map(
          (r) => `${runIcon(r.conclusion, r.status)} ${r.name} · ${r.branch}`,
        )
        .join("\n")
    )
  },

  // Open pull requests.
  pr: async (env) => {
    const gh = github(env)
    if (!gh) return NO_GH
    const pulls = await gh.listPulls()
    if (pulls.length === 0) return "No open PRs."
    return (
      "Open PRs:\n" +
      pulls
        .map(
          (p) =>
            `${p.draft ? "📝" : "🔵"} #${p.number} ${p.title} (@${p.user})`,
        )
        .join("\n")
    )
  },

  // Recently auto-created incidents (from the dedup table).
  errors: async (env) => {
    const rows = await createStore(env.DB).recentDedup(8)
    if (rows.length === 0) return "No tracked incidents."
    return (
      "Recent incidents:\n" +
      rows
        .map((r) => `• ${r.identifier}${r.count > 1 ? ` ×${r.count}` : ""}`)
        .join("\n")
    )
  },

  // Failed-job + step summary for a specific run: /logs <runId>.
  logs: async (env, arg) => {
    const gh = github(env)
    if (!gh) return NO_GH
    const runId = Number(arg.trim())
    if (!Number.isFinite(runId) || runId <= 0)
      return "Usage: /logs <runId> (get the id from /ci or a CI alert)."
    const jobs = await gh.runJobs(runId)
    const failed = jobs.filter((j) => j.conclusion === "failure")
    if (failed.length === 0)
      return jobs.length === 0
        ? "Run not found or no jobs."
        : "No failed jobs in that run."
    return (
      `Failed jobs in run ${runId}:\n` +
      failed
        .map(
          (j) =>
            `🔴 ${j.name}${j.failedSteps.length ? `\n   ↳ ${j.failedSteps.join(", ")}` : ""}`,
        )
        .join("\n")
    )
  },

  help: () =>
    [
      "Read:",
      "/status /scan /ci /deploys /pr /errors /logs <runId>",
      "Write (confirm-gated):",
      "/deploy <staging|production> · /rollback <env> <tag> · /deploybot · /dast",
      "Issue: /issue <title>",
    ].join("\n"),
}
