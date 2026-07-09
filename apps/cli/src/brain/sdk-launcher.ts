// #469 — the SDK-backed Brain `AgentSessionLauncher`.
//
// This is the ONE place `@anthropic-ai/claude-agent-sdk` is imported anywhere in the repo. It lives in
// `apps/cli` (`private: true`) so the Agent SDK never enters a published artifact and never becomes a
// dependency of `@workspace/intake` (the harness seam stays SDK-free — see docs/runbooks/BRAIN-CC-HARNESS.md).
//
// `runLiveBrainSession` (in @workspace/intake) fails closed on the creds + `BRAIN_RUNTIME_ACTIVE=1`
// kill-switch BEFORE this launcher is ever consulted, so `launch()` only runs when the write lane is
// deliberately ON and every cred is present. The launcher can only PROPOSE the capture write — the
// server's three-way-AND gate holds every write at cold start; a client cannot force a green.
//
// UNTESTED-LIVE: the `query()` call + message walk are exercised only against a real Agent-SDK session and the
// local stdio MCP bridge talking to the deployed REST API (tracked on #469). Everything determinable without creds — the option
// assembly, the default-deny sandbox decision, the capture-result parsing — is factored into the pure,
// unit-tested `session-config.ts`, so this file is the thin, honest, deploy-gated shell around them.

import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  query,
  type CanUseTool,
  type PermissionResult,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk"
import type {
  AgentSessionLaunchOptions,
  AgentSessionLauncher,
  BrainDryRunPlan,
  LiveBrainSessionResult,
} from "@workspace/intake"
import {
  CAPTURE_ACCOUNTING_DOCUMENT_TOOL,
  buildBrainKickoff,
  buildBrainQueryOptions,
  buildBrainSessionEnv,
  detectCaptureError,
  parseCaptureOutcome,
  parseCaptureResultText,
  readToolResultText,
  sandboxAllows,
  type McpBridgeSpawn,
} from "./session-config"
import {
  buildExtractKickoff,
  buildExtractQueryOptions,
  extractSandboxAllows,
  type ExtractDocumentBlock,
  type ExtractSessionInputs,
} from "./extract-config"

/**
 * DEFAULT-DENY permission gate factory shared by BOTH lanes. It builds a `canUseTool` that allows a call only
 * when the lane's own `allows(toolName)` predicate (a pinned `isToolAllowed` against that lane's policy) says
 * so, and denies everything else with the lane's own `denyMessage(toolName)`.
 *
 * This is one of THREE independent sandbox layers (the other two are the login pack's `disallowedTools`,
 * which strips the denied built-ins from context entirely, and its exact-name `allowedTools`, which only
 * auto-allows the pinned set). The SDK consults `canUseTool` only for permission-REQUIRING calls — an
 * already-allowlisted or no-permission tool bypasses it — so this is the belt-and-braces layer, not the sole
 * guard: any tool that DOES reach it is allowed only when the lane's per-TOOL policy says so.
 */
/**
 * Resolve the LOCAL stdio MCP bridge: the absolute path to the `tsx` runner + the `@afframe/mcp` server
 * SOURCE (`apps/mcp/src/server.ts`). Brain v1 runs inside the monorepo (like `apps/cli` dev), so the bridge
 * runs the TS server directly under `tsx` — no build step, and it sidesteps the built `dist/server.js`
 * ESM-extension issue (its 95 relative imports are extensionless, so plain `node dist/server.js` throws
 * ERR_MODULE_NOT_FOUND). Both `command` (the `tsx` bin) and the server path are ABSOLUTE, so the SDK-spawned
 * subprocess resolves correctly regardless of the operator's cwd (the SDK's `McpStdioServerConfig` has no
 * `cwd` field). Resolved relative to this file, which sits four levels below the repo root from both
 * `apps/cli/src/brain/` (tsx dev) and `apps/cli/dist/brain/` (built). `BRAIN_MCP_SERVER_JS` / `BRAIN_MCP_TSX_BIN`
 * override each path. Fail LOUD (not an opaque SDK connect error) when either is missing. Impure by design —
 * this is the launcher's job, keeping `session-config.ts` env-free + pure.
 */
