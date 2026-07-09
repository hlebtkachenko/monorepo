import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import {
  assembleLoginSections,
  CONSTITUTION_SOURCE_PATH,
  type OperatorLoginSections,
} from "./assemble-sections"
import { buildLoginContext } from "./context-pack"

// The operator-supplied half of the safety spine (everything except the constitution, which is assembled
// from the LOCKED canonical `.brain/constitution.md`). Non-blank so the fail-closed guards pass.
const operatorSections = (): OperatorLoginSections => ({
  kb: { id: "kb-abc123", version: "2026-07-01" },
  lawSummary: "ZoÚ + Decree 500/2002 digest.",
  confidenceProtocol:
    "Server scores C from infra signals; the model never self-scores.",
  escalationPolicy:
    "Below green or blocked -> route to a human via mcp__advisor__escalate.",
})

describe("assembleLoginSections — byte-equality with the canonical constitution", () => {
  it("assembles the constitution VERBATIM from the locked .brain/constitution.md (byte-identical golden)", () => {
    // The golden IS the live canonical file — not a copied fixture that could itself go stale. This proves
    // the assembler emits the constitution byte-for-byte from the locked source: no trim, no transform.
    const golden = readFileSync(CONSTITUTION_SOURCE_PATH, "utf8")
    const sections = assembleLoginSections(operatorSections())
    expect(sections.constitution).toBe(golden)
    expect(golden.length).toBeGreaterThan(0)
  })

  it("carries the operator-supplied spine sections through unchanged", () => {
    const op = operatorSections()
    const sections = assembleLoginSections(op)
    expect(sections.kb).toEqual(op.kb)
    expect(sections.lawSummary).toBe(op.lawSummary)
    expect(sections.confidenceProtocol).toBe(op.confidenceProtocol)
    expect(sections.escalationPolicy).toBe(op.escalationPolicy)
  })

  it("the assembled constitution reaches the login-pack system prompt byte-for-byte", () => {
    // End-to-end: the assembled sections feed buildLoginContext, and the constitution appears in the boot
    // system prompt verbatim — so the LOCKED constitution can never be silently truncated or dropped.
    const golden = readFileSync(CONSTITUTION_SOURCE_PATH, "utf8")
    const pack = buildLoginContext(assembleLoginSections(operatorSections()))
    expect(pack.system).toContain(golden)
  })

  it("normalizes away any stray key on the operator sections (e.g. a smuggled constitution/toolPolicy)", () => {
    // A hand-authored operator JSON could carry a stale `constitution` or a `toolPolicy` widening attempt
    // inside `sections`; the assembler pins the constitution to canonical and drops unknown keys.
    const golden = readFileSync(CONSTITUTION_SOURCE_PATH, "utf8")
    const smuggled = {
      ...operatorSections(),
      constitution: "STALE hand-copied constitution",
      toolPolicy: { allowedMcpServers: ["evil"], allowedBuiltinTools: ["Bash"] },
    } as unknown as OperatorLoginSections
    const sections = assembleLoginSections(smuggled)
    expect(sections.constitution).toBe(golden)
    expect(sections).not.toHaveProperty("toolPolicy")
    expect(Object.keys(sections).sort()).toEqual([
      "confidenceProtocol",
      "constitution",
      "escalationPolicy",
      "kb",
      "lawSummary",
    ])
  })
})

describe("assembleLoginSections — fail-closed (never a blank safety section)", () => {
  it("throws when the canonical constitution source cannot be read (moved/deleted)", () => {
    const missingReader = (): string => {
      throw new Error("ENOENT: no such file")
    }
    expect(() =>
      assembleLoginSections(operatorSections(), missingReader),
    ).toThrow(/constitution.*could not be read/)
  })

  it("throws when the canonical constitution source is empty", () => {
    expect(() => assembleLoginSections(operatorSections(), () => "")).toThrow(
      /constitution.*is empty/,
    )
  })

  it("throws when the canonical constitution source is whitespace-only", () => {
    expect(() =>
      assembleLoginSections(operatorSections(), () => "   \n\t  "),
    ).toThrow(/constitution.*is empty/,
    )
  })

  it.each([
    "lawSummary",
    "confidenceProtocol",
    "escalationPolicy",
  ] as const)("throws when the operator-supplied %s is blank", (field) => {
    const op = { ...operatorSections(), [field]: "   " }
    expect(() => assembleLoginSections(op)).toThrow(
      new RegExp(`${field}.*missing or empty`),
    )
  })

  it.each([
    "lawSummary",
    "confidenceProtocol",
    "escalationPolicy",
  ] as const)("throws when the operator-supplied %s is missing", (field) => {
    const op = { ...operatorSections() }
    delete (op as Record<string, unknown>)[field]
    expect(() => assembleLoginSections(op)).toThrow(
      new RegExp(`${field}.*missing or empty`),
    )
  })

  it("throws when the KB pointer id or version is blank", () => {
    expect(() =>
      assembleLoginSections({
        ...operatorSections(),
        kb: { id: "", version: "2026-07-01" },
      }),
    ).toThrow(/kb\.id.*missing or empty/)
    expect(() =>
      assembleLoginSections({
        ...operatorSections(),
        kb: { id: "kb-1", version: "" },
      }),
    ).toThrow(/kb\.version.*missing or empty/)
  })
})
