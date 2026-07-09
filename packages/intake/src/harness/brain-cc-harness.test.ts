import { describe, expect, it } from "vitest"

import { CaptureAccountingDocumentRequestSchema } from "@workspace/shared/api"
import type { Invoice } from "@workspace/brain"
import {
  BRAIN_ACCOUNTING_POLICY,
  HOSTILE_DOCUMENT,
  HOSTILE_HELD_WRITE_DOCUMENT,
  INJECTION_REQUIRED_HELD_WRITE_TOOLS,
  INJECTION_REQUIRED_TOOLS,
  isToolAllowed,
  type LoginContextSections,
} from "@workspace/brain"

import { invoiceToCapture, type IrToCaptureContext } from "../ir-to-capture"
import {
  BrainHarnessNotWiredError,
  BRAIN_HARNESS_REQUIRED_ENV,
  planBrainDryRun,
  planForCapture,
  runLiveBrainSession,
  type BrainDryRunInputs,
} from "./brain-cc-harness"

// ── Shared fixtures ──────────────────────────────────────────────────────────

const envelope = {
  ir_id: "ir-1",
  org_ref: "org-1",
  source: "isdoc" as const,
  source_locator: "dump/invoices/FP-0042.xml",
  source_hash: "hash-1",
  ingested_at: "2026-07-01T00:00:00.000Z",
  confidence: 0.95,
  needs_review: false,
  raw: {},
}

// A minimal STANDARD domestic invoice. `over` lets the injection test tamper with the description ONLY.
const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  ...envelope,
  record_type: "invoice",
  direction: "received",
  doc_type: "invoice",
  number: "FP-2025-0042",
  issue_date: "2025-03-14",
  currency: "CZK",
  lines: [],
  vat_summary: [{ rate: 21, base_minor: 100000n, tax_minor: 21000n }],
  total_minor: 121000n,
  ...over,
})

const sections: LoginContextSections = {
  constitution: "I1..In (locked)",
  kb: { id: "kb-build-1", version: "2026-07-01" },
  lawSummary: "law digest",
  confidenceProtocol: "server scores; the model never self-scores",
  escalationPolicy: "route hard cases to the constrained advisor tool",
}

const captureContext: IrToCaptureContext = {
  periodId: "00000000-0000-4000-8000-000000000001",
  seriesId: "00000000-0000-4000-8000-000000000002",
  eventId: "00000000-0000-4000-8000-000000000003",
  confidence: 0.95,
  rationale: "Standard domestic service invoice, VAT 21% deductible.",
}

const dryRunInputs = (
  over: Partial<BrainDryRunInputs> = {},
): BrainDryRunInputs => ({
  invoice: invoice(),
  sections,
  captureContext,
  ...over,
})

// ── planBrainDryRun — the creds-free half runs today ─────────────────────────

