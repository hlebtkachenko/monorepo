/**
 * Prefill — a SUGGESTED-input factory. The ONLY thing in this package that
 * performs HTTP, and it runs strictly BEFORE (never inside) the scaffold
 * transaction. A caller (UI wizard, agent) runs it, a human/agent confirms the
 * result, and the confirmed values flow into `scaffoldOrganization` as plain
 * data. Registry-down is a non-event: failures become warnings and the caller
 * falls back to manual entry.
 */
import {
  lookupAres,
  lookupVatRegistry,
  type AresProfile,
  type VatRegistryResult,
} from "@workspace/registries"
import type { ScaffoldInputRaw } from "./input"

export interface PrefillOptions {
  ico: string
  fetchImpl?: typeof fetch
  aresBaseUrl?: string
  dphEndpoint?: string
  signal?: AbortSignal
}

export interface PrefillResult {
  /** Partial ScaffoldInput to merge under the caller's confirmed values. */
  suggestion: Partial<ScaffoldInputRaw>
  ares: AresProfile | null
  dph: VatRegistryResult | null
  /** Non-fatal notes (unmapped legal form, registry down, filing-period unknown). */
  warnings: string[]
}

export async function prefillFromRegistries(
  options: PrefillOptions,
): Promise<PrefillResult> {
  const warnings: string[] = []

  let ares: AresProfile | null = null
  try {
    ares = await lookupAres(options.ico, {
      fetchImpl: options.fetchImpl,
      baseUrl: options.aresBaseUrl,
      signal: options.signal,
    })
  } catch (e) {
    warnings.push(`ARES lookup failed: ${(e as Error).message}`)
  }

  let dph: VatRegistryResult | null = null
  const dic = ares?.dic ?? null
  if (dic) {
    try {
      dph = await lookupVatRegistry(dic, {
        fetchImpl: options.fetchImpl,
        endpoint: options.dphEndpoint,
        signal: options.signal,
      })
    } catch (e) {
      warnings.push(`DPH registry lookup failed: ${(e as Error).message}`)
    }
  }

  const suggestion: Partial<ScaffoldInputRaw> = {}

  if (ares) {
    suggestion.legalName = ares.legalName
    suggestion.ico = ares.ico
    if (ares.legalFormCode) suggestion.legalFormCode = ares.legalFormCode
    else
      warnings.push(
        "legal form not auto-mapped from ČSÚ code — select manually",
      )
    if (ares.personKind) suggestion.personKind = ares.personKind
    suggestion.inPublicRegister = ares.inPublicRegister
    if (ares.dic) suggestion.dic = ares.dic
    if (ares.registeredAt) suggestion.registeredAt = ares.registeredAt
    suggestion.businessActivityCodes = ares.naceCodes
    suggestion.address = {
      street: ares.address.street,
      houseNumber: ares.address.houseNumber,
      orientationNumber: ares.address.orientationNumber,
      city: ares.address.city,
      postalCode: ares.address.postalCode,
      region: ares.address.region,
      countryCode: ares.address.countryCode,
    }
    if (ares.taxOfficeCode) {
      suggestion.taxOfficeCode = ares.taxOfficeCode
      warnings.push("tax office prefilled from ARES — confirm")
    }
    if (ares.registryFileNumber)
      suggestion.registryFileNumber = ares.registryFileNumber
    if (ares.deliveryAddressLines.length > 0)
      suggestion.deliveryAddressLines = ares.deliveryAddressLines
    suggestion.aresSnapshot = ares
  }

  if (dph) {
    suggestion.vatRegimeCode = dph.suggestedVatRegime
    if (dph.suggestedVatRegime === "PAYER") {
      suggestion.vatFilingPeriod = "MONTHLY"
      warnings.push(
        "VAT registry cannot report the filing period — defaulted to monthly; confirm (§99/§99a)",
      )
    }
    suggestion.dphSnapshot = dph
  }

  return { suggestion, ares, dph, warnings }
}
