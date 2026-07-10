import { describe, expect, it } from "vitest"
import type { LoginContextSections } from "@workspace/brain"
import {
  BRAIN_EXTRACT_POLICY,
  CAPTURE_ACCOUNTING_DOCUMENT_TOOL,
  CONFIRM_OCR_TEMPLATE_TOOL,
  CREATE_OCR_TEMPLATE_TOOL,
  LIST_OCR_TEMPLATES_TOOL,
  buildExtractKickoff,
  buildExtractLoginPack,
  buildExtractQueryOptions,
  extractSandboxAllows,
} from "./extract-config"

// The login-pack safety spine (the same shape `run` / `book` consume). A real pack makes the sandbox + tool
// list assertions genuine — the extract policy narrows the `afframe` server to the ocr-template read/propose
// pair only.
const sections: LoginContextSections = {
  constitution: "I1..In (locked)",
  kb: { id: "kb-extract-1", version: "2026-07-05" },
  lawSummary: "law digest",
  confidenceProtocol: "server scores; the model never self-scores",
  escalationPolicy: "route hard cases to a human",
}

describe("BRAIN_EXTRACT_POLICY (default-deny, ocr-template read/propose only)", () => {
  it("is a pure MCP client with NO built-in tools — Read is not present", () => {
    expect(BRAIN_EXTRACT_POLICY.allowedBuiltinTools).toEqual([])
    // Read can never enter via the built-in list — the whole point of the content-block design.
    expect(BRAIN_EXTRACT_POLICY.allowedBuiltinTools).not.toContain("Read")
  })

  it("narrows the afframe server to exactly list_ocr_templates + create_ocr_template", () => {
    expect(BRAIN_EXTRACT_POLICY.allowedMcpServers).toEqual(["afframe"])
    expect(BRAIN_EXTRACT_POLICY.allowedMcpTools?.afframe).toEqual([
      "list_ocr_templates",
      "create_ocr_template",
    ])
  })
})

describe("extractSandboxAllows (default-deny)", () => {
  it("allows ONLY the ocr-template read + propose tools", () => {
    expect(extractSandboxAllows(LIST_OCR_TEMPLATES_TOOL)).toBe(true)
    expect(extractSandboxAllows(CREATE_OCR_TEMPLATE_TOOL)).toBe(true)
  })

  it("DENIES the accounting write tools, the held-write ops, and confirm_ocr_template", () => {
    // The write lane — capture + every create* + posting + classify + feedback — is denied.
    for (const tool of [
      CAPTURE_ACCOUNTING_DOCUMENT_TOOL,
      "mcp__afframe__create_accounting_event",
      "mcp__afframe__create_accounting_posting",
      "mcp__afframe__create_invoice",
      "mcp__afframe__classify_accounting_event",
      "mcp__afframe__create_feedback",
    ]) {
      expect(extractSandboxAllows(tool)).toBe(false)
    }
    // The held-write ops are denied.
    expect(
      extractSandboxAllows("mcp__afframe__resolve_accounting_held_write"),
    ).toBe(false)
    expect(
      extractSandboxAllows("mcp__afframe__list_accounting_held_writes"),
    ).toBe(false)
    // The human-only template confirm is denied — the extract lane must never cross that trust boundary.
    expect(extractSandboxAllows(CONFIRM_OCR_TEMPLATE_TOOL)).toBe(false)
  })

  it("denies every built-in (Read included), unknown servers, and the empty name", () => {
    for (const builtin of [
      "Bash",
      "Read",
      "Write",
      "Edit",
      "WebFetch",
      "Task",
    ]) {
      expect(extractSandboxAllows(builtin)).toBe(false)
    }
    expect(extractSandboxAllows("mcp__other__list_ocr_templates")).toBe(false)
    expect(extractSandboxAllows("")).toBe(false)
  })
})

describe("buildExtractLoginPack", () => {
  it("emits exact allow patterns for the ocr-template pair and NEVER the write / Read tools", () => {
    const pack = buildExtractLoginPack({ sections })
    expect(pack.allowedTools).toEqual([
      LIST_OCR_TEMPLATES_TOOL,
      CREATE_OCR_TEMPLATE_TOOL,
    ])
    // No capture / confirm / held-write patterns leaked into the allow list.
    expect(pack.allowedTools).not.toContain(CAPTURE_ACCOUNTING_DOCUMENT_TOOL)
    expect(pack.allowedTools).not.toContain(CONFIRM_OCR_TEMPLATE_TOOL)
    // The exfiltration / self-modification built-ins (incl. Read) are on the deny list.
    expect(pack.disallowedTools).toContain("Read")
    expect(pack.disallowedTools).toContain("Bash")
    // No Read/Write/etc ever appears as ALLOWED.
    for (const builtin of [
      "Read",
      "Write",
      "Bash",
      "Edit",
      "WebFetch",
      "Task",
    ]) {
      expect(pack.allowedTools).not.toContain(builtin)
    }
  })
})

