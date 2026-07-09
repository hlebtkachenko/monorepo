// Regression tests for the LIVE-path wiring in `sdk-launcher.ts` — the one file that imports the Agent SDK
// and is otherwise only exercised against a real Agent-SDK session (see the file's own "UNTESTED-LIVE" note
// and docs/AFFRAME-BRAIN-TECHNICAL.md §1.1). `query()` itself is not driven here (that needs a real session),
// but everything this file does BEFORE handing control to `query()` — resolving the local stdio MCP bridge
// spawn descriptor (command/args, env overrides, fail-loud on a missing path) and building the default-deny
// `canUseTool` gates for both lanes — is deterministic and is covered below.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk"
import { buildLoginContext } from "@workspace/brain"
import type { BrainDryRunPlan } from "@workspace/intake"

import {
  makeCanUseTool,
  makeExtractCanUseTool,
  makeSandboxGate,
  resolveMcpBridge,
} from "./sdk-launcher"

// Minimal stub for `CanUseTool`'s required third argument (signal/toolUseID/requestId) — none of the gates
// under test read it, they only decide on `toolName`.
const STUB_TOOL_OPTIONS = {
  signal: new AbortController().signal,
  toolUseID: "tool-use-1",
  requestId: "req-1",
}

// `CanUseTool` types its return as `Promise<PermissionResult | null>` (the SDK reserves `null` for "no
// decision"), but every gate under test always returns a concrete decision. Narrows for the assertions below.
function mustResult(result: PermissionResult | null): PermissionResult {
  if (result === null) throw new Error("expected a PermissionResult, got null")
  return result
}

// Mirrors session-config.test.ts's stubPlan — only `policy` is read by the gate under test.
function stubPlan(): BrainDryRunPlan {
  const loginPack = buildLoginContext({
    constitution: "CONSTITUTION",
    kb: { id: "kb-1", version: "2026-07" },
    lawSummary: "LAW",
    confidenceProtocol: "PROTOCOL",
    escalationPolicy: "ESCALATION",
  })
  return {
    loginPack,
    policy: loginPack.toolPolicy,
    toolPlan: [],
    captureRequest: { periodId: "period-uuid-1", seriesId: "series-uuid-2" },
  } as unknown as BrainDryRunPlan
}

describe("resolveMcpBridge (local stdio MCP bridge spawn descriptor)", () => {
  const ORIGINAL_SERVER_JS = process.env.BRAIN_MCP_SERVER_JS
  const ORIGINAL_TSX_BIN = process.env.BRAIN_MCP_TSX_BIN
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brain-mcp-bridge-test-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (ORIGINAL_SERVER_JS === undefined) delete process.env.BRAIN_MCP_SERVER_JS
    else process.env.BRAIN_MCP_SERVER_JS = ORIGINAL_SERVER_JS
    if (ORIGINAL_TSX_BIN === undefined) delete process.env.BRAIN_MCP_TSX_BIN
    else process.env.BRAIN_MCP_TSX_BIN = ORIGINAL_TSX_BIN
  })

  it("resolves the real in-repo tsx runner + MCP server source by default (no env override)", () => {
    delete process.env.BRAIN_MCP_SERVER_JS
    delete process.env.BRAIN_MCP_TSX_BIN

    const bridge = resolveMcpBridge()

    expect(bridge.command.endsWith("apps/mcp/node_modules/.bin/tsx")).toBe(true)
    expect(bridge.args).toHaveLength(1)
    expect(bridge.args[0]!.endsWith("apps/mcp/src/server.ts")).toBe(true)
    // Not just string-built: both resolved absolute paths are real, existing files.
    expect(existsSync(bridge.command)).toBe(true)
    expect(existsSync(bridge.args[0]!)).toBe(true)
  })

  it("honors BRAIN_MCP_SERVER_JS / BRAIN_MCP_TSX_BIN overrides when both paths exist", () => {
    const serverPath = join(dir, "server.ts")
    const tsxPath = join(dir, "tsx")
    writeFileSync(serverPath, "// stub mcp server entrypoint")
    writeFileSync(tsxPath, "#!/usr/bin/env node")
    process.env.BRAIN_MCP_SERVER_JS = serverPath
    process.env.BRAIN_MCP_TSX_BIN = tsxPath

    const bridge = resolveMcpBridge()

    expect(bridge.command).toBe(tsxPath)
    expect(bridge.args).toEqual([serverPath])
  })

  it("fails loud (not an opaque SDK connect error) when the MCP server entrypoint is missing", () => {
    const tsxPath = join(dir, "tsx-exists")
    writeFileSync(tsxPath, "#!/usr/bin/env node")
    process.env.BRAIN_MCP_SERVER_JS = join(dir, "missing-server.ts")
    process.env.BRAIN_MCP_TSX_BIN = tsxPath

    expect(() => resolveMcpBridge()).toThrowError(
      /MCP server entrypoint not found/,
    )
  })

  it("fails loud when the tsx runner is missing", () => {
    const serverPath = join(dir, "server-exists.ts")
    writeFileSync(serverPath, "// stub")
    process.env.BRAIN_MCP_SERVER_JS = serverPath
    process.env.BRAIN_MCP_TSX_BIN = join(dir, "missing-tsx")

    expect(() => resolveMcpBridge()).toThrowError(/tsx runner not found/)
  })
})