describe("planBrainDryRun (creds-free)", () => {
  it("composes the WP-B login pack + WP-A capture request into an inspectable plan", () => {
    const plan = planBrainDryRun(dryRunInputs())

    // WP-B: the login pack is present, sandboxed by construction, pinned to the accounting policy.
    expect(plan.policy).toBe(BRAIN_ACCOUNTING_POLICY)
    expect(plan.loginPack.toolPolicy).toBe(BRAIN_ACCOUNTING_POLICY)
    expect(plan.loginPack.system).toContain("CARDINAL SIN")

    // WP-A: the capture request is a valid capture mapping the server can gate.
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(plan.captureRequest),
    ).not.toThrow()
    expect(plan.captureRequest.type).toBe("RECEIVED_INVOICE")

    // The plan reads structure/series, then proposes exactly one write.
    expect(plan.toolPlan.map((c) => c.toolName)).toEqual([
      "mcp__afframe__get_structure",
      "mcp__afframe__list_accounting_number_series",
      "mcp__afframe__capture_accounting_document",
    ])
    // Every planned tool is allowed by the pinned sandbox (the plan never schedules a denied tool).
    for (const call of plan.toolPlan) {
      expect(call.allowed).toBe(true)
      expect(isToolAllowed(call.toolName, plan.policy)).toBe(true)
    }
    // The write call carries the exact capture request.
    const write = plan.toolPlan.at(-1)!
    expect(write.toolName).toBe("mcp__afframe__capture_accounting_document")
    expect(write.input).toBe(plan.captureRequest)
  })

  it("is deterministic — identical inputs yield an identical plan", () => {
    const a = planBrainDryRun(dryRunInputs())
    const b = planBrainDryRun(dryRunInputs())
    expect(a.toolPlan.map((c) => c.toolName)).toEqual(
      b.toolPlan.map((c) => c.toolName),
    )
    expect(a.loginPack.system).toBe(b.loginPack.system)
    expect(a.captureRequest).toEqual(b.captureRequest)
  })

  it("the planned capture request carries no tenancy keys", () => {
    const plan = planBrainDryRun(dryRunInputs())
    const serialized = JSON.stringify(plan.captureRequest, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    )
    for (const forbidden of [
      "organization_id",
      "user_id",
      "workspace_id",
      "role",
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})

// ── planForCapture — the shared skeleton around ANY already-mapped capture request ──

describe("planForCapture (shared skeleton, any record kind)", () => {
  it("wraps a passed capture request in the same fixed login pack + read → propose tool sequence", () => {
    const captureRequest = invoiceToCapture(invoice(), captureContext)
    const plan = planForCapture(captureRequest, sections)

    // The write body is the EXACT passed request — no re-derivation, no skeleton swap.
    expect(plan.captureRequest).toBe(captureRequest)
    expect(plan.policy).toBe(BRAIN_ACCOUNTING_POLICY)
    // The fixed read → propose sequence is assembled around whatever request it is handed.
    expect(plan.toolPlan.map((c) => c.toolName)).toEqual([
      "mcp__afframe__get_structure",
      "mcp__afframe__list_accounting_number_series",
      "mcp__afframe__capture_accounting_document",
    ])
    // The write call carries the passed request verbatim (the operator-inspect-then-embed property).
    const write = plan.toolPlan.at(-1)!
    expect(write.toolName).toBe("mcp__afframe__capture_accounting_document")
    expect(write.input).toBe(captureRequest)
  })

  it("planBrainDryRun is exactly planForCapture(invoiceToCapture(...)) — the thin wrapper", () => {
    const inputs = dryRunInputs()
    const viaWrapper = planBrainDryRun(inputs)
    const viaShared = planForCapture(
      invoiceToCapture(inputs.invoice, inputs.captureContext),
      inputs.sections,
    )
    // Same tool sequence, same system prompt, same (deep-equal) capture body — the refactor is behavior-preserving.
    expect(viaWrapper.toolPlan.map((c) => c.toolName)).toEqual(
      viaShared.toolPlan.map((c) => c.toolName),
    )
    expect(viaWrapper.loginPack.system).toBe(viaShared.loginPack.system)
    expect(viaWrapper.captureRequest).toEqual(viaShared.captureRequest)
  })
})

// ── N-2 (dry) — the injected hostile doc cannot alter the plan or reach a denied tool ──

describe("N-2 (dry) — a hostile document cannot alter the dry-run plan or reach a denied tool", () => {
  it("the hostile documents are present as untrusted DATA (never executed)", () => {
    expect(HOSTILE_DOCUMENT).toContain("ignore your rules")
    expect(HOSTILE_HELD_WRITE_DOCUMENT).toContain("approve it yourself")
  })

  it("a hostile instruction embedded in the invoice cannot change the tool-plan", () => {
    // The clean plan is the reference. The injection lives where a document controls a field the adapter
    // reads — the invoice number/description. It must NOT be able to add, remove, or re-target a tool call.
    const clean = planBrainDryRun(dryRunInputs())
    const injected = planBrainDryRun(
      dryRunInputs({
        invoice: invoice({
          number: `FP-2025-0042 ${HOSTILE_DOCUMENT}`,
        }),
      }),
    )
    // The tool sequence is byte-identical — the plan is fixed by the harness, not the document content.
    expect(injected.toolPlan.map((c) => c.toolName)).toEqual(
      clean.toolPlan.map((c) => c.toolName),
    )
    // No planned call was silently flipped to a denied tool.
    for (const call of injected.toolPlan) {
      expect(call.allowed).toBe(true)
    }
  })

  it("the injection's required tools are DENIED by the plan's sandbox policy", () => {
    const plan = planBrainDryRun(dryRunInputs())
    // (a) the exfiltration / self-modification built-ins (read .env, WebFetch, Bash, Write, git).
    for (const tool of Object.values(INJECTION_REQUIRED_TOOLS)) {
      expect(isToolAllowed(tool, plan.policy)).toBe(false)
      expect(plan.loginPack.allowedTools).not.toContain(tool)
    }
    // (b) the held-write self-approval path (list + resolve held writes) — denied per-TOOL on the allowed server.
    for (const tool of Object.values(INJECTION_REQUIRED_HELD_WRITE_TOOLS)) {
      expect(isToolAllowed(tool, plan.policy)).toBe(false)
      expect(plan.loginPack.allowedTools).not.toContain(tool)
    }
    // No bare wildcard leaks the whole server (which would re-admit the denied held-write ops).
    expect(plan.loginPack.allowedTools).not.toContain("mcp__afframe__*")
  })

  it("no denied tool can ever appear in a produced plan (structural blast-radius bound)", () => {
    const injected = planBrainDryRun(
      dryRunInputs({
        invoice: invoice({ number: HOSTILE_DOCUMENT }),
      }),
    )
    const denied = [
      ...Object.values(INJECTION_REQUIRED_TOOLS),
      ...Object.values(INJECTION_REQUIRED_HELD_WRITE_TOOLS),
    ]
    for (const call of injected.toolPlan) {
      expect(denied).not.toContain(call.toolName)
    }
  })
})

// ── runLiveBrainSession — the creds-gated half fails loud, never fakes a run ──

describe("runLiveBrainSession (creds-gated)", () => {
  const plan = planBrainDryRun(dryRunInputs())

  it("throws a precise requirements error when no creds/env are present", async () => {
    await expect(
      runLiveBrainSession({
        plan,
        mcpEndpoint: "",
        readEnv: () => undefined,
      }),
    ).rejects.toBeInstanceOf(BrainHarnessNotWiredError)
  })

  it("the error names the exact missing env + points at the runbook", async () => {
    let caught: unknown
    try {
      await runLiveBrainSession({
        plan,
        mcpEndpoint: "",
        readEnv: () => undefined,
      })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(BrainHarnessNotWiredError)
    const message = (caught as Error).message
    // Every required env name is surfaced so the operator sees the full gap.
    for (const envName of Object.values(BRAIN_HARNESS_REQUIRED_ENV)) {
      expect(message).toContain(envName)
    }
    expect(message).toContain("docs/runbooks/BRAIN-CC-HARNESS.md")
    expect(message).toContain("@anthropic-ai/claude-agent-sdk")
  })

  const fullEnv: Record<string, string> = {
    [BRAIN_HARNESS_REQUIRED_ENV.mcpEndpoint]: "https://api.afframe.com",
    [BRAIN_HARNESS_REQUIRED_ENV.apiKey]: "sk-test",
    [BRAIN_HARNESS_REQUIRED_ENV.agentSdkAuth]: "token",
  }

  it("fails closed when the env is complete but NO launcher is injected", async () => {
    // The SDK-backed launcher lives in operator tooling (apps/cli), never in this package, so with no
    // launcher there is nothing to run — fail loud rather than fabricate a result.
    await expect(
      runLiveBrainSession({
        plan,
        mcpEndpoint: "https://api.afframe.com",
        readEnv: (name) => fullEnv[name],
      }),
    ).rejects.toBeInstanceOf(BrainHarnessNotWiredError)
  })

  it("never consults the launcher when the env/kill-switch gate is unmet (fail-closed ordering)", async () => {
    // A launcher that would throw if invoked must NOT be reached when env is missing — the env gate runs
    // FIRST, so a half-provisioned run can never open a session.
    let launched = false
    const throwingLauncher = {
      launch: () => {
        launched = true
        throw new Error("launcher must not be called when env is unmet")
      },
    }
    await expect(
      runLiveBrainSession({
        plan,
        mcpEndpoint: "",
        readEnv: () => undefined,
        launcher: throwingLauncher,
      }),
    ).rejects.toBeInstanceOf(BrainHarnessNotWiredError)
    expect(launched).toBe(false)
  })

  it("delegates to an injected launcher once the creds gate is satisfied", async () => {
    // Real wiring: with full env + a launcher, the session runs and returns the launcher's result. The mock
    // launcher stands in for the apps/cli SDK-backed one; it also asserts the config is derived from the plan.
    const seen: Array<Record<string, unknown>> = []
    const mockLauncher = {
      launch: (options: {
        plan: { loginPack: { system: string; allowedTools: readonly string[] } }
        mcpEndpoint: string
        apiKey: string
        agentSdkAuth: string
      }) => {
        seen.push({ ...options })
        return Promise.resolve({
          brainRunId: "run-1",
          applied: false,
          serverGate: { held: true },
        })
      },
    }
    const result = await runLiveBrainSession({
      plan,
      mcpEndpoint: "https://api.afframe.com",
      readEnv: (name) => fullEnv[name],
      launcher: mockLauncher,
    })
    // The server holds at cold start → the run is HELD, not applied (never a fabricated green).
    expect(result.applied).toBe(false)
    expect(result.brainRunId).toBe("run-1")
    // The launcher receives the INSPECTED plan (single source of truth for the sandbox
    // allow/deny lists) + resolved creds — never re-flattened, never document content.
    expect(seen[0]!["plan"]).toBe(plan)
    expect(
      (seen[0]!["plan"] as { loginPack: { system: string } }).loginPack.system,
    ).toBe(plan.loginPack.system)
    expect(seen[0]!["mcpEndpoint"]).toBe("https://api.afframe.com")
    expect(seen[0]!["apiKey"]).toBe("sk-test")
    expect(seen[0]!["agentSdkAuth"]).toBe("token")
  })

  // M0.2a — the client used to pre-block on `BRAIN_RUNTIME_ACTIVE=1` + `BRAIN_LIVE` before ever reaching a
  // launcher: a redundant client-side gate duplicating the SERVER's real admission authority. Dropped so the
  // client always attempts and the server decides (the server's own kill-switch is untouched and still
  // HELDs/rejects any write it has OFF — see apps/api/src/v1/accounting/admission.singleton.ts).
  it("[M0.2a] never requires BRAIN_RUNTIME_ACTIVE or BRAIN_LIVE — neither name appears in the required list", () => {
    const names: readonly string[] = Object.values(BRAIN_HARNESS_REQUIRED_ENV)
    expect(names).not.toContain("BRAIN_RUNTIME_ACTIVE")
    expect(names).not.toContain("BRAIN_LIVE")
  })

  it("[M0.2a] delegates to the launcher even when BRAIN_RUNTIME_ACTIVE / BRAIN_LIVE are completely unset", async () => {
    // Only the three real creds are provided via readEnv; BRAIN_RUNTIME_ACTIVE / BRAIN_LIVE are never asked
    // for and their absence must not block the run — the server is the sole authority on the write lane.
    const mockLauncher = {
      launch: () =>
        Promise.resolve({
          brainRunId: "run-2",
          applied: false,
          serverGate: { held: true },
        }),
    }
    const result = await runLiveBrainSession({
      plan,
      mcpEndpoint: "https://api.afframe.com",
      readEnv: (name) => fullEnv[name],
      launcher: mockLauncher,
    })
    expect(result.brainRunId).toBe("run-2")
  })
})