describe("buildExtractQueryOptions", () => {
  const BRIDGE = {
    command: "/repo/apps/mcp/node_modules/.bin/tsx",
    args: ["/repo/apps/mcp/src/server.ts"],
  }
  const cfg = buildExtractQueryOptions(
    { sections, supplierHint: "27082440" },
    BRIDGE,
    "https://api.afframe.com",
    "affk_live_secret",
  )

  it("is default-deny: empty built-in allow list, no Read, ocr-template pair only", () => {
    expect(cfg.allowedTools).toEqual([
      LIST_OCR_TEMPLATES_TOOL,
      CREATE_OCR_TEMPLATE_TOOL,
    ])
    expect(cfg.allowedTools).not.toContain("Read")
    expect(cfg.allowedTools).not.toContain(CAPTURE_ACCOUNTING_DOCUMENT_TOOL)
    expect(cfg.disallowedTools).toContain("Read")
  })

  it("points the afframe MCP server at a local stdio bridge: workspace key in env (not argv), REST base pinned", () => {
    expect(cfg.mcpServers).toEqual({
      afframe: {
        type: "stdio",
        command: "/repo/apps/mcp/node_modules/.bin/tsx",
        args: ["/repo/apps/mcp/src/server.ts"],
        env: {
          AFFRAME_API_KEY: "affk_live_secret",
          AFFRAME_API_BASE: "https://api.afframe.com",
        },
        alwaysLoad: true,
      },
    })
    // Security invariant: the secret rides in env, NEVER in argv (argv is world-readable via `ps`).
    expect(cfg.mcpServers.afframe!.args.join(" ")).not.toContain(
      "affk_live_secret",
    )
  })

  it("never bypasses permissions and loads no filesystem settings", () => {
    expect(cfg.permissionMode).toBe("default")
    expect(cfg.permissionMode).not.toBe("bypassPermissions")
    expect(cfg.settingSources).toEqual([])
  })
})

describe("buildExtractKickoff (fixed task, injection-resistant)", () => {
  it("pins the extract → provenance → fingerprint → propose sequence and never books", () => {
    const kickoff = buildExtractKickoff("27082440")
    expect(kickoff).toContain("mcp__afframe__list_ocr_templates")
    expect(kickoff).toContain("mcp__afframe__create_ocr_template")
    // Field-level provenance + a layout fingerprint are demanded.
    expect(kickoff.toLowerCase()).toContain("provenance")
    expect(kickoff.toLowerCase()).toContain("fingerprint")
    // The booking tool is explicitly stated as denied — this lane cannot book.
    expect(kickoff).toContain("capture_accounting_document")
    // It must never confirm a template itself.
    expect(kickoff).toContain("MUST NOT confirm")
  })

  it("treats the attached document + supplier hint as UNTRUSTED, not instructions", () => {
    const kickoff = buildExtractKickoff("27082440")
    expect(kickoff).toContain("UNTRUSTED")
    expect(kickoff.toLowerCase()).toContain("no filesystem read tool")
    expect(kickoff).toContain("27082440")
    // The hint is flagged unverified.
    expect(kickoff.toUpperCase()).toContain("UNVERIFIED")
  })

  it("is deterministic in the supplier hint (different hint → different kickoff)", () => {
    const a = buildExtractKickoff("27082440")
    const b = buildExtractKickoff("99999999")
    expect(a).not.toBe(b)
    // With no hint it says so explicitly rather than embedding a stray value.
    expect(buildExtractKickoff()).toContain("No supplier hint")
  })
})

describe("buildExtractKickoff — [M1.5] optional local text-layer context", () => {
  it("omits the text-layer block entirely when no signal is given", () => {
    const kickoff = buildExtractKickoff("27082440")
    expect(kickoff).not.toContain("local text-layer extract")
  })

  it("omits the block for a blank/whitespace-only signal (nothing to add)", () => {
    expect(buildExtractKickoff(undefined, { text: "" })).not.toContain(
      "local text-layer extract",
    )
    expect(buildExtractKickoff(undefined, { text: "   \n " })).not.toContain(
      "local text-layer extract",
    )
  })

  it("embeds a present signal as clearly-labeled UNTRUSTED supplementary data", () => {
    const kickoff = buildExtractKickoff(undefined, {
      text: "Faktura 2026-001, Celkem 12 100,00 Kc",
    })
    expect(kickoff).toContain("UNTRUSTED")
    expect(kickoff).toContain("SUPPLEMENTARY DATA ONLY")
    expect(kickoff).toContain("Faktura 2026-001, Celkem 12 100,00 Kc")
    expect(kickoff).toContain("never substitute it for reading the attachment")
  })

  it("truncates an oversized text layer rather than embedding it unbounded", () => {
    const huge = "x".repeat(10_000)
    const kickoff = buildExtractKickoff(undefined, { text: huge })
    // The kickoff overall must be meaningfully smaller than a full 10k-char embed + the fixed prose.
    expect(kickoff.length).toBeLessThan(huge.length + 2000)
  })
})
