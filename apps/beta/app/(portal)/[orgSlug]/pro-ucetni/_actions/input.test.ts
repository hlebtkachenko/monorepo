import { describe, expect, it } from "vitest"

import {
  betaClientTaskLinkKind,
  betaFilingKind,
  betaFilingStatus,
  betaObligationGroup,
  betaPeriodKind,
} from "@/db/schema"

import {
  formChecked,
  formClientDocType,
  formClientTaskLinkKind,
  formDate,
  formDecimal,
  formDocumentStatus,
  formFilingKind,
  formFilingStatus,
  formInteger,
  formObligationGroup,
  formOptionalDate,
  formOptionalText,
  formPeriodKind,
  formString,
  formUuid,
  formVariableSymbol,
  isUuid,
} from "./input"
import { MANUAL_OBLIGATION_GROUPS } from "@/lib/obligation-labels"

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

describe("isUuid / formUuid", () => {
  it("accepts a real uuid, rejects everything that would reach Postgres as 22P02", () => {
    const id = "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6"
    expect(isUuid(id)).toBe(true)
    expect(isUuid(id.toUpperCase())).toBe(true)

    for (const bad of [
      "",
      "nope",
      "../../etc/passwd",
      "'; DROP TABLE document; --",
    ]) {
      expect(isUuid(bad), bad || "<empty>").toBe(false)
    }

    expect(formUuid(fd({ id }), "id")).toBe(id)
    expect(formUuid(fd({ id: "nope" }), "id")).toBeNull()
    expect(formUuid(fd({}), "id")).toBeNull()
  })
})