export function resolveMcpBridge(): McpBridgeSpawn {
  const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
  const serverTs =
    process.env.BRAIN_MCP_SERVER_JS ?? `${repoRoot}apps/mcp/src/server.ts`
  const tsxBin =
    process.env.BRAIN_MCP_TSX_BIN ?? `${repoRoot}apps/mcp/node_modules/.bin/tsx`
  for (const [label, path] of [
    ["MCP server entrypoint", serverTs],
    ["tsx runner", tsxBin],
  ] as const) {
    if (!existsSync(path)) {
      throw new Error(
        `Brain MCP bridge: ${label} not found at ${path}. Run the Brain CLI from inside the monorepo ` +
          "(with dependencies installed), or set BRAIN_MCP_SERVER_JS / BRAIN_MCP_TSX_BIN.",
      )
    }
  }
  return { command: tsxBin, args: [serverTs] }
}

export function makeSandboxGate(
  allows: (toolName: string) => boolean,
  denyMessage: (toolName: string) => string,
): CanUseTool {
  return (toolName, input): Promise<PermissionResult> => {
    if (allows(toolName)) {
      return Promise.resolve({ behavior: "allow", updatedInput: input })
    }
    return Promise.resolve({ behavior: "deny", message: denyMessage(toolName) })
  }
}

/**
 * The RUN lane's default-deny gate: allowed only when the pinned per-TOOL `isToolAllowed` against the plan's
 * accounting policy says so; everything else (`resolve_accounting_held_write`, `list_accounting_held_writes`,
 * an off-list `afframe` tool, a foreign server, an empty name) is denied.
 */
export function makeCanUseTool(plan: BrainDryRunPlan): CanUseTool {
  return makeSandboxGate(
    (toolName) => sandboxAllows(toolName, plan),
    (toolName) =>
      `Brain sandbox denies ${toolName}: default-deny, not in the pinned accounting allowlist.`,
  )
}

/**
 * The SDK-backed launcher. Drives one headless Claude-Code session against the deployed REST API (via the local stdio MCP bridge) with the
 * inspected plan's system prompt + sandbox lists, then maps the capture write's outcome into a
 * `LiveBrainSessionResult`.
 *
 * `serverGate` here is the client-visible response body (`{ status, reviewId? }`) — the full persisted
 * `tool_call_log.output_json.serverGate` verdict is audit-only and requires a separate operator read; that
 * correlation (session_id ↔ conversation_id/brain_run_id) is established at wire time.
 */
export const sdkAgentSessionLauncher: AgentSessionLauncher = {
  async launch(
    options: AgentSessionLaunchOptions,
  ): Promise<LiveBrainSessionResult> {
    const queryOptions = buildBrainQueryOptions(options, resolveMcpBridge())

    let sessionId = ""
    let captureToolUseId: string | undefined
    // Keep BOTH the raw tool-result text and the MCP `is_error` flag, not just the parsed body: an admission
    // 429 / 5xx / validation error surfaces to the model as an `isError` text block the parser cannot read as a
    // status, and discarding it here is exactly what would let a dropped document be mis-recorded as HELD.
    let captureResultText: string | undefined
    let captureIsError = false

    for await (const message of query({
      prompt: buildBrainKickoff(options.plan, options.idempotencyKey),
      options: {
        ...queryOptions,
        canUseTool: makeCanUseTool(options.plan),
        env: buildBrainSessionEnv(process.env, options.agentSdkAuth),
      },
    })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (
            block.type === "tool_use" &&
            block.name === CAPTURE_ACCOUNTING_DOCUMENT_TOOL
          ) {
            captureToolUseId = block.id
          }
        }
      } else if (message.type === "user") {
        const content = message.message.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              block.type === "tool_result" &&
              block.tool_use_id === captureToolUseId
            ) {
              captureResultText = readToolResultText(block.content)
              captureIsError = block.is_error === true
            }
          }
        }
      } else if (message.type === "result") {
        sessionId = message.session_id
      }
    }

    // The parsed status/reviewId/applied (fail-safe: unreadable → not applied) PLUS the self-contained error
    // signal (rate-limit vs hard error vs unparseable), so the caller never has to infer the real outcome from
    // `applied` alone.
    const outcome = parseCaptureOutcome(
      parseCaptureResultText(captureResultText),
    )
    const error = detectCaptureError(captureResultText, captureIsError)
    return {
      brainRunId: sessionId,
      applied: outcome.applied,
      status: outcome.status,
      reviewId: outcome.reviewId,
      isError: error.isError,
      rateLimited: error.rateLimited,
      retryAfterMs: error.retryAfterMs,
      serverGate: outcome.raw,
    }
  },
}

