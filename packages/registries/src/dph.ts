/**
 * CRPDPH — "Registr plátců DPH" nespolehlivý-plátce / status-plátce lookup.
 *
 * SOAP (not REST), operation StatusNespolehlivyPlatceRequest, batch up to 100
 * DIČ. Endpoint:
 * https://adisrws.mfcr.cz/adistc/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP
 * (the older /dpr/axis2/services/rozhraniCRPDPH path 302-redirects; fetch
 * follows it as a body-less GET and gets a 404 — do not use it).
 *
 * What it DOES return: payer presence, unreliability flag + date, published bank
 * accounts. What it does NOT: zdaňovací období (filing period), registration
 * date, and non-payer vs identified-person — those are user-confirmed (advisor
 * change 1). The live service can't be integration-tested in CI; the pure
 * `parseCrpdphResponse` is unit-tested against a recorded fixture, and the HTTP
 * path needs a live smoke-test before production use.
 */
import {
  VatRegistryResult,
  RegistryLookupError,
  type VatBankAccount,
} from "./types"

const DEFAULT_ENDPOINT =
  "https://adisrws.mfcr.cz/adistc/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP"

/** Strip the country prefix — CRPDPH keys on the bare tax number. */
export function bareTaxNumber(dic: string): string {
  return dic.trim().replace(/^CZ/i, "")
}

export function buildCrpdphEnvelope(dic: string): string {
  const bare = bareTaxNumber(dic)
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="http://adis.mfcr.cz/rozhraniCRPDPH/">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:StatusNespolehlivyPlatceRequest>
      <urn:dic>${bare}</urn:dic>
    </urn:StatusNespolehlivyPlatceRequest>
  </soapenv:Body>
</soapenv:Envelope>`
}

function attr(tagXml: string, name: string): string | null {
  const m = tagXml.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`))
  return m ? (m[1] ?? null) : null
}

/**
 * Parse a StatusNespolehlivyPlatceResponse. Pure. Extracts the statusPlatceDPH
 * opening-tag attributes + published bank accounts. A missing statusPlatceDPH
 * element (or nespolehlivyPlatce="NENALEZEN") means "not a registered payer".
 */
export function parseCrpdphResponse(
  xml: string,
  dic: string,
): VatRegistryResult {
  // Service-level error (statusCode != 0) — NENALEZEN is a valid business answer,
  // not an error, so only a non-zero status element throws.
  const statusTag = xml.match(/<[\w:]*status\b[^>]*>/)?.[0]
  if (statusTag) {
    const code = attr(statusTag, "statusCode")
    if (code !== null && code !== "0") {
      throw new RegistryLookupError(
        `CRPDPH status ${code}: ${attr(statusTag, "statusText") ?? ""}`.trim(),
        "DPH",
      )
    }
  }

  const platceTag = xml.match(/<[\w:]*statusPlatceDPH\b[^>]*>/)?.[0]
  const nespolehlivy = platceTag ? attr(platceTag, "nespolehlivyPlatce") : null
  const found = nespolehlivy !== null && nespolehlivy !== "NENALEZEN"

  let unreliable: boolean | null = null
  if (nespolehlivy === "ANO") unreliable = true
  else if (nespolehlivy === "NE") unreliable = false

  const bankAccounts: VatBankAccount[] = []
  for (const tag of xml.matchAll(
    /<[\w:]*(?:standardni|nestandardni)Ucet\b[^>]*>/g,
  )) {
    const t = tag[0]
    const number = attr(t, "cislo")
    if (!number) continue
    bankAccounts.push({
      prefix: attr(t, "predcisli"),
      number,
      bankCode: attr(t, "kodBanky") ?? "",
    })
  }

  return VatRegistryResult.parse({
    dic,
    found,
    isPayer: found,
    unreliable,
    unreliableSince: platceTag
      ? attr(platceTag, "datumZverejneniNespolehlivosti")
      : null,
    bankAccounts,
    suggestedVatRegime: found ? "PAYER" : "NON_PAYER",
  })
}

export interface VatLookupOptions {
  fetchImpl?: typeof fetch
  endpoint?: string
  signal?: AbortSignal
}

/** Look up VAT-payer status by DIČ. Throws RegistryLookupError on any failure. */
export async function lookupVatRegistry(
  dic: string,
  options: VatLookupOptions = {},
): Promise<VatRegistryResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT

  let response: Response
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=UTF-8",
        soapaction: "",
      },
      body: buildCrpdphEnvelope(dic),
      signal: options.signal,
    })
  } catch (cause) {
    throw new RegistryLookupError("CRPDPH request failed", "DPH", cause)
  }
  if (!response.ok) {
    throw new RegistryLookupError(`CRPDPH returned ${response.status}`, "DPH")
  }
  const text = await response.text()
  return parseCrpdphResponse(text, dic)
}
