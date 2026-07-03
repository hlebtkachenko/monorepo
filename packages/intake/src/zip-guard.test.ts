import { describe, expect, it } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { listZipEntryNames, safeUnzip, ZipGuardError } from "./zip-guard"

describe("safeUnzip", () => {
  it("unzips a normal archive under the caps", () => {
    const zip = zipSync({
      "a.txt": strToU8("hello"),
      "b.csv": strToU8("datum,castka\n2025-01-01,10\n"),
    })
    const out = safeUnzip(zip)
    expect(Object.keys(out).sort()).toEqual(["a.txt", "b.csv"])
  })

  it("rejects a single entry over the per-entry cap (fail-closed)", () => {
    const zip = zipSync({ "big.bin": strToU8("0123456789") }) // 10 uncompressed bytes
    expect(() => safeUnzip(zip, { maxEntryBytes: 4 })).toThrow(ZipGuardError)
  })

  it("aborts when cumulative decompressed bytes exceed the cap", () => {
    const zip = zipSync({
      "a.bin": strToU8("aaaa"), // 4 bytes
      "b.bin": strToU8("bbbb"), // +4 bytes → 8 > cap 6
    })
    expect(() => safeUnzip(zip, { maxTotalBytes: 6 })).toThrow(ZipGuardError)
  })

  it("aborts when the entry count exceeds the cap", () => {
    const zip = zipSync({
      "a.txt": strToU8("x"),
      "b.txt": strToU8("y"),
      "c.txt": strToU8("z"),
    })
    expect(() => safeUnzip(zip, { maxEntries: 2 })).toThrow(ZipGuardError)
  })
})

describe("listZipEntryNames", () => {
  it("lists entry names without inflating payloads", () => {
    const zip = zipSync({
      "xl/workbook.xml": strToU8("<workbook/>"),
      "nested/data.csv": strToU8("datum,castka\n2025-01-01,10\n"),
    })
    expect(listZipEntryNames(zip).sort()).toEqual([
      "nested/data.csv",
      "xl/workbook.xml",
    ])
  })

  it("returns [] on a malformed archive", () => {
    expect(listZipEntryNames(new Uint8Array([0, 1, 2, 3]))).toEqual([])
  })
})