describe("makeSandboxGate (shared default-deny gate factory)", () => {
  it("resolves allow with the input echoed back when the predicate allows", async () => {
    const gate = makeSandboxGate(
      (toolName) => toolName === "ok_tool",
      (toolName) => `denied: ${toolName}`,
    )
    const result = mustResult(
      await gate("ok_tool", { a: 1 }, STUB_TOOL_OPTIONS),
    )
    expect(result).toEqual({ behavior: "allow", updatedInput: { a: 1 } })
  })

  it("resolves deny with the caller's message when the predicate denies", async () => {
    const gate = makeSandboxGate(
      () => false,
      (toolName) => `denied: ${toolName}`,
    )
    const result = mustResult(await gate("bad_tool", {}, STUB_TOOL_OPTIONS))
    expect(result).toEqual({ behavior: "deny", message: "denied: bad_tool" })
  })
})

describe("makeCanUseTool (RUN/BOOK lane live gate)", () => {
  const gate = makeCanUseTool(stubPlan())

  it("allows the pinned capture tool", async () => {
    const result = mustResult(
      await gate(
        "mcp__afframe__capture_accounting_document",
        { foo: "bar" },
        STUB_TOOL_OPTIONS,
      ),
    )
    expect(result.behavior).toBe("allow")
  })

  it("denies the held-write ops with a default-deny message naming the tool", async () => {
    const result = mustResult(
      await gate(
        "mcp__afframe__resolve_accounting_held_write",
        {},
        STUB_TOOL_OPTIONS,
      ),
    )
    expect(result.behavior).toBe("deny")
    if (result.behavior === "deny") {
      expect(result.message).toContain("default-deny")
      expect(result.message).toContain(
        "mcp__afframe__resolve_accounting_held_write",
      )
    }
  })

  it("denies a stripped built-in and an off-policy server", async () => {
    for (const toolName of ["Bash", "Read", "mcp__other__get_structure"]) {
      const result = mustResult(await gate(toolName, {}, STUB_TOOL_OPTIONS))
      expect(result.behavior).toBe("deny")
    }
  })
})

describe("makeExtractCanUseTool (EXTRACT lane live gate — never books)", () => {
  const gate = makeExtractCanUseTool()

  it("allows only the ocr-template read + propose pair", async () => {
    for (const toolName of [
      "mcp__afframe__list_ocr_templates",
      "mcp__afframe__create_ocr_template",
    ]) {
      const result = mustResult(await gate(toolName, {}, STUB_TOOL_OPTIONS))
      expect(result.behavior).toBe("allow")
    }
  })

  it("denies every accounting write, the human-only confirm, and held-write ops", async () => {
    for (const toolName of [
      "mcp__afframe__capture_accounting_document",
      "mcp__afframe__create_accounting_event",
      "mcp__afframe__confirm_ocr_template",
      "mcp__afframe__resolve_accounting_held_write",
    ]) {
      const result = mustResult(await gate(toolName, {}, STUB_TOOL_OPTIONS))
      expect(result.behavior).toBe("deny")
      if (result.behavior === "deny") {
        expect(result.message).toContain("never books")
      }
    }
  })
})
