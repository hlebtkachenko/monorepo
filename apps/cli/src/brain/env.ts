// M0.2a — env-collapse: a fresh Brain session should need ONLY `BRAIN_API_KEY` pasted in. Every other
// Brain env var defaults to a sane value here, so this is the SINGLE place the defaulting lives, shared by
// every live entry point (`brain run`, `brain book`, `brain extract --live`).
//
// PURE: a function of the given env snapshot (normally `process.env`), no direct env read inside — so the
// resolution is asserted deterministically in tests without touching real process env.
//
// `BRAIN_RUNTIME_ACTIVE` / `BRAIN_LIVE` are deliberately NOT resolved here — #591/M0.2a dropped the
// CLIENT-side pre-gate on those two entirely (see `packages/intake/src/harness/brain-cc-harness.ts`). The
// SERVER admission lane (`apps/api/src/v1/accounting/`) is the real, unweakened authority: it fails closed on
// its own kill-switch and HELDs every write at cold start regardless of what the client believes, so a
// client-side pre-block on the same two vars bought no safety — only two extra vars an operator had to set.

import { DEFAULT_BASE } from "../config"

/** The resolved Brain live-session env. Every field except `apiKey` carries a default. */
export interface BrainEnv {
  /** The deployed REST API base URL, consumed by the local stdio MCP bridge. Defaults to the prod base. */
  mcpEndpoint: string
  /** The Brain's server-authorized accounting API key. NO default — the one value an operator must paste. */
  apiKey: string
  /** Agent-SDK auth for the nested Claude Code session. Defaults to `"ambient"` (this machine's own login). */
  agentSdkAuth: string
}

/** The default actor-mode value: use the nested Claude Code session's own (ambient) credential resolution. */
export const AMBIENT_AGENT_SDK_AUTH = "ambient"

/**
 * Resolve the Brain live-session env from a snapshot. An empty string is treated the same as unset (an
 * operator's `BRAIN_MCP_ENDPOINT=` in a sourced script must not pin an empty base).
 */
export function resolveBrainEnv(
  env: Record<string, string | undefined>,
): BrainEnv {
  return {
    mcpEndpoint: env.BRAIN_MCP_ENDPOINT || DEFAULT_BASE,
    apiKey: env.BRAIN_API_KEY ?? "",
    agentSdkAuth: env.BRAIN_AGENT_SDK_AUTH || AMBIENT_AGENT_SDK_AUTH,
  }
}
