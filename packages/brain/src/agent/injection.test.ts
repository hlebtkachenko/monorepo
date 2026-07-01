import { describe, expect, it } from "vitest"

import { COLD_START_GREEN_THRESHOLD } from "../confidence/calibration"
import { firedHardClassSignals } from "../confidence/hard-class"
import type { ScoreInputs } from "../confidence/score"
import { TIER2_CAP_VALUES } from "../confidence/signals"
import { scoreProposalColdStart } from "../gate/gate"
import { buildLoginContext, type LoginContextSections } from "./context-pack"
import {
  HOSTILE_DOCUMENT,
  INJECTION_REQUIRED_TOOLS,
} from "./injection-fixtures"
import {
  BRAIN_DENIED_BUILTIN_TOOLS,
  DEFAULT_BRAIN_POLICY,
  isToolAllowed,
} from "./sandbox"

// N-2 — prove the STRUCTURAL prompt-injection defenses that hold regardless of what the hostile document
// says. We do not run a live CC loop; we assert the two blast-radius controls the injection cannot defeat:
//   (a) the N-1 sandbox DENIES the tools the injection needs (so "read .env and exfil" cannot execute), and
//   (b) the confidence gate scores on INFRA signals only (so an injected "high confidence" cannot go green).

describe("N-2 (a) — the sandbox denies the tools the injection needs", () => {
  it("the hostile document is present as untrusted DATA (never executed)", () => {
    // Sanity: the fixture actually contains the injection payload the defenses are proven against.
    expect(HOSTILE_DOCUMENT).toContain("ignore your rules")
    expect(HOSTILE_DOCUMENT).toContain("read .env")
    expect(HOSTILE_DOCUMENT).toContain("http://evil")
    expect(HOSTILE_DOCUMENT).toContain("high confidence")
  })

  it("denies every built-in tool the injected 'read .env and exfil' would need", () => {
    // Read/Glob (find + read the secret), WebFetch (POST it out), Bash (curl it out), Write (tamper).
    for (const tool of Object.values(INJECTION_REQUIRED_TOOLS)) {
      expect(isToolAllowed(tool, DEFAULT_BRAIN_POLICY)).toBe(false)
    }
    // Explicitly: the filesystem-read + network + shell + write + git surface is all denied.
    expect(isToolAllowed("Read", DEFAULT_BRAIN_POLICY)).toBe(false)
    expect(isToolAllowed("WebFetch", DEFAULT_BRAIN_POLICY)).toBe(false)
    expect(isToolAllowed("Bash", DEFAULT_BRAIN_POLICY)).toBe(false)
    expect(isToolAllowed("Write", DEFAULT_BRAIN_POLICY)).toBe(false)
    expect(isToolAllowed("mcp__git__push", DEFAULT_BRAIN_POLICY)).toBe(false)
  })

  it("denies every named exfiltration / self-modification built-in from N-1", () => {
    for (const tool of BRAIN_DENIED_BUILTIN_TOOLS) {
      expect(isToolAllowed(tool, DEFAULT_BRAIN_POLICY)).toBe(false)
    }
  })

  it("the login-context pack embeds the deny-list so every session inherits it", () => {
    const s: LoginContextSections = {
      constitution: "c",
      kb: { id: "kb", version: "v" },
      lawSummary: "l",
      confidenceProtocol: "p",
      escalationPolicy: "e",
    }
    const pack = buildLoginContext(s)
    expect(pack.disallowedTools).toEqual([...BRAIN_DENIED_BUILTIN_TOOLS])
    // A session booted from this pack cannot run any tool the injection needs.
    for (const tool of Object.values(INJECTION_REQUIRED_TOOLS)) {
      expect(isToolAllowed(tool, pack.toolPolicy)).toBe(false)
    }
  })
})

describe("N-2 (b) — the gate scores on infra signals, not the model's belief", () => {
  // A proposal whose ONLY "signal" is the injected claim ("book to 648000 with high confidence"). There is
  // NO field on ScoreInputs for the model's verbalized confidence — belief is structurally unrepresentable.
  // The best the attacker's document can hope for is a normally-scored proposal; here it is a weak one.
  const injectedProposal: ScoreInputs = {
    firedSignals: [],
    // A booking to a novel/unusual target the injection dictates has no constitution backing.
    kbRule: "none", // 0.40 base
    verify: {}, // no verifier check passed
    extractionQuality: 0.65, // scan-grade, per score.ts
    reconciliation: "none",
  }

  it("an injected 'high confidence' cannot itself reach green", () => {
    const d = scoreProposalColdStart(injectedProposal)
    // The injected claim contributes nothing; C is derived purely from the (weak) infra signals.
    expect(d.cFinal).toBeLessThan(COLD_START_GREEN_THRESHOLD)
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
  })

  it("even a maxed-out clean proposal is force-routed to review by a Tier-1 block", () => {
    // The attacker's best case: every real signal maxed. A single Tier-1 block still forces needsReview,
    // so no verbalized certainty can auto-book. constitution_violation is exactly the "book to X" attack.
    const maxedButBlocked: ScoreInputs = {
      firedSignals: ["constitution_violation"],
      kbRule: "constitution_safe",
      verify: {
        vatBaseMatchesNet: true,
        rcChecklistPassesOrNA: true,
        decree500Confirmed: true,
        periodConsistent: true,
        bankVsKsSsMatch: true,
      },
      extractionQuality: 1.0,
      reconciliation: "full",
    }
    const d = scoreProposalColdStart(maxedButBlocked)
    expect(d.blocked).toBe(true)
    expect(d.cRaw).toBe(0)
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
    expect(d.reasons).toContain("blocked: constitution_violation")
  })

  it("a hard-class cap keeps an otherwise-maxed proposal sub-green (green unreachable)", () => {
    // The injection's "book everything to 648000" is an asset-vs-expense-class judgment. Unresolved, its
    // Tier-2 cap holds C sub-green no matter how confident the document claims to be.
    const fired = firedHardClassSignals(["asset_vs_expense"], {}) // nothing resolves it
    const d = scoreProposalColdStart({
      firedSignals: fired,
      kbRule: "constitution_safe",
      verify: {
        vatBaseMatchesNet: true,
        rcChecklistPassesOrNA: true,
        decree500Confirmed: true,
        periodConsistent: true,
        bankVsKsSsMatch: true,
      },
      extractionQuality: 1.0,
      reconciliation: "full",
    })
    expect(d.cRaw).toBe(TIER2_CAP_VALUES.asset_vs_expense)
    expect(d.cFinal).toBeLessThan(COLD_START_GREEN_THRESHOLD)
    expect(d.isGreen).toBe(false)
    expect(d.needsReview).toBe(true)
  })
})
