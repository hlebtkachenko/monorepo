/**
 * The system prompt — the whole safety boundary of this feature.
 *
 * Two things are asserted, and they are the two things that would otherwise go
 * wrong silently:
 *
 *   1. THE ALLOWLIST. Exactly two organization facts reach the rendered string,
 *      and nothing else about the client can — spec §2.8's "documents/figures
 *      never enter context". `AssistantOrgFacts`'s field list is pinned, and a
 *      facts object carrying extra keys (which TypeScript forbids but a
 *      hand-built object from a future refactor might not) is shown to leave no
 *      trace in the output.
 *   2. THE VERSION STAMP. The digest below pins the exact prompt text. An edit
 *      to the prompt fails this test, and the fix is to bump
 *      `ASSISTANT_SYSTEM_PROMPT_VERSION` and update the digest IN THE SAME
 *      COMMIT — which is what makes `chat.prompt_version` mean something when
 *      the adversarial transcript is reviewed at the exposure gate.
 */
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  ASSISTANT_SYSTEM_PROMPT_VERSION,
  buildAssistantSystemPrompt,
  type AssistantOrgFacts,
} from "./system-prompt.cs"

const FACTS: AssistantOrgFacts = {
  legalName: "Stavby Novák s.r.o.",
  vatRegime: "platce",
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

describe("the prompt is versioned and pinned", () => {
  /**
   * If this fails you edited the prompt. That is allowed — bump
   * ASSISTANT_SYSTEM_PROMPT_VERSION and paste the new digest here, in the same
   * commit, so every transcript stays tied to the text that produced it.
   */
  it("matches the reviewed text for version 2026-08-26.1", () => {
    expect(ASSISTANT_SYSTEM_PROMPT_VERSION).toBe("2026-08-26.1")
    expect(digest(buildAssistantSystemPrompt(FACTS))).toBe(
      "66f54c2b94d4b22daee5321db912c13bae7a78bd115cd71c8b282d0ecd941ee2",
    )
  })

  it("differs by VAT regime and by nothing else", () => {
    const platce = buildAssistantSystemPrompt(FACTS)
    const neplatce = buildAssistantSystemPrompt({
      ...FACTS,
      vatRegime: "neplatce",
    })

    expect(platce).not.toBe(neplatce)
    expect(platce.replace("je plátcem DPH", "")).toBe(
      neplatce.replace("není plátcem DPH", ""),
    )
  })
})

describe("the org-facts allowlist", () => {
  it("accepts exactly two facts", () => {
    expect(Object.keys(FACTS).sort()).toEqual(["legalName", "vatRegime"])
  })

  it("renders both of them", () => {
    const prompt = buildAssistantSystemPrompt(FACTS)

    expect(prompt).toContain("Stavby Novák s.r.o.")
    expect(prompt).toContain("je plátcem DPH")
  })

  it("leaks nothing from a facts object that carries extra keys", () => {
    const smuggled = {
      ...FACTS,
      ico: "25012345",
      bankAccount: "123456789/0800",
      turnover: "4200000.00",
      noteInternal: "klient dluží za 3 měsíce",
    } as AssistantOrgFacts

    const prompt = buildAssistantSystemPrompt(smuggled)

    for (const secret of [
      "25012345",
      "123456789/0800",
      "4200000.00",
      "klient dluží",
    ]) {
      expect(prompt).not.toContain(secret)
    }
  })

  it("carries no digit that came from the client's book", () => {
    // The prompt's own text has no figures in it at all, so any digit in the
    // output could only have arrived through an injected fact. The legal name
    // is the one place a client-supplied digit is legitimate, so it is removed
    // before the check.
    const prompt = buildAssistantSystemPrompt({
      legalName: "Firma 24 s.r.o.",
      vatRegime: "neplatce",
    }).replace("Firma 24 s.r.o.", "")

    // The numbered rule list is the only remaining source of digits.
    expect(prompt.replace(/^\d\./gm, "")).not.toMatch(/\d/)
  })
})

describe("the behavioural rules the transcript is reviewed against", () => {
  const prompt = buildAssistantSystemPrompt(FACTS)

  it.each([
    [
      "states it is not binding advice",
      "závazné daňové ani právní poradenství",
    ],
    ["forbids stating a liability", "skutečnou daňovou povinnost"],
    ["refers binding questions onward", "účetní kancelář"],
    ["denies access to the client's data", "Nemáš přístup k"],
    ["refuses tax optimization", "Daňovou optimalizaci"],
    ["refuses legal representation", "Právní zastoupení"],
    ["refuses employment rulings", "pracovněprávních sporů"],
    ["answers in Czech", "Odpovídáš vždy česky"],
  ])("%s", (_name, needle) => {
    expect(prompt).toContain(needle)
  })
})