describe("closed-list readers", () => {
  it("accepts only the four document statuses", () => {
    for (const status of [
      "received",
      "in_processing",
      "processed",
      "returned",
    ]) {
      expect(formDocumentStatus(fd({ s: status }), "s"), status).toBe(status)
    }
    for (const bad of ["", "RECEIVED", "rejected", "processing"]) {
      expect(
        formDocumentStatus(fd({ s: bad }), "s"),
        bad || "<empty>",
      ).toBeNull()
    }
  })

  it("accepts a client-assignable doc type, and never `payslip`", () => {
    for (const type of ["invoice_in", "invoice_out", "receipt", "other"]) {
      expect(formClientDocType(fd({ t: type }), "t"), type).toBe(type)
    }
    // The sharpest case: `payslip` is a real enum member, and this reader
    // must refuse it anyway — the whole reason it exists rather than a plain
    // `formString`.
    expect(formClientDocType(fd({ t: "payslip" }), "t")).toBeNull()
    expect(formClientDocType(fd({ t: "faktura" }), "t")).toBeNull()
    expect(formClientDocType(fd({}), "t")).toBeNull()
  })

  it("reads a checkbox as presence", () => {
    expect(formChecked(fd({ c: "on" }), "c")).toBe(true)
    expect(formChecked(fd({ c: "true" }), "c")).toBe(true)
    expect(formChecked(fd({}), "c")).toBe(false)
    expect(formChecked(fd({ c: "off" }), "c")).toBe(false)
  })

  it("treats an empty box as clearing the field, not leaving it alone", () => {
    expect(formOptionalText(fd({ m: "  Chybí druhá strana  " }), "m")).toBe(
      "Chybí druhá strana",
    )
    expect(formOptionalText(fd({ m: "" }), "m")).toBeNull()
    expect(formOptionalText(fd({ m: "   " }), "m")).toBeNull()
    expect(formOptionalText(fd({}), "m")).toBeNull()
  })

  it("trims, and treats a file upload as absent", () => {
    expect(formString(fd({ s: "  hello  " }), "s")).toBe("hello")
    const withFile = new FormData()
    withFile.set("s", new File(["x"], "x.txt"))
    expect(formString(withFile, "s")).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Zadávání dat (PR 18)
// ---------------------------------------------------------------------------

describe("formDecimal — money, never parsed", () => {
  it("passes a well-formed amount through unchanged", () => {
    expect(formDecimal(fd({ a: "1234.50" }), "a")).toEqual({
      ok: true,
      value: "1234.50",
    })
    expect(formDecimal(fd({ a: "0.01" }), "a")).toEqual({
      ok: true,
      value: "0.01",
    })
    // No normalization of scale: `numeric(14,2)` does that, and doing it here
    // would be this layer having an opinion about a value it must not touch.
    expect(formDecimal(fd({ a: "7" }), "a")).toEqual({ ok: true, value: "7" })
  })

  it("accepts a Czech decimal comma, and moves no digit doing it", () => {
    expect(formDecimal(fd({ a: "1234,50" }), "a")).toEqual({
      ok: true,
      value: "1234.50",
    })
  })

  /**
   * The regression this pins: the office types an amount the way this app
   * itself renders it back (`formatBetaMoney` / `formatBetaAmount` emit Czech
   * grouping), and the old `.replace(",", ".")` only ever handled the comma —
   * a grouped figure like "150 000,50" still had a raw space in it and failed
   * the shape regex. Both directions are asserted together on purpose: an
   * accept-only suite would pass if the shape gate were simply deleted.
   */
  it("accepts Czech grouping — the format this app renders back", () => {
    // U+00A0 and U+202F are what Intl.NumberFormat("cs-CZ") actually emits
    // between groups; an ASCII space is what a person types.
    expect(formDecimal(fd({ a: "150 000,50" }), "a")).toEqual({
      ok: true,
      value: "150000.50",
    })
    expect(formDecimal(fd({ a: "650 000,00" }), "a")).toEqual({
      ok: true,
      value: "650000.00",
    })
    expect(formDecimal(fd({ a: "12 345,6" }), "a")).toEqual({
      ok: true,
      value: "12345.6",
    })
    // No comma at all: grouping alone on a whole number, no decimal to guess at.
    expect(formDecimal(fd({ a: "1 000" }), "a")).toEqual({
      ok: true,
      value: "1000",
    })
    // A dot is grouping only once a comma proves it: "1.234,56" is Czech for
    // 1234.56, but a lone "1.234" (already covered below) stays a refusal.
    expect(formDecimal(fd({ a: "1.234,56" }), "a")).toEqual({
      ok: true,
      value: "1234.56",
    })
  })

  it("treats an empty field as absent, not as zero", () => {
    // §0.4: "the office has not stated an amount" is not the same fact as
    // "nothing is owed", and only one of the two is a debt of nil.
    expect(formDecimal(fd({ a: "" }), "a")).toEqual({ ok: true, value: null })
    expect(formDecimal(fd({}), "a")).toEqual({ ok: true, value: null })
  })

  it("refuses an empty field when the value is required", () => {
    expect(formDecimal(fd({ a: "" }), "a", { required: true })).toEqual({
      ok: false,
    })
  })

  it("refuses anything that is not a decimal", () => {
    for (const bad of [
      "abc",
      "1.2.3",
      "1e3",
      "0.001",
      "NaN",
      "Infinity",
      "1234567890123.00",
      // A lone dot stays a decimal point: "1.234" is ambiguous (1234 written
      // Czech-style, or 1.234 with three decimals) and is left as a refusal
      // rather than guessed at — see `normalizeBetaMoneyInput`.
      "1.234",
      // Multiple commas: not a grouped-then-decimal shape either direction.
      "1,23,45",
      // Over-precision written with the Czech comma, not just the dot form
      // ("0.001" above) — the same three-decimal refusal, reached the other way.
      "150000,555",
      "12,5 Kč",
    ]) {
      expect(formDecimal(fd({ a: bad }), "a"), bad).toEqual({ ok: false })
    }
  })

  it("refuses a minus sign unless the field is sign-carrying", () => {
    // A liability is strictly positive; a filing's amount_due is not (a DPH
    // nadměrný odpočet is a refund owed to the client).
    expect(formDecimal(fd({ a: "-8400.00" }), "a")).toEqual({ ok: false })
    expect(
      formDecimal(fd({ a: "-8400.00" }), "a", { allowNegative: true }),
    ).toEqual({ ok: true, value: "-8400.00" })
  })
})

describe("formVariableSymbol", () => {
  it("accepts 1 to 10 digits, or nothing at all", () => {
    expect(formVariableSymbol(fd({ v: "1" }), "v")).toEqual({
      ok: true,
      value: "1",
    })
    expect(formVariableSymbol(fd({ v: "1234567890" }), "v")).toEqual({
      ok: true,
      value: "1234567890",
    })
    expect(formVariableSymbol(fd({ v: "" }), "v")).toEqual({
      ok: true,
      value: null,
    })
  })

  it("refuses what the DB CHECK would refuse", () => {
    for (const bad of ["12345678901", "12a4", "12 34", "-1"]) {
      expect(formVariableSymbol(fd({ v: bad }), "v"), bad).toEqual({
        ok: false,
      })
    }
  })
})

describe("formDate / formOptionalDate", () => {
  it("accepts the shape an <input type=date> posts", () => {
    expect(formDate(fd({ d: "2026-03-25" }), "d")).toBe("2026-03-25")
    expect(formOptionalDate(fd({ d: "2026-03-25" }), "d")).toEqual({
      ok: true,
      value: "2026-03-25",
    })
  })

  it("distinguishes empty from malformed, but only where empty is legal", () => {
    expect(formDate(fd({ d: "" }), "d")).toBeNull()
    expect(formOptionalDate(fd({ d: "" }), "d")).toEqual({
      ok: true,
      value: null,
    })
    expect(formOptionalDate(fd({ d: "25.03.2026" }), "d")).toEqual({
      ok: false,
    })
  })

  it("checks shape, not the calendar — Postgres owns that", () => {
    // `2026-02-31` passes the shape check and is refused by the date column.
    // Re-implementing the Gregorian calendar here would be a second authority.
    expect(formDate(fd({ d: "2026-02-31" }), "d")).toBe("2026-02-31")
  })
})

describe("formInteger", () => {
  it("accepts a whole number inside the range", () => {
    expect(formInteger(fd({ y: "2026" }), "y", { min: 2000, max: 2100 })).toBe(
      2026,
    )
    expect(formInteger(fd({ m: "3" }), "m", { min: 1, max: 12 })).toBe(3)
  })

  it("refuses out-of-range, fractional and exponent forms", () => {
    for (const bad of ["1999", "2101", "2026.5", "1e3", "", "abc", "-1"]) {
      expect(
        formInteger(fd({ y: bad }), "y", { min: 2000, max: 2100 }),
        bad || "<empty>",
      ).toBeNull()
    }
  })
})

describe("the Zadávání closed lists", () => {
  it("covers every filing kind, status and period kind the enum declares", () => {
    for (const kind of betaFilingKind.enumValues) {
      expect(formFilingKind(fd({ k: kind }), "k"), kind).toBe(kind)
    }
    for (const status of betaFilingStatus.enumValues) {
      expect(formFilingStatus(fd({ s: status }), "s"), status).toBe(status)
    }
    for (const kind of betaPeriodKind.enumValues) {
      expect(formPeriodKind(fd({ p: kind }), "p"), kind).toBe(kind)
    }
  })

  it("refuses a value that is not on the list, whatever the select rendered", () => {
    expect(formFilingKind(fd({ k: "dan_z_hazardu" }), "k")).toBeNull()
    expect(formFilingStatus(fd({ s: "overdue" }), "s")).toBeNull()
    expect(formPeriodKind(fd({ p: "week" }), "p")).toBeNull()
    expect(formObligationGroup(fd({ g: "" }), "g")).toBeNull()
  })

  it("offers the creditor groups MINUS dodavatele — the F11 fence", () => {
    // `dodavatele` belongs wholly to PR 28's imported saldokonto; a hand-typed
    // supplier payable next to its imported twin is the triple entry the
    // derived read model exists to kill. The DB refuses it too (migration
    // 0006), so this reader refusing it first is what turns a constraint
    // violation into a value that was never offered.
    expect([...MANUAL_OBLIGATION_GROUPS].sort()).toEqual(
      betaObligationGroup.enumValues
        .filter((group) => group !== "dodavatele")
        .sort(),
    )
    for (const group of MANUAL_OBLIGATION_GROUPS) {
      expect(formObligationGroup(fd({ g: group }), "g"), group).toBe(group)
    }
    expect(formObligationGroup(fd({ g: "dodavatele" }), "g")).toBeNull()
  })
})

describe("Úkoly klientovi's closed list", () => {
  it("covers every client_task link kind the enum declares", () => {
    for (const kind of betaClientTaskLinkKind.enumValues) {
      expect(formClientTaskLinkKind(fd({ k: kind }), "k"), kind).toBe(kind)
    }
  })

  it("refuses a value that is not on the list", () => {
    expect(formClientTaskLinkKind(fd({ k: "" }), "k")).toBeNull()
    expect(formClientTaskLinkKind(fd({ k: "financni" }), "k")).toBeNull()
    expect(formClientTaskLinkKind(fd({}), "k")).toBeNull()
  })
})
