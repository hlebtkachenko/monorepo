import { describe, expect, it } from "vitest"

import {
  AVERAGE_WAGE_2026_CZK_MINOR,
  dpfoMarginalRatePercent,
  DPFO_PROGRESSIVE_THRESHOLD_2026_CZK_MINOR,
  DPFO_RATE_LOWER_PERCENT,
  DPFO_RATE_UPPER_PERCENT,
  exceedsUcetniJednotkaObrat,
  MIN_MONTHLY_ZDRAVOTNI_ADVANCE_2026_CZK_MINOR,
  minMonthlyDuchodoveAdvanceCzkMinor,
  PAUSALNI_DAN_ENTRY_DEADLINE,
  PAUSALNI_DAN_TURNOVER_CEILING_CZK_MINOR,
  PAUSALNI_VYDAJE,
  PAUSALNI_VYDAJE_INCOME_CEILING_CZK_MINOR,
  pausalniDanMonthlyCzkMinor,
  PENEZNI_DENIK_COLUMNS,
  PREHLED_DEADLINES_2026,
  SLEVA_NA_POPLATNIKA_2026_CZK_MINOR,
  TAX_YEAR,
  UCETNI_JEDNOTKA_OBRAT_THRESHOLD_CZK_MINOR,
  ucetnictviObligationStartYear,
} from "./osvc"

// 2026 values verified vs official Finanční správa / ČSSZ / VZP (Opus-xhigh, 2026-06-25).

describe("účetní jednotka trigger (§1 odst. 2 e + §4 odst. 3 zák. 563/1991)", () => {
  it("25M obrat threshold = ONE preceding calendar year (resolved open question)", () => {
    expect(UCETNI_JEDNOTKA_OBRAT_THRESHOLD_CZK_MINOR).toBe(25_000_000n * 100n)
    expect(exceedsUcetniJednotkaObrat(25_000_001n * 100n)).toBe(true)
    expect(exceedsUcetniJednotkaObrat(25_000_000n * 100n)).toBe(false) // not strictly over
  })

  it("§4 odst. 3 one-year buffer: exceeded in N → účetnictví obligation from 1 Jan N+2", () => {
    expect(ucetnictviObligationStartYear(2025)).toBe(2027)
  })
})

describe("peněžní deník column taxonomy (§7b ZDP)", () => {
  it("only the taxable income/expense columns feed the §7 tax base", () => {
    const taxBaseColumns = PENEZNI_DENIK_COLUMNS.filter(
      (c) => c.affectsTaxBase,
    ).map((c) => c.id)
    expect(taxBaseColumns).toEqual(["prijmy_zd", "vydaje_zd"])
  })

  it("carries the cash + bank money columns and the tax-neutral transfer column", () => {
    const ids = PENEZNI_DENIK_COLUMNS.map((c) => c.id)
    expect(ids).toContain("pokladna_prijem")
    expect(ids).toContain("banka_vydaj")
    const transfer = PENEZNI_DENIK_COLUMNS.find(
      (c) => c.id === "prubezne_polozky",
    )
    expect(transfer?.kind).toBe("transfer")
    expect(transfer?.affectsTaxBase).toBe(false)
  })

  it("DPH columns (plátce only) never affect the income-tax base", () => {
    const vat = PENEZNI_DENIK_COLUMNS.filter((c) => c.kind === "vat")
    expect(vat).toHaveLength(2)
    expect(vat.every((c) => !c.affectsTaxBase)).toBe(true)
  })
})

describe("paušální výdaje (§7 odst. 7 / §9 odst. 4) — 2026", () => {
  it("rates + caps: 80/1.6M, 60/1.2M, 40/0.8M, 30/0.6M", () => {
    expect(PAUSALNI_VYDAJE.agriculture_craft_80).toMatchObject({
      ratePercent: 80,
      capCzkMinor: 1_600_000n * 100n,
    })
    expect(PAUSALNI_VYDAJE.other_trade_60).toMatchObject({
      ratePercent: 60,
      capCzkMinor: 1_200_000n * 100n,
    })
    expect(PAUSALNI_VYDAJE.other_self_employment_40).toMatchObject({
      ratePercent: 40,
      capCzkMinor: 800_000n * 100n,
    })
    expect(PAUSALNI_VYDAJE.rental_30).toMatchObject({
      ratePercent: 30,
      capCzkMinor: 600_000n * 100n,
    })
  })

  it("income ceiling for electing paušál výdaje = 2 000 000 Kč", () => {
    expect(PAUSALNI_VYDAJE_INCOME_CEILING_CZK_MINOR).toBe(2_000_000n * 100n)
  })
})

