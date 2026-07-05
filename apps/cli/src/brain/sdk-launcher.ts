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
// UNTESTED-LIVE: the `query()` call + message walk are exercised only against a real Agent-SDK session and a
// deployed accounting MCP endpoint (tracked on #469). Everything determinable without creds — the option
// assembly, the default-deny sandbox decision, the capture-result parsing — is factored into the pure,
// unit-tested `session-config.ts`, so this file is the thin, honest, deploy-gated shell around them.

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
  parseCaptureOutcome,
  parseCaptureResultText,
  readToolResultText,
  sandboxAllows,
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
function makeSandboxGate(
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
function makeCanUseTool(plan: BrainDryRunPlan): CanUseTool {
  return makeSandboxGate(
    (toolName) => sandboxAllows(toolName, plan),
    (toolName) =>
      `Brain sandbox denies ${toolName}: default-deny, not in the pinned accounting allowlist.`,
  )
}

/**
 * The SDK-backed launcher. Drives one headless Claude-Code session against the deployed MCP endpoint with the
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
    const queryOptions = buildBrainQueryOptions(options)

    let sessionId = ""
    let captureToolUseId: string | undefined
    let captureResultRaw: unknown

    for await (const message of query({
      prompt: buildBrainKickoff(options.plan),
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
              captureResultRaw = parseCaptureResultText(
                readToolResultText(block.content),
              )
            }
          }
        }
      } else if (message.type === "result") {
        sessionId = message.session_id
      }
    }

    const outcome = parseCaptureOutcome(captureResultRaw)
    return {
      brainRunId: sessionId,
      applied: outcome.applied,
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
function makeExtractCanUseTool(): CanUseTool {
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
  /** The deployed accounting MCP endpoint URL. */
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
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
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
 * The SDK-backed EXTRACT launcher. Drives one headless Claude-Code session against the deployed MCP endpoint
 * under the extract policy (ocr-template read/propose only, no book), feeding the operator-named file as a
 * content block, and returns the final assistant report (IR Invoice + provenance + fingerprint). It reuses the
 * SINGLE `query` import — no second SDK import anywhere.
 */
export async function sdkExtractSession(
  options: ExtractLaunchOptions,
): Promise<ExtractSessionResult> {
  const queryOptions = buildExtractQueryOptions(
    options.session,
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
