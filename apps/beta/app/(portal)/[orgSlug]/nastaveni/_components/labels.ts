import type { BetaMessageKey } from "@/i18n/messages"
import type { IdentityField } from "@/lib/ares/suggestions"

/**
 * The Czech label for every editable identity-card field, keyed by the SAME
 * names `IDENTITY_FIELDS` declares.
 *
 * `satisfies Record<IdentityField, ...>` is what keeps the two in step: adding a
 * field to `IDENTITY_FIELDS` without a label here is a compile error, and a
 * label for a field that no longer exists is one too. Without it the form would
 * silently render an untranslated key — or silently drop a field nobody noticed
 * was missing.
 *
 * The ARES suggestion list reads the same map, so a field is named identically
 * whether the office is typing it or accepting it from the registry.
 */
export const IDENTITY_FIELD_LABEL = {
  legalName: "nastaveni.fieldLegalName",
  ico: "nastaveni.fieldIco",
  dic: "nastaveni.fieldDic",
  registeredStreet: "nastaveni.fieldStreet",
  registeredHouseNumber: "nastaveni.fieldHouseNumber",
  registeredOrientationNumber: "nastaveni.fieldOrientationNumber",
  registeredCity: "nastaveni.fieldCity",
  registeredPostalCode: "nastaveni.fieldPostalCode",
  registeredCountryCode: "nastaveni.fieldCountryCode",
  dataBoxId: "nastaveni.fieldDataBoxId",
  courtFileNumber: "nastaveni.fieldCourtFileNumber",
  taxOfficeCode: "nastaveni.fieldTaxOfficeCode",
  bankAccountPrefix: "nastaveni.fieldBankPrefix",
  bankAccountNumber: "nastaveni.fieldBankNumber",
  bankCode: "nastaveni.fieldBankCode",
  iban: "nastaveni.fieldIban",
  bic: "nastaveni.fieldBic",
  contactEmail: "nastaveni.fieldContactEmail",
  contactPhone: "nastaveni.fieldContactPhone",
} as const satisfies Record<IdentityField, BetaMessageKey>
