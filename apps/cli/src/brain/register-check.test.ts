import { describe, expect, it } from "vitest"

import {
  REGISTER_MISMATCH_CAP,
  crossCheckCounterparty,
  namesMatch,
  normalizeNameTokens,
  renderRegisterVerdict,
  verdictBlocksExecute,
  withRegisterCapSignals,
  type EventCounterparty,
  type RegisterVerdict,
} from "./register-check"
import type { CreateAccountingEventRequest } from "@workspace/shared/api"

function cp(overrides: Partial<EventCounterparty>): EventCounterparty {
  return { name: "ACME s.r.o.", ico: "12345678", ...overrides }
}

describe("normalizeNameTokens", () => {
  it("strips diacritics, case, punctuation, and legal-form tokens", () => {
    expect(normalizeNameTokens("Nový Řádek s.r.o.")).toEqual(["novy", "radek"])
    expect(normalizeNameTokens("ACME a.s.")).toEqual(["acme"])
    expect(normalizeNameTokens("s.r.o.")).toEqual([])
  })

  it("drops several Czech legal forms", () => {
    expect(normalizeNameTokens("Beta v.o.s.")).toEqual(["beta"])
    expect(normalizeNameTokens("Gama k.s.")).toEqual(["gama"])
    expect(normalizeNameTokens("Delta z.s.")).toEqual(["delta"])
    expect(normalizeNameTokens("Omega o.p.s.")).toEqual(["omega"])
  })
})

describe("namesMatch", () => {
  it("matches ignoring legal form, diacritics, punctuation, and case", () => {
    expect(namesMatch("ACME s.r.o.", "ACME s. r. o.")).toBe(true)
    expect(namesMatch("Nový Řádek", "NOVY RADEK s.r.o.")).toBe(true)
  })

  it("matches when the shorter name's tokens are a subset of the longer", () => {
    expect(namesMatch("ACME", "ACME Praha s.r.o.")).toBe(true)
    expect(namesMatch("ACME Praha s.r.o.", "ACME")).toBe(true)
  })

  it("does not match a different entity", () => {
    expect(namesMatch("ACME s.r.o.", "Globex s.r.o.")).toBe(false)
    expect(namesMatch("ACME Praha", "ACME Brno")).toBe(false)
  })

  it("never matches when a name normalizes to nothing", () => {
    expect(namesMatch("s.r.o.", "ACME")).toBe(false)
    expect(namesMatch("", "ACME")).toBe(false)
  })
})

const baseRequest: CreateAccountingEventRequest = {
  periodId: "0196f1de-0000-7000-8000-000000000001",
  seriesId: "0196f1de-0000-7000-8000-000000000002",
  description: "FP — nájem",
  occurredAt: "2025-03-14",
  confidence: 0.9,
  rationale: "test",
}

/** The cap that a verdict would assert on a request — [] when it is non-blocking. */
function capsFor(verdict: RegisterVerdict): string[] {
  return withRegisterCapSignals(baseRequest, verdict).signals?.capSignals ?? []
}

