/**
 * ARES (Administrativní registr ekonomických subjektů) — economic-subject
 * lookup by IČO. REST/JSON, public, fair-use rate limited (debounce + cache at
 * the caller; do not hammer). The fetch is a thin wrapper; the load-bearing,
 * testable logic is the pure `normalizeAresResponse`.
 *
 * Endpoint: https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}
 */
import { z } from "zod"
import { legalFormCodeFromCsu, personKindFromCsu } from "./csu-legal-form"
import { AresProfile, RegistryLookupError } from "./types"

const DEFAULT_BASE_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest"

const stringOrNumber = z.union([z.string(), z.number()])

const RawSidlo = z
  .object({
    nazevUlice: z.string().optional(),
    cisloDomovni: stringOrNumber.optional(),
    cisloOrientacni: stringOrNumber.optional(),
    cisloOrientacniPismeno: z.string().optional(),
    nazevObce: z.string().optional(),
    nazevKraje: z.string().optional(),
    psc: stringOrNumber.optional(),
    kodStatu: z.string().optional(),
  })
  .optional()

const RawDelivery = z
  .object({
    radekAdresy1: z.string().optional(),
    radekAdresy2: z.string().optional(),
    radekAdresy3: z.string().optional(),
  })
  .optional()

const RawAres = z.object({
  ico: stringOrNumber,
  obchodniJmeno: z.string().optional(),
  pravniForma: z.string().optional(),
  dic: z.string().optional(),
  datumVzniku: z.string().optional(),
  financniUrad: stringOrNumber.optional(),
  czNace: z.array(stringOrNumber).optional(),
  sidlo: RawSidlo,
  adresaDorucovaci: RawDelivery,
  dalsiUdaje: z
    .array(
      z.object({
        datovyZdroj: z.string().optional(),
        spisovaZnacka: z.string().optional(),
      }),
    )
    .optional(),
  seznamRegistraci: z.record(z.string(), z.unknown()).optional(),
})

/** číslo orientační + optional letter → "53" / "53a". */
function orientationNumber(sidlo: z.infer<typeof RawSidlo>): string | null {
  if (!sidlo || sidlo.cisloOrientacni === undefined) return null
  return `${sidlo.cisloOrientacni}${sidlo.cisloOrientacniPismeno ?? ""}`
}

function deliveryLines(delivery: z.infer<typeof RawDelivery>): string[] {
  if (!delivery) return []
  return [
    delivery.radekAdresy1,
    delivery.radekAdresy2,
    delivery.radekAdresy3,
  ].filter((l): l is string => typeof l === "string" && l.trim() !== "")
}

/** Spisová značka from the VR (veřejný rejstřík) source, if present. */
function registryFileNumber(
  dalsiUdaje: z.infer<typeof RawAres.shape.dalsiUdaje>,
): string | null {
  if (!dalsiUdaje) return null
  const vr = dalsiUdaje.find((d) => d.datovyZdroj === "VR" && d.spisovaZnacka)
  return vr?.spisovaZnacka ?? null
}

function composeStreet(sidlo: z.infer<typeof RawSidlo>): string | null {
  if (!sidlo) return null
  const { nazevUlice, cisloDomovni, cisloOrientacni } = sidlo
  const base = nazevUlice ?? sidlo.nazevObce
  if (!base) return null
  const houseNo = [cisloDomovni, cisloOrientacni]
    .filter((v) => v !== undefined && v !== null && `${v}` !== "")
    .map((v) => `${v}`)
    .join("/")
  return houseNo ? `${base} ${houseNo}` : base
}

/**
 * Normalize a raw ARES economic-subject payload into the minimal SUGGESTED
 * scaffold profile. Pure — unit-tested against recorded fixtures. Never logs.
 */
export function normalizeAresResponse(raw: unknown): AresProfile {
  const parsed = RawAres.parse(raw)
  const csuCode = parsed.pravniForma ?? null
  const sidlo = parsed.sidlo

  // seznamRegistraci.stavZdrojeVr = veřejný (obchodní/spolkový) rejstřík status.
  // "AKTIVNI" ⇒ zapsán v OR — forces double-entry (§1/2/a ZoÚ).
  const registrace = parsed.seznamRegistraci
  const inPublicRegister = registrace?.["stavZdrojeVr"] === "AKTIVNI"

  return AresProfile.parse({
    ico: `${parsed.ico}`,
    legalName: parsed.obchodniJmeno ?? "",
    legalFormCsuCode: csuCode,
    legalFormCode: legalFormCodeFromCsu(csuCode),
    personKind: personKindFromCsu(csuCode),
    dic: parsed.dic ?? null,
    inPublicRegister,
    registeredAt: parsed.datumVzniku ?? null,
    naceCodes: (parsed.czNace ?? []).map((c) => `${c}`),
    address: {
      street: composeStreet(sidlo),
      houseNumber:
        sidlo?.cisloDomovni !== undefined ? `${sidlo.cisloDomovni}` : null,
      orientationNumber: orientationNumber(sidlo),
      city: sidlo?.nazevObce ?? null,
      postalCode: sidlo?.psc !== undefined ? `${sidlo.psc}` : null,
      region: sidlo?.nazevKraje ?? null,
      countryCode: sidlo?.kodStatu ?? "CZ",
    },
    taxOfficeCode:
      parsed.financniUrad !== undefined ? `${parsed.financniUrad}` : null,
    registryFileNumber: registryFileNumber(parsed.dalsiUdaje),
    deliveryAddressLines: deliveryLines(parsed.adresaDorucovaci),
  })
}

export interface AresLookupOptions {
  /** Override for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch
  /** Override the ARES base URL (default production). */
  baseUrl?: string
  /** AbortSignal for timeout / cancellation. */
  signal?: AbortSignal
}

/** Look up an economic subject by IČO. Throws RegistryLookupError on any failure. */
export async function lookupAres(
  ico: string,
  options: AresLookupOptions = {},
): Promise<AresProfile> {
  if (!/^[0-9]{8}$/.test(ico)) {
    throw new RegistryLookupError(`invalid IČO: ${ico}`, "ARES")
  }
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  const url = `${baseUrl}/ekonomicke-subjekty/${ico}`

  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: options.signal,
    })
  } catch (cause) {
    throw new RegistryLookupError("ARES request failed", "ARES", cause)
  }
  if (!response.ok) {
    throw new RegistryLookupError(`ARES returned ${response.status}`, "ARES")
  }
  let json: unknown
  try {
    json = await response.json()
  } catch (cause) {
    throw new RegistryLookupError("ARES returned non-JSON", "ARES", cause)
  }
  try {
    return normalizeAresResponse(json)
  } catch (cause) {
    throw new RegistryLookupError("ARES payload unrecognized", "ARES", cause)
  }
}
