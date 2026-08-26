/**
 * The dark-launch gate and the four numeric ceilings.
 *
 * The gate's exact behaviour is the subject: it is the switch Hleb flips to
 * expose this module to real clients, so "unset means off" and "only the exact
 * string 'true' means on" are asserted rather than assumed.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ASSISTANT_DEFAULTS,
  ASSISTANT_DEFAULT_MODEL,
  assistantSurfaceEnabled,
  pragueDay,
  pragueMonthStart,
  readAssistantApiKey,
  readAssistantConfig,
} from "./config"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("assistantSurfaceEnabled — the exposure gate", () => {
  it("is off when the variable is absent", () => {
    expect(assistantSurfaceEnabled({})).toBe(false)
  })

  it.each(["", " ", "false", "0", "no", "off", "TRUE", "True", "1", "yes"])(
    "is off for %s",
    (value) => {
      expect(assistantSurfaceEnabled({ BETA_ASSISTANT_ENABLED: value })).toBe(
        false,
      )
    },
  )

  it("is on only for the exact string true", () => {
    expect(assistantSurfaceEnabled({ BETA_ASSISTANT_ENABLED: "true" })).toBe(
      true,
    )
    // Surrounding whitespace is trimmed — an env file with a trailing space is
    // an operator typo, not a different intent.
    expect(assistantSurfaceEnabled({ BETA_ASSISTANT_ENABLED: " true " })).toBe(
      true,
    )
  })
})

describe("readAssistantConfig — defaults", () => {
  it("falls back to the built-in ceilings when nothing is set", () => {
    const config = readAssistantConfig({})

    expect(config).toMatchObject({
      model: ASSISTANT_DEFAULT_MODEL,
      maxTokens: ASSISTANT_DEFAULTS.maxTokens,
      historyMessages: ASSISTANT_DEFAULTS.historyMessages,
      userDailyMessages: ASSISTANT_DEFAULTS.userDailyMessages,
      monthlyTokenBudget: ASSISTANT_DEFAULTS.monthlyTokenBudget,
      maxInputChars: ASSISTANT_DEFAULTS.maxInputChars,
      providerConfigured: false,
    })
  })

  it("uses the spec's stated per-user daily allowance by default", () => {
    expect(ASSISTANT_DEFAULTS.userDailyMessages).toBe(50)
  })

  it("never carries the API key on the config object", () => {
    const config = readAssistantConfig({ BETA_ASSISTANT_API_KEY: "sk-secret" })

    expect(config.providerConfigured).toBe(true)
    expect(JSON.stringify(config)).not.toContain("sk-secret")
  })

  it("reports the provider as unconfigured for a blank key", () => {
    expect(
      readAssistantConfig({ BETA_ASSISTANT_API_KEY: "   " }).providerConfigured,
    ).toBe(false)
    expect(readAssistantApiKey({ BETA_ASSISTANT_API_KEY: "   " })).toBeNull()
    expect(readAssistantApiKey({})).toBeNull()
  })
})

describe("readAssistantConfig — operator overrides", () => {
  it("honours every numeric control", () => {
    const config = readAssistantConfig({
      BETA_ASSISTANT_MODEL: "claude-haiku-4-5",
      BETA_ASSISTANT_MAX_TOKENS: "800",
      BETA_ASSISTANT_HISTORY_MESSAGES: "6",
      BETA_ASSISTANT_USER_DAILY_MESSAGES: "10",
      BETA_ASSISTANT_MONTHLY_TOKEN_BUDGET: "123456",
      BETA_ASSISTANT_MAX_INPUT_CHARS: "1000",
    })

    expect(config).toMatchObject({
      model: "claude-haiku-4-5",
      maxTokens: 800,
      historyMessages: 6,
      userDailyMessages: 10,
      monthlyTokenBudget: 123456,
      maxInputChars: 1000,
    })
  })

  it.each(["0", "-5", "abc", "50abc", "1e9", "12.5", " "])(
    "falls back to the default ceiling for %s rather than removing it",
    (value) => {
      vi.spyOn(console, "warn").mockImplementation(() => {})

      expect(
        readAssistantConfig({ BETA_ASSISTANT_USER_DAILY_MESSAGES: value })
          .userDailyMessages,
      ).toBe(ASSISTANT_DEFAULTS.userDailyMessages)
    },
  )
})

describe("pragueDay / pragueMonthStart", () => {
  it("uses the Prague calendar, not UTC", () => {
    // 23:30 UTC on 31 January is already 1 February in Prague (CET, +1) —
    // the case a naive `toISOString().slice(0, 10)` gets wrong.
    expect(pragueDay(new Date("2026-01-31T23:30:00Z"))).toBe("2026-02-01")
    // …and 00:30 UTC on 1 February is still 1 February.
    expect(pragueDay(new Date("2026-02-01T00:30:00Z"))).toBe("2026-02-01")
  })

  it("holds across the summer offset too", () => {
    // 22:30 UTC in July is 00:30 the next day in Prague (CEST, +2).
    expect(pragueDay(new Date("2026-07-15T22:30:00Z"))).toBe("2026-07-16")
  })

  it("derives the month start from the already-localized day", () => {
    expect(pragueMonthStart("2026-02-01")).toBe("2026-02-01")
    expect(pragueMonthStart("2026-12-31")).toBe("2026-12-01")
  })
})
