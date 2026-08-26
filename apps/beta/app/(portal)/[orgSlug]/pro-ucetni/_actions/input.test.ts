import { describe, expect, it } from "vitest"

import {
  formChecked,
  formClientDocType,
  formDocumentStatus,
  formOptionalText,
  formString,
  formUuid,
  isUuid,
} from "./input"

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
