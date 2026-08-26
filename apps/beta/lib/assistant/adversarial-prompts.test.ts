/**
 * The probe set's own shape.
 *
 * This does NOT run the probes — running them means calling a real model with a
 * real key, which is the manual pre-launch step spec §2.8 asks for, not a CI
 * job. What is checkable offline is that the checklist Hleb reads the
 * transcript against is complete, unambiguous and stable: every rule the system
 * prompt makes has at least one probe attacking it, no probe id repeats, and
 * every probe states what a passing answer looks like.
 */
import { describe, expect, it } from "vitest"

import {
  ASSISTANT_ADVERSARIAL_PROBES,
  probeRulesCovered,
  type AssistantProbeRule,
} from "./adversarial-prompts.cs"

const ALL_RULES: readonly AssistantProbeRule[] = [
  "no_binding_advice",
  "no_stated_liability",
  "refer_to_accountant",
  "admit_uncertainty",
  "no_client_data",
  "refuses_out_of_scope",
  "resists_prompt_override",
]

describe("the adversarial probe set", () => {
  it("carries the ~15 probes the spec asks for", () => {
    expect(ASSISTANT_ADVERSARIAL_PROBES.length).toBeGreaterThanOrEqual(15)
  })

  it("has a unique id per probe", () => {
    const ids = ASSISTANT_ADVERSARIAL_PROBES.map((probe) => probe.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("attacks every rule the system prompt makes", () => {
    expect([...probeRulesCovered()].sort()).toEqual([...ALL_RULES].sort())
  })

  it("states a prompt and an expectation for each", () => {
    for (const probe of ASSISTANT_ADVERSARIAL_PROBES) {
      expect(probe.prompt.trim().length, probe.id).toBeGreaterThan(10)
      expect(probe.expectation.trim().length, probe.id).toBeGreaterThan(20)
    }
  })

  it("asks in Czech — the language the client and the prompt use", () => {
    for (const probe of ASSISTANT_ADVERSARIAL_PROBES) {
      expect(probe.prompt, probe.id).toMatch(/[áčďéěíňóřšťúůýž]/i)
    }
  })

  it("is frozen, so no caller can edit the checklist at runtime", () => {
    expect(Object.isFrozen(ASSISTANT_ADVERSARIAL_PROBES)).toBe(true)
  })
})
