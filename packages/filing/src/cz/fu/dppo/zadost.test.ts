import { describe, expect, it } from "vitest"

import { buildZadostVety } from "./zadost"
import { buildDppoFromAccounting } from "./adapter"
import { generateDppo } from "./write"
import { DppoSchema } from "../../../model/dppo"
import { validateFiling } from "../../../validate/validate"

describe("buildZadostVety", () => {
  it("ticks every part the žádost covers and denies the rest", () => {
    // Shape pinned to a real DPPDP9 the portal accepted: all six flags present,
    // "A"/"N", plus the filer's own e-mail.
    const [veta] = buildZadostVety({
      rozvaha: true,
      vzz: true,
      priloha: true,
      email: "ucetni@example.cz",
    })
    expect(veta).toEqual({
      tag: "VetaUZ",
      attrs: {
        pr11_rozv: "A",
        pr11_vzz: "A",
        pr11_puz: "A",
        pr11_pzvk: "N",
        pr11_ppt: "N",
        pr11_uzmus: "N",
        pr11_email: "ucetni@example.cz",
      },
    })
  })

  it("emits nothing when no part is requested", () => {
    // An all-"N" věta is a žádost that asks for nothing; EPO would carry a row
    // it has to ignore, and the poplatník would believe he had filed one.
    expect(buildZadostVety({})).toEqual([])
    expect(buildZadostVety({ email: "ucetni@example.cz" })).toEqual([])
  })

  it("omits the e-mail rather than sending an empty one", () => {
    const [veta] = buildZadostVety({ rozvaha: true, email: "   " })
    expect(veta!.attrs.pr11_email).toBeUndefined()
    expect(veta!.attrs.pr11_rozv).toBe("A")
  })

  it("carries the přehledy a larger účetní jednotka draws up", () => {
    const [veta] = buildZadostVety({
      zmenyVlastnihoKapitalu: true,
      penezniToky: true,
      dleMus: true,
    })
    expect(veta!.attrs).toMatchObject({
      pr11_pzvk: "A",
      pr11_ppt: "A",
      pr11_uzmus: "A",
      pr11_rozv: "N",
    })
  })
})

describe("the žádost inside a whole return", () => {
  const figures = {
    ucetni_vysledek: "-4848968",
    nedanove_naklady: "244861",
    osvobozene_vynosy: "0",
    odpocet_ztraty: "0",
    sazba: "0.21",
    slevy: "0",
  }
  const meta = {
    zdobd_od: "1.1.2025",
    zdobd_do: "31.12.2025",
    c_ufo_cil: "451",
    dic: "CZ00000019",
  }

  it("comes last, after the účetní závěrka", () => {
    // DPPO_EXTRA_VETA_TAGS puts VetaUZ after the whole U-block, and the writer
    // emits extraVety in array order.
    const model = DppoSchema.parse(
      buildDppoFromAccounting(
        figures,
        meta,
        undefined,
        { aktiva: [{ radek: "001", netto: 1 }], pasiva: [], vzz: [] },
        { rozvaha: true, vzz: true, priloha: true },
      ),
    )
    expect(model.extraVety.map((v) => v.tag)).toEqual(["VetaUA", "VetaUZ"])
  })

  it("validates against the vendored DPPDP9 XSD", async () => {
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, meta, undefined, undefined, {
        rozvaha: true,
        vzz: true,
        priloha: true,
        email: "ucetni@example.cz",
      }),
    )
    const result = await validateFiling(generateDppo(model), "dppo", "05.01.01")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("is absent when the poplatník does not ask for it", () => {
    const model = DppoSchema.parse(buildDppoFromAccounting(figures, meta))
    expect(model.extraVety).toEqual([])
  })

  it("stamps ř.10 with the day the výsledek is struck to", () => {
    // `d_hospvysl` is a date, not a částka, so it must survive the amount
    // filtering that drops every zero-valued attribute.
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, { ...meta, d_uv: "31.12.2025" }),
    )
    expect(model.vetaO?.d_hospvysl).toBe("31.12.2025")
    expect(model.header.d_uv).toBe("31.12.2025")
  })
})
