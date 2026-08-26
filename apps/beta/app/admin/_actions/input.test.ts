/**
 * The /admin request boundary.
 *
 * A Server Action's `FormData` is request input whatever the page rendered — a
 * `<select>` with four options is a suggestion to a browser, not a constraint
 * on a POST. Everything here turns a string into a value from a closed list or
 * into `null`, so there is no cast anywhere in the action layer and an
 * unrecognised value is a refusal rather than a Postgres error.
 */
import { describe, expect, it } from "vitest"

import {
  formChecked,
  formDate,
  formFlag,
  formRole,
  formString,
  formUuid,
  formVatRegime,
  isUuid,
} from "./input"

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

describe("isUuid", () => {
  /**
   * Not cosmetic. Postgres answers a non-uuid `= $1` against a uuid column with
   * 22P02 (invalid input syntax), which reaches the browser as a 500 — so a
   * typo'd `/admin/organizace/<junk>` used to be an error page instead of a
   * 404, and the difference told a probe which ids were well-formed.
   */
  it("accepts a real uuid in either case", () => {
    expect(isUuid("0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6")).toBe(true)
    expect(isUuid("0195E6A1-4B2C-7D3E-8F10-A1B2C3D4E5F6")).toBe(true)
    // uuidv7, which is what every primary key in this schema defaults to.
    expect(isUuid("01930000-0000-7000-8000-000000000000")).toBe(true)
  })

  it("rejects everything that would reach Postgres as 22P02", () => {
    for (const bad of [
      "",
      "  ",
      "nope",
      "../../etc/passwd",
      "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f",
      "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f66",
      "0195e6a1_4b2c_7d3e_8f10_a1b2c3d4e5f6",
      "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5g6",
      "'; DROP TABLE organization; --",
    ]) {
      expect(isUuid(bad), bad || "<empty>").toBe(false)
    }
  })

  it("is the same rule the form reader uses", () => {
    const id = "01930000-0000-7000-8000-000000000000"
    expect(formUuid(fd({ id }), "id")).toBe(id)
    expect(formUuid(fd({ id: "nope" }), "id")).toBeNull()
    expect(formUuid(fd({}), "id")).toBeNull()
  })
})

describe("closed-list readers", () => {
  it("accepts only the four org roles", () => {
    for (const role of ["owner", "admin", "member", "guest"]) {
      expect(formRole(fd({ role }), "role"), role).toBe(role)
    }
    for (const bad of ["", "superuser", "OWNER", "agent"]) {
      expect(formRole(fd({ role: bad }), "role"), bad || "<empty>").toBeNull()
    }
  })

  it("accepts only the two VAT regimes, and never guesses", () => {
    expect(formVatRegime(fd({ v: "platce" }), "v")).toBe("platce")
    expect(formVatRegime(fd({ v: "neplatce" }), "v")).toBe("neplatce")
    // The caller must refuse on null rather than fall back: a silent default
    // marks a book as a non-payer, and the whole Daně module keys off it.
    for (const bad of ["", "PLATCE", "osvobozeny", "identifikovana"]) {
      expect(formVatRegime(fd({ v: bad }), "v"), bad || "<empty>").toBeNull()
    }
  })

  it("reads an explicit two-state flag, never treating absence as false", () => {
    // Deactivate/activate posts a literal, so "the field was missing" can never
    // be read as "set it to false".
    expect(formFlag(fd({ f: "true" }), "f")).toBe(true)
    expect(formFlag(fd({ f: "false" }), "f")).toBe(false)
    for (const bad of ["", "on", "1", "yes-please"]) {
      expect(formFlag(fd({ f: bad }), "f"), bad || "<empty>").toBeNull()
    }
    expect(formFlag(fd({}), "f")).toBeNull()
  })

  it("reads a checkbox as presence", () => {
    expect(formChecked(fd({ c: "on" }), "c")).toBe(true)
    expect(formChecked(fd({ c: "true" }), "c")).toBe(true)
    // An unchecked box is simply absent from the payload.
    expect(formChecked(fd({}), "c")).toBe(false)
    expect(formChecked(fd({ c: "off" }), "c")).toBe(false)
  })

  it("accepts only an ISO date", () => {
    expect(formDate(fd({ d: "2026-04-01" }), "d")).toBe("2026-04-01")
    for (const bad of [
      "",
      "1. 4. 2026",
      "2026-4-1",
      "now()",
      "2026-04-01T00:00",
    ]) {
      expect(formDate(fd({ d: bad }), "d"), bad || "<empty>").toBeNull()
    }
  })

  it("trims, and treats a file upload as absent", () => {
    expect(formString(fd({ s: "  hello  " }), "s")).toBe("hello")
    const withFile = new FormData()
    withFile.set("s", new File(["x"], "x.txt"))
    expect(formString(withFile, "s")).toBe("")
  })
})
