import { describe, expect, it } from "vitest"

import { generateDphdp3 } from "./write"
import { readDphdp3 } from "./read"
import { buildDphdp3FromAccounting, type DphFigures } from "../adapter"

const meta = {
  rok: "2026",
  mesic: "6",
  zdobd_od: "2026-06-01",
  zdobd_do: "2026-06-30",
  c_ufo: "451",
  dic: "CZ12345678",
  name: "ACME s.r.o.",
}

const figures: DphFigures = {
  r1_base: "100000.00",
  r1_dan: "21000.00",
  r2_base: "0",
  r2_dan: "0",
  r3_base: "0",
  r3_dan: "0",
  r4_base: "0",
  r4_dan: "0",
  r5_base: "0",
  r5_dan: "0",
  r6_base: "0",
  r6_dan: "0",
  r10_base: "0",
  r10_dan: "0",
  r11_base: "0",
  r11_dan: "0",
  r12_base: "0",
  r12_dan: "0",
  r13_base: "0",
  r13_dan: "0",
  r20_base: "0",
  r21_base: "0",
  r22_base: "0",
  r25_base: "0",
  r40_base: "40000.00",
  r40_dan: "8400.00",
  r41_base: "0",
  r41_dan: "0",
  r43_base: "0",
  r43_dan: "0",
  r44_base: "0",
  r44_dan: "0",
  r50_base: "0",
  dan_na_vystupu: "21000.00",
  odpocet: "8400.00",
  vlastni_dan: "12600.00",
}

describe("readDphdp3", () => {
  it("reads back the typed header + payer", () => {
    const xml = generateDphdp3(buildDphdp3FromAccounting(figures, meta))
    const model = readDphdp3(xml)
    expect(model.header.rok).toBe("2026")
    expect(model.header.mesic).toBe("6")
    expect(model.header.k_uladis).toBe("DPH")
    expect(model.payer.dic).toBe("12345678")
    expect(model.payer.c_ufo).toBe("451")
    expect(model.veta1?.obrat23).toBe("100000")
  })

  it("is idempotent under generate → read → generate", () => {
    const xml1 = generateDphdp3(buildDphdp3FromAccounting(figures, meta))
    const xml2 = generateDphdp3(readDphdp3(xml1))
    expect(xml2).toBe(xml1)
  })

  it("throws on a document without the DPHDP3 root", () => {
    expect(() => readDphdp3("<Pisemnost></Pisemnost>")).toThrow(/DPHDP3/)
  })
})
