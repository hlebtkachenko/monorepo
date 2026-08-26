import { describe, expect, it } from "vitest"

import { matchPayslipFilename } from "./payslip-matching"

const NOVAKOVA = { id: "emp-novakova", fullName: "Jana Nováková" }
const NOVAK = { id: "emp-novak", fullName: "Jan Novák" }
const SVOBODA = { id: "emp-svoboda", fullName: "Petr Svoboda" }

describe("matchPayslipFilename", () => {
  it("matches full name, diacritics-insensitive, high confidence", () => {
    expect(
      matchPayslipFilename("Novakova_Jana_07_2026.pdf", [
        NOVAKOVA,
        NOVAK,
        SVOBODA,
      ]),
    ).toEqual({ employeeId: NOVAKOVA.id, confidence: "high" })
  })

  it("matches surname alone as a low-confidence proposal", () => {
    expect(
      matchPayslipFilename("vyplatnice-svoboda-2026-07.pdf", [
        NOVAKOVA,
        NOVAK,
        SVOBODA,
      ]),
    ).toEqual({ employeeId: SVOBODA.id, confidence: "low" })
  })

  it("returns null when no employee name appears in the filename", () => {
    expect(
      matchPayslipFilename("dokument-12345.pdf", [NOVAKOVA, NOVAK, SVOBODA]),
    ).toBeNull()
  })

  it("returns null on an empty or purely numeric filename", () => {
    expect(matchPayslipFilename("2026-07.pdf", [NOVAKOVA])).toBeNull()
    expect(matchPayslipFilename(".pdf", [NOVAKOVA])).toBeNull()
  })

  it("never picks a wrong person: a tied surname match resolves to null", () => {
    // Two Nováks — a filename naming only the shared surname must not guess.
    const secondNovak = { id: "emp-novak-2", fullName: "Petr Novák" }
    expect(
      matchPayslipFilename("novak-vyplatnice.pdf", [NOVAK, secondNovak]),
    ).toBeNull()
  })

  it("prefers the candidate with the higher token overlap over one with a lower overlap", () => {
    // "novak" matches both NOVAK (full match) and a decoy whose name merely
    // contains a word starting differently — NOVAK must win outright, no tie.
    const decoy = { id: "emp-decoy", fullName: "Novak Dvořák" }
    expect(
      matchPayslipFilename("jan-novak-vyplatnice.pdf", [NOVAK, decoy]),
    ).toEqual({ employeeId: NOVAK.id, confidence: "high" })
  })

  it("is unaffected by an empty employee register", () => {
    expect(matchPayslipFilename("novak.pdf", [])).toBeNull()
  })

  it("ignores an employee whose name is empty or whitespace-only", () => {
    expect(
      matchPayslipFilename("novak.pdf", [
        { id: "emp-blank", fullName: "   " },
        NOVAK,
      ]),
    ).toEqual({ employeeId: NOVAK.id, confidence: "low" })
  })
})