describe("paušální daň 2026 — Band 1 is split-year (novela, advances ↓ from 1.7.2026)", () => {
  it("Band 1: 9 984 Kč Jan–Jun, 9 162 Kč from July", () => {
    expect(pausalniDanMonthlyCzkMinor("band_1", "h1_jan_jun")).toBe(998_400n)
    expect(pausalniDanMonthlyCzkMinor("band_1", "h2_jul_dec")).toBe(916_200n)
  })

  it("Bands 2 and 3 are unchanged across the year (16 745 / 27 139 Kč)", () => {
    expect(pausalniDanMonthlyCzkMinor("band_2", "h1_jan_jun")).toBe(1_674_500n)
    expect(pausalniDanMonthlyCzkMinor("band_2", "h2_jul_dec")).toBe(1_674_500n)
    expect(pausalniDanMonthlyCzkMinor("band_3", "h1_jan_jun")).toBe(2_713_900n)
    expect(pausalniDanMonthlyCzkMinor("band_3", "h2_jul_dec")).toBe(2_713_900n)
  })
})

describe("DPFO §16 progressive base — 2026", () => {
  it("23% threshold = 36× average wage = 1 762 812 Kč", () => {
    expect(AVERAGE_WAGE_2026_CZK_MINOR).toBe(48_967n * 100n)
    expect(DPFO_PROGRESSIVE_THRESHOLD_2026_CZK_MINOR).toBe(
      36n * AVERAGE_WAGE_2026_CZK_MINOR,
    )
    expect(DPFO_PROGRESSIVE_THRESHOLD_2026_CZK_MINOR).toBe(1_762_812n * 100n)
  })

  it("marginal rate is 15% up to the threshold, 23% above", () => {
    expect(
      dpfoMarginalRatePercent(DPFO_PROGRESSIVE_THRESHOLD_2026_CZK_MINOR),
    ).toBe(DPFO_RATE_LOWER_PERCENT)
    expect(
      dpfoMarginalRatePercent(DPFO_PROGRESSIVE_THRESHOLD_2026_CZK_MINOR + 1n),
    ).toBe(DPFO_RATE_UPPER_PERCENT)
    expect(DPFO_RATE_LOWER_PERCENT).toBe(15)
    expect(DPFO_RATE_UPPER_PERCENT).toBe(23)
  })
})

describe("OSVČ přehledy min advances 2026 — důchodové split-year, zdravotní flat", () => {
  it("min monthly důchodové (sociální) advance: 5 720 Kč Jan–Jun, 5 005 Kč from July", () => {
    expect(minMonthlyDuchodoveAdvanceCzkMinor("h1_jan_jun")).toBe(572_000n)
    expect(minMonthlyDuchodoveAdvanceCzkMinor("h2_jul_dec")).toBe(500_500n)
  })

  it("min monthly zdravotní advance: 3 306 Kč whole year (not affected by the novela)", () => {
    expect(MIN_MONTHLY_ZDRAVOTNI_ADVANCE_2026_CZK_MINOR).toBe(330_600n)
  })
})

describe("pinned verified reference constants (regression guards)", () => {
  it("tax year is 2026 and paušál-daň turnover ceilings are 1M / 1.5M / 2M", () => {
    expect(TAX_YEAR).toBe(2026)
    expect(PAUSALNI_DAN_TURNOVER_CEILING_CZK_MINOR.band_1).toBe(
      1_000_000n * 100n,
    )
    expect(PAUSALNI_DAN_TURNOVER_CEILING_CZK_MINOR.band_2).toBe(
      1_500_000n * 100n,
    )
    expect(PAUSALNI_DAN_TURNOVER_CEILING_CZK_MINOR.band_3).toBe(
      2_000_000n * 100n,
    )
  })

  it("základní sleva na poplatníka 2026 = 30 840 Kč/rok", () => {
    expect(SLEVA_NA_POPLATNIKA_2026_CZK_MINOR).toBe(30_840n * 100n)
  })

  it("paušál-daň entry deadline is the 10 January statutory rule (with business-day shift)", () => {
    expect(PAUSALNI_DAN_ENTRY_DEADLINE).toContain("10. ledna")
  })

  it("přehled deadlines for TY2025 (filed 2026): ČSSZ 4.5 / 1.6 / 3.8", () => {
    expect(PREHLED_DEADLINES_2026.cssz_standard).toBe("2026-05-04")
    expect(PREHLED_DEADLINES_2026.cssz_electronic_extended).toBe("2026-06-01")
    expect(PREHLED_DEADLINES_2026.cssz_tax_advisor).toBe("2026-08-03")
  })
})
