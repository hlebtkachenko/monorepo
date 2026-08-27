/**
 * The calm-demo switch, in both of its states, plus the log line that is the
 * whole justification for the mode existing at all.
 *
 * Env is injected as a parameter rather than stubbed on `process.env` — the
 * module is pure and the test should stay so, exactly as
 * `lib/auth/totp-enforcement.test.ts` does for the other gate in this app.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { calmErrorsEnabled, logCalmedError } from "./demo-mode"

/** The mode switched on — every case below that expects it names this. */
const ON = { BETA_DEMO_CALM_ERRORS: "true" }

describe("calmErrorsEnabled — the switch", () => {
  it("is off when unset, which is the deployed state everywhere", () => {
    expect(calmErrorsEnabled({})).toBe(false)
    expect(calmErrorsEnabled({ BETA_DEMO_CALM_ERRORS: undefined })).toBe(false)
  })

  it("is on for exactly `true`, and for nothing else", () => {
    expect(calmErrorsEnabled(ON)).toBe(true)
    // Trimmed, because an env file written by hand carries whitespace.
    expect(calmErrorsEnabled({ BETA_DEMO_CALM_ERRORS: " true " })).toBe(true)
    // A fuzzy truthiness check is how a gate ends up open on "false" — and this
    // gate opening by accident means a real production failure renders as
    // "data se připravují" to a real client.
    for (const value of ["1", "yes", "on", "TRUE", "True", "false", ""]) {
      expect(calmErrorsEnabled({ BETA_DEMO_CALM_ERRORS: value }), value).toBe(
        false,
      )
    }
  })

  it("reads no other variable — the two sibling gates cannot switch it on", () => {
    expect(
      calmErrorsEnabled({
        BETA_TOTP_REQUIRED: "true",
        BETA_ASSISTANT_ENABLED: "true",
      }),
    ).toBe(false)
  })
})

describe("logCalmedError — where a suppressed failure goes", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("names the surface and carries the error through untouched", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const boom = new Error('relation "beta_document" does not exist')

    logCalmedError("dokumenty/upload", boom)

    expect(spy).toHaveBeenCalledWith("[calm-demo] dokumenty/upload", boom)
  })

  it("uses one greppable prefix, so a demo operator can find every hidden failure", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    logCalmedError("/[orgSlug]", new Error("a"))
    logCalmedError("asistent/chat", new Error("b"))

    for (const call of spy.mock.calls) {
      expect(String(call[0]).startsWith("[calm-demo] ")).toBe(true)
    }
  })
})