describe("crossCheckCounterparty", () => {
  it("returns no_ico when there is no checkable IČO", async () => {
    const v = await crossCheckCounterparty(cp({ ico: null }))
    expect(v.status).toBe("no_ico")
    expect(verdictBlocksExecute(v)).toBe(false)
    expect(capsFor(v)).toEqual([])
  })

  it("returns no_ico for a >8-digit garbage IČO (not checkable)", async () => {
    const v = await crossCheckCounterparty(cp({ ico: "123456789" }))
    expect(v.status).toBe("no_ico")
  })

  it("matches when ARES name matches the extracted name", async () => {
    const v = await crossCheckCounterparty(cp({ name: "ACME s.r.o." }), {
      lookup: async () => ({
        legalName: "ACME s.r.o.",
        inPublicRegister: true,
      }),
    })
    expect(v.status).toBe("match")
    expect(v.officialName).toBe("ACME s.r.o.")
    expect(verdictBlocksExecute(v)).toBe(false)
  })

  it("zero-pads a short IČO before the lookup", async () => {
    let seen = ""
    await crossCheckCounterparty(cp({ ico: "1234567" }), {
      lookup: async (ico) => {
        seen = ico
        return { legalName: "ACME s.r.o.", inPublicRegister: true }
      },
    })
    expect(seen).toBe("01234567")
  })

  it("flags a mismatch when ARES resolves a different name (blocks + caps)", async () => {
    const v = await crossCheckCounterparty(cp({ name: "ACME s.r.o." }), {
      lookup: async () => ({
        legalName: "Globex s.r.o.",
        inPublicRegister: true,
      }),
    })
    expect(v.status).toBe("mismatch")
    expect(verdictBlocksExecute(v)).toBe(true)
    expect(capsFor(v)).toEqual([REGISTER_MISMATCH_CAP])
    expect(v.message).toContain("Globex")
  })

  it("does NOT block/cap a valid OSVČ (name matches, not in a public register)", async () => {
    // inPublicRegister is the obchodní/spolkový rejstřík only — an OSVČ (natural person) is legitimately
    // not_in_register with a matching name. Blocking it would break every OSVČ doc + mislabel a correct partner.
    const v = await crossCheckCounterparty(cp({ name: "Jan Novák" }), {
      lookup: async () => ({
        legalName: "Jan Novák",
        inPublicRegister: false,
      }),
    })
    expect(v.status).toBe("not_in_register")
    expect(verdictBlocksExecute(v)).toBe(false)
    expect(capsFor(v)).toEqual([])
  })

  it("is fail-open: an ARES error degrades to unavailable, never throws or blocks", async () => {
    const v = await crossCheckCounterparty(cp({}), {
      lookup: async () => {
        throw new Error("ARES returned 503")
      },
    })
    expect(v.status).toBe("unavailable")
    expect(verdictBlocksExecute(v)).toBe(false)
    expect(capsFor(v)).toEqual([])
    expect(v.message).toContain("503")
  })

  it("handles a null counterparty as no_ico", async () => {
    const v = await crossCheckCounterparty(null)
    expect(v.status).toBe("no_ico")
  })
})

const mismatchVerdict: RegisterVerdict = {
  status: "mismatch",
  extractedName: "ACME s.r.o.",
  officialName: "Globex s.r.o.",
  inPublicRegister: true,
  ico: "12345678",
  message: "mismatch",
}
const matchVerdict: RegisterVerdict = {
  ...mismatchVerdict,
  status: "match",
  officialName: "ACME s.r.o.",
}

describe("withRegisterCapSignals", () => {
  it("is a no-op for a non-blocking verdict", () => {
    expect(withRegisterCapSignals(baseRequest, matchVerdict)).toBe(baseRequest)
  })

  it("creates the signals envelope with the cap for a mismatch", () => {
    const out = withRegisterCapSignals(baseRequest, mismatchVerdict)
    expect(out.signals?.capSignals).toEqual([REGISTER_MISMATCH_CAP])
    // does not mutate the input
    expect(baseRequest.signals).toBeUndefined()
  })

  it("merges into an existing envelope, de-duplicating", () => {
    const withExisting: CreateAccountingEventRequest = {
      ...baseRequest,
      signals: { capSignals: [REGISTER_MISMATCH_CAP], kbRule: "high_active" },
    }
    const out = withRegisterCapSignals(withExisting, mismatchVerdict)
    expect(out.signals?.capSignals).toEqual([REGISTER_MISMATCH_CAP])
    expect(out.signals?.kbRule).toBe("high_active")
  })
})

describe("renderRegisterVerdict", () => {
  it("renders a one-line marker per status", () => {
    const mk = (status: RegisterVerdict["status"]): RegisterVerdict => ({
      status,
      extractedName: "ACME s.r.o.",
      officialName: null,
      inPublicRegister: null,
      ico: "12345678",
      message: "msg",
    })
    expect(renderRegisterVerdict(mk("match"))).toContain("✓")
    expect(renderRegisterVerdict(mk("mismatch"))).toContain("✗")
    expect(renderRegisterVerdict(mk("unavailable"))).toContain("⚠")
    expect(renderRegisterVerdict(mk("match"))).toMatch(/\n$/)
  })
})
