/**
 * Normalized outputs of the Czech public-registry lookups. These are the ONLY
 * shapes that leave the package — raw ARES JSON / DPH SOAP payloads never do
 * (they carry PII and are captured as opaque snapshots by the caller). Kept
 * minimal on purpose (advisor change 14).
 */
import { z } from "zod"

/** person_kind as the platform organization stores it. */
export const PersonKind = z.enum(["legal_entity", "natural_person"])
export type PersonKind = z.infer<typeof PersonKind>

export const AresAddress = z.object({
  /** Composed display line (e.g. "Jankovcova 1522/53"). */
  street: z.string().nullable(),
  /** číslo popisné. */
  houseNumber: z.string().nullable(),
  /** číslo orientační incl. any letter (e.g. "53a"). */
  orientationNumber: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  /** Kraj (region name). */
  region: z.string().nullable(),
  /** ISO 3166-1 alpha-2 (ARES emits "CZ"). */
  countryCode: z.string().nullable(),
})
export type AresAddress = z.infer<typeof AresAddress>

/** Normalized ARES economic-subject profile — a SUGGESTED scaffold input. */
export const AresProfile = z.object({
  ico: z.string(),
  legalName: z.string(),
  /** Raw ČSÚ právní-forma code (číselník 21), kept for audit / manual mapping. */
  legalFormCsuCode: z.string().nullable(),
  /** Mapped internal legal_form.code; null when the ČSÚ code is unmapped. */
  legalFormCode: z.string().nullable(),
  personKind: PersonKind.nullable(),
  /** DIČ incl. country prefix (CZ12345678); null when the subject is not tax-registered. */
  dic: z.string().nullable(),
  /**
   * Registered in a public register (obchodní/spolkový rejstřík). Forces
   * double-entry even for a natural person (§1 odst. 2 písm. a) ZoÚ) —
   * consumed by the orchestrator's regime derivation.
   */
  inPublicRegister: z.boolean(),
  /** datum vzniku (ISO date); the first period's start for a NEW entity. */
  registeredAt: z.string().nullable(),
  /** CZ-NACE activity codes (předmět podnikání). */
  naceCodes: z.array(z.string()),
  address: AresAddress,
  /** Finanční úřad (ÚFO) code; from ARES financniUrad. */
  taxOfficeCode: z.string().nullable(),
  /** Spisová značka incl. court (VR source), e.g. "C 12345, Krajský soud v Plzni". */
  registryFileNumber: z.string().nullable(),
  /** Poštovní (delivery) address — up to 3 free-text lines (adresaDorucovaci). */
  deliveryAddressLines: z.array(z.string()),
})
export type AresProfile = z.infer<typeof AresProfile>

export const VatBankAccount = z.object({
  prefix: z.string().nullable(),
  number: z.string(),
  bankCode: z.string(),
})
export type VatBankAccount = z.infer<typeof VatBankAccount>

/**
 * Normalized nespolehlivý-plátce / status-plátce result (CRPDPH). What the
 * registry CANNOT tell you: filing period, registration date, and whether a
 * not-found DIČ is a non-payer vs an identified person — all user-confirmed
 * (advisor change 1).
 */
export const VatRegistryResult = z.object({
  dic: z.string(),
  /** Present in CRPDPH ⇒ a registered VAT payer (plátce). */
  found: z.boolean(),
  isPayer: z.boolean(),
  /** true = nespolehlivý plátce (ANO); false = NE; null = NENALEZEN. */
  unreliable: z.boolean().nullable(),
  unreliableSince: z.string().nullable(),
  bankAccounts: z.array(VatBankAccount),
  /**
   * Best-effort regime for the wizard to pre-select. NEVER auto-committed:
   * IDENTIFIED_PERSON is indistinguishable from NON_PAYER via CRPDPH.
   */
  suggestedVatRegime: z.enum(["PAYER", "NON_PAYER"]),
})
export type VatRegistryResult = z.infer<typeof VatRegistryResult>

/** A registry call that failed / returned nothing — the caller falls back to manual. */
export class RegistryLookupError extends Error {
  readonly source: "ARES" | "DPH"
  constructor(message: string, source: "ARES" | "DPH", cause?: unknown) {
    super(message, { cause })
    this.name = "RegistryLookupError"
    this.source = source
  }
}
