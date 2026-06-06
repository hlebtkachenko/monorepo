import type { Env } from "./env.js"
import { pollEndpoints, renderScanReport } from "./scan.js"

export type CommandResult = string

/** Whitelisted READ commands — safe, no side effects. */
export const READ_COMMANDS: Record<
  string,
  (env: Env) => Promise<CommandResult> | CommandResult
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
}

/**
 * WRITE commands exist in the whitelist but are deliberately NOT wired to real
 * infrastructure in this local experiment. In prod each maps to a GitHub
 * workflow_dispatch behind a confirm button — the bot never execs on a server.
 */
export const GATED_COMMANDS = [
  "deploy",
  "rollback",
  "restart",
  "migrate",
] as const