// ── #518 — the LOCAL extract vision-OCR pre-pass launcher ────────────────────
//
// The extract lane runs OUTSIDE the booking sandbox and NEVER books. Its default-deny gate allows ONLY the
// ocr-template read + propose pair — `capture_accounting_document`, every accounting write, every held-write
// op, and the human-only `confirm_ocr_template` are denied. The target file is fed to the model as an
// image/document CONTENT BLOCK constructed HERE (trusted CLI code) from the bytes the operator named — there
// is NO `Read` tool, so a hostile document can never steer a filesystem read of `~/.aws` / `.env` / the key.

/** DEFAULT-DENY permission gate for the extract lane — allows only the ocr-template read + propose pair. */
export function makeExtractCanUseTool(): CanUseTool {
  return makeSandboxGate(
    extractSandboxAllows,
    (toolName) =>
      `Brain extract sandbox denies ${toolName}: default-deny, only the ocr-template read/propose tools are allowed (this lane never books).`,
  )
}

/** The inputs the SDK-backed extract launcher needs: the fixed session inputs + creds + the document block. */
export interface ExtractLaunchOptions {
  /** The extract session inputs (login-pack sections + optional supplier hint). NO tenancy context. */
  session: ExtractSessionInputs
  /** The deployed REST API base URL (e.g. https://api.afframe.com), consumed by the local stdio MCP bridge. */
  mcpEndpoint: string
  /** The workspace-authorized OCR-template API key (resolves the workspace server-side; never a tool input). */
  apiKey: string
  /** Agent-SDK auth token (subscription for dev; API key for the Bedrock spike). */
  agentSdkAuth: string
  /** The target file, already read + base64-encoded by trusted CLI code, as a content block (NOT a Read). */
  document: ExtractDocumentBlock
}

/** The raw text the extract session reported, plus the session id — the CLI renders/parses it for the operator. */
export interface ExtractSessionResult {
  /** The Agent-SDK `session_id` (audit correlation). */
  sessionId: string
  /** The final assistant text the session emitted (the IR Invoice + provenance + fingerprint report). */
  report: string
}

/**
 * Build the one-message `AsyncIterable<SDKUserMessage>` the extract session boots with: the fixed kickoff
 * text plus the operator-named file as an image/document content block. The bytes ride in the message
 * content, NOT through any tool — this is the whole point of the extract lane's safety design.
 */
async function* extractPromptStream(
  document: ExtractDocumentBlock,
  supplierHint?: string,
): AsyncIterable<SDKUserMessage> {
  const source = { type: "base64" as const, data: document.base64 }
  const contentBlock =
    document.kind === "image"
      ? ({
          type: "image" as const,
          source: {
            ...source,
            media_type: document.mediaType as
              "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          },
        } as const)
      : ({
          type: "document" as const,
          title: document.sourceLabel,
          source: { ...source, media_type: "application/pdf" as const },
        } as const)
  yield {
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        { type: "text", text: buildExtractKickoff(supplierHint) },
        contentBlock,
      ],
    },
  }
}

/**
 * The SDK-backed EXTRACT launcher. Drives one headless Claude-Code session against the deployed REST API (via
 * the local stdio MCP bridge)
 * under the extract policy (ocr-template read/propose only, no book), feeding the operator-named file as a
 * content block, and returns the final assistant report (IR Invoice + provenance + fingerprint). It reuses the
 * SINGLE `query` import — no second SDK import anywhere.
 */
export async function sdkExtractSession(
  options: ExtractLaunchOptions,
): Promise<ExtractSessionResult> {
  const queryOptions = buildExtractQueryOptions(
    options.session,
    resolveMcpBridge(),
    options.mcpEndpoint,
    options.apiKey,
  )

  let sessionId = ""
  let report = ""

  for await (const message of query({
    prompt: extractPromptStream(options.document, options.session.supplierHint),
    options: {
      ...queryOptions,
      canUseTool: makeExtractCanUseTool(),
      env: buildBrainSessionEnv(process.env, options.agentSdkAuth),
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") report += block.text
      }
    } else if (message.type === "result") {
      sessionId = message.session_id
    }
  }

  return { sessionId, report }
}
