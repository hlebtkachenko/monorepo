/**
 * Pure map: wizard form values + server-injected scope → the domain
 * ScaffoldInput. Type-only import of the domain type (erased at runtime) keeps
 * this module free of @workspace/db, so it is unit-testable without a database.
 */
import type { ScaffoldInputRaw } from "@workspace/org-provisioning"
import type { OrgWizardInput } from "./wizard-schema"

export interface ScaffoldScope {
  workspaceId: string
  ownerUserId: string
  idempotencyKey: string
}

/** Empty string → undefined (the wizard uses "" for untouched optional fields). */
function clean(value: string | undefined): string | undefined {
  return value && value.trim() !== "" ? value : undefined
}

export function buildScaffoldInput(
  values: OrgWizardInput,
  scope: ScaffoldScope,
): ScaffoldInputRaw {
  const hasAddress =
    clean(values.street) ||
    clean(values.houseNumber) ||
    clean(values.orientationNumber) ||
    clean(values.city) ||
    clean(values.postalCode) ||
    clean(values.region) ||
    clean(values.countryCode)

  const signerGiven = clean(values.signerGivenName)
  const signerFamily = clean(values.signerFamilyName)

  return {
    workspaceId: scope.workspaceId,
    ownerUserId: scope.ownerUserId,
    idempotencyKey: scope.idempotencyKey,

    legalName: values.legalName,
    personKind: values.personKind,
    legalSubjectKind: values.legalSubjectKind,
    legalFormCode: values.legalFormCode,
    ico: clean(values.ico),
    dic: clean(values.dic),
    businessActivityCodes: values.businessActivityCodes,
    ...(hasAddress
      ? {
          address: {
            street: clean(values.street),
            houseNumber: clean(values.houseNumber),
            orientationNumber: clean(values.orientationNumber),
            city: clean(values.city),
            postalCode: clean(values.postalCode),
            region: clean(values.region),
            countryCode: clean(values.countryCode),
          },
        }
      : {}),

    dataBoxId: clean(values.dataBoxId),
    contactEmail: clean(values.contactEmail),
    contactPhone: clean(values.contactPhone),
    website: clean(values.website),
    taxOfficeCode: clean(values.taxOfficeCode),
    registryFileNumber: clean(values.registryFileNumber),
    ...(values.deliveryAddressLines.length > 0
      ? { deliveryAddressLines: values.deliveryAddressLines }
      : {}),
    ...(signerGiven && signerFamily
      ? {
          authorizedPerson: {
            givenName: signerGiven,
            familyName: signerFamily,
            position: clean(values.signerPosition),
          },
        }
      : {}),
    ...(values.ossScheme && clean(values.ossValidFrom)
      ? { oss: { scheme: values.ossScheme, validFrom: values.ossValidFrom! } }
      : {}),

    regimeCode: values.regimeCode,
    inPublicRegister: values.inPublicRegister,
    accountingSizeCode: values.accountingSizeCode,
    fxRatePolicy: values.fxRatePolicy,
    fiscalYearStartMonth: values.fiscalYearStartMonth,

    entityKind: values.entityKind,
    registeredAt: clean(values.registeredAt),
    periodStart: clean(values.periodStart),
    fiscalYear: values.fiscalYear ? Number(values.fiscalYear) : undefined,

    vatRegimeCode: values.vatRegimeCode,
    vatFilingPeriod:
      values.vatRegimeCode === "PAYER"
        ? (values.vatFilingPeriod ?? "MONTHLY")
        : undefined,
  }
}
