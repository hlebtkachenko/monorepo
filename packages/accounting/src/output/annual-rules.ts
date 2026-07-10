import type { Decimal } from "../types"

export type DppoTaxpayerCategory =
  | "STANDARD"
  | "BASIC_INVESTMENT_FUND"
  | "QUALIFYING_PENSION_INSTITUTION"
  | "OTHER"

export type DppoRateResolution =
  | {
      status: "SUPPORTED"
      category: Exclude<DppoTaxpayerCategory, "OTHER">
      rate: Decimal
      effectiveFrom: string
      effectiveTo: string | null
      sourceUrl: string
      verifiedOn: string
    }
  | {
      status: "UNSUPPORTED"
      category: DppoTaxpayerCategory | "UNKNOWN"
      reason: string
    }

const OFFICIAL_DPPO_SOURCE =
  "https://financnisprava.gov.cz/cs/dane/dane/dan-z-prijmu/pravnicke-osoby/obecne-informace"

const STANDARD_RATE_RULES = [
  {
    effectiveFrom: "2010-01-01",
    effectiveTo: "2023-12-31",
    rate: "0.19",
    sourceUrl:
      "https://financnisprava.gov.cz/assets/cs/prilohy/d-zakony/Spojena_verze_ZDP-konsolidacni_balicek.pdf",
    verifiedOn: "2026-07-09",
  },
  {
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    rate: "0.21",
    sourceUrl: OFFICIAL_DPPO_SOURCE,
    verifiedOn: "2026-07-09",
  },
] as const

export function resolveDppoRate(
  periodStart: string,
  category: DppoTaxpayerCategory | undefined,
): DppoRateResolution {
  if (category == null) {
    return {
      status: "UNSUPPORTED",
      category: "UNKNOWN",
      reason: "Taxpayer category has not been configured.",
    }
  }
  if (category === "OTHER") {
    return {
      status: "UNSUPPORTED",
      category,
      reason: "This taxpayer category needs an advisor-provided rate rule.",
    }
  }
  if (category === "BASIC_INVESTMENT_FUND") {
    if (periodStart < "2024-01-01") {
      return {
        status: "UNSUPPORTED",
        category,
        reason: "Historical investment-fund rate rules are not configured.",
      }
    }
    return {
      status: "SUPPORTED",
      category,
      rate: "0.05",
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
      sourceUrl: OFFICIAL_DPPO_SOURCE,
      verifiedOn: "2026-07-09",
    }
  }
  if (category === "QUALIFYING_PENSION_INSTITUTION") {
    if (periodStart < "2024-01-01") {
      return {
        status: "UNSUPPORTED",
        category,
        reason: "Historical pension-institution rate rules are not configured.",
      }
    }
    return {
      status: "SUPPORTED",
      category,
      rate: "0",
      effectiveFrom: "2024-01-01",
      effectiveTo: null,
      sourceUrl: OFFICIAL_DPPO_SOURCE,
      verifiedOn: "2026-07-09",
    }
  }

  const rule = STANDARD_RATE_RULES.find(
    (candidate) =>
      candidate.effectiveFrom <= periodStart &&
      (candidate.effectiveTo == null || periodStart <= candidate.effectiveTo),
  )
  if (!rule) {
    return {
      status: "UNSUPPORTED",
      category,
      reason: "No verified standard DPPO rate covers this taxable period.",
    }
  }
  return { status: "SUPPORTED", category, ...rule }
}
