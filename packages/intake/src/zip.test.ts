import { describe, expect, it } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { toLeaves, unpackZip } from "./zip"
import { detectFormat } from "./detect"

describe("unpackZip", () => {
  it("returns file entries and skips directory entries", () => {
    const zip = zipSync({
      "readme.txt": strToU8("hello"),
      "nested/data.csv": strToU8("datum,castka\n2025-01-01,10\n"),
    })
    const entries = unpackZip(zip)
    const paths = entries.map((e) => e.path).sort()
    expect(paths).toEqual(["nested/data.csv", "readme.txt"])
    expect(entries.every((e) => e.bytes.length > 0)).toBe(true)
  })
})

describe("toLeaves", () => {
  it("detects a format per entry and surfaces a nested zip as zip", () => {
    const inner = zipSync({ "a.txt": strToU8("x") })
    const zip = zipSync({
      "export.csv": strToU8("datum,castka\n2025-01-01,10\n"),
      "inner.zip": inner,
    })
    const leaves = toLeaves(unpackZip(zip), detectFormat)
    const byPath = Object.fromEntries(leaves.map((l) => [l.path, l.format]))
    expect(byPath["export.csv"]).toBe("csv")
    expect(byPath["inner.zip"]).toBe("zip")
  })

  it("forces pohoda_db on every leaf of a native backup archive", () => {
    const zip = zipSync({
      "Zaloha/main.mdb": strToU8("x"),
      "Zaloha/notes.csv": strToU8("datum,castka\n2025-01-01,10\n"),
    })
    const leaves = toLeaves(unpackZip(zip), detectFormat)
    expect(leaves.every((l) => l.format === "pohoda_db")).toBe(true)
  })
})
