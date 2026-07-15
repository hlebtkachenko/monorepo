"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  addAuthorizedPerson,
  addOssRegistration,
  backfillOrgNumberSeries,
  changeTaxProfile,
  changeVatStatus,
  closeOssRegistration,
  loadPeriodCloseReadiness,
  removeAuthorizedPerson,
  rollForwardOrgPeriod,
  saveTaxRepresentative,
  updateOrgConfig,
  type PayrollProfileInput,
  type TaxRepresentativeInput,
} from "./_lib/settings-data"
import { authorizeOrgAdmin } from "../_lib/org-authz"
import { dataBoxError, type OrgSettingsUpdate } from "./_lib/org-update"
import {
  PeriodCloseBlockedError,
  type PeriodCloseReadiness,
  type VatFilingPeriod,
  type VatRegime,
} from "@workspace/accounting"

export interface SettingsResult {
  ok: boolean
  errorKey?: string
}

export type CloseReadinessResult =
  | { ok: true; readiness: PeriodCloseReadiness }
  | { ok: false; errorKey: "forbidden" | "readinessFailed" }

export type RollForwardResult =
  | { ok: true }
  | {
      ok: false
      errorKey:
        | "forbidden"
        | "periodNotFound"
        | "periodClosed"
        | "closeBlocked"
        | "rollForwardFailed"
      readiness?: PeriodCloseReadiness
    }

const PayrollProfileSchema = z
  .object({
    hasStandardEmployment: z.boolean(),
    hasDpp: z.boolean(),
    hasDpc: z.boolean(),
    socialInsuranceParticipation: z.boolean(),
    healthInsuranceParticipation: z.boolean(),
    payrollTaxAdvanceDue: z.boolean(),
    specialRateWithholdingDue: z.boolean(),
    validFrom: z.iso.date(),
  })
  .strict()

export async function updateOrgSettingsAction(
  slug: string,
  values: OrgSettingsUpdate,
): Promise<SettingsResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  // Boundary validation for the one format-constrained column (mirrors the
  // DB CHECK); the rest are free text cleared to NULL when blank.
  if (values.dataBoxId !== undefined && dataBoxError(values.dataBoxId)) {
    return { ok: false, errorKey: "dataBoxFormat" }
  }
  try {
    await updateOrgConfig(auth.ctx, auth.userId, values)
  } catch {
    return { ok: false, errorKey: "updateFailed" }
  }
  revalidatePath(`/${slug}/settings`)
  return { ok: true }
}

export async function addAuthorizedPersonAction(
  slug: string,
  input: {
    givenName: string
    familyName: string
    position: string | null
    isPrimary: boolean
  },
): Promise<SettingsResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  if (input.givenName.trim() === "" || input.familyName.trim() === "") {
    return { ok: false, errorKey: "nameRequired" }
  }
  try {
    await addAuthorizedPerson(auth.ctx, auth.userId, {
      givenName: input.givenName.trim(),
      familyName: input.familyName.trim(),
      position: input.position?.trim() || null,
      isPrimary: input.isPrimary,
    })
  } catch {
    return { ok: false, errorKey: "addPersonFailed" }
  }
  revalidatePath(`/${slug}/settings/identity`)
  return { ok: true }
}

export async function removeAuthorizedPersonAction(
  slug: string,
  personId: string,
): Promise<SettingsResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  try {
    await removeAuthorizedPerson(auth.ctx, auth.userId, personId)
  } catch {
    return { ok: false, errorKey: "removePersonFailed" }
  }
  revalidatePath(`/${slug}/settings/identity`)
  return { ok: true }
}

export async function loadPeriodCloseReadinessAction(
  slug: string,
  periodId: string,
): Promise<CloseReadinessResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  try {
    const readiness = await loadPeriodCloseReadiness(
      auth.ctx,
      auth.userId,
      periodId,
    )
    return { ok: true, readiness }
  } catch {
    return { ok: false, errorKey: "readinessFailed" }
  }
}

export async function rollForwardAction(
  slug: string,
  periodId: string,
): Promise<RollForwardResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  try {
    await rollForwardOrgPeriod(auth.ctx, auth.userId, periodId)
  } catch (error) {
    if (error instanceof PeriodCloseBlockedError) {
      const exists = error.readiness.checks.find(
        (check) => check.code === "PERIOD_EXISTS",
      )
      const open = error.readiness.checks.find(
        (check) => check.code === "PERIOD_OPEN",
      )
      const errorKey =
        exists?.status !== "PASS"
          ? "periodNotFound"
          : open?.status !== "PASS"
            ? "periodClosed"
            : "closeBlocked"
      return { ok: false, errorKey, readiness: error.readiness }
    }
    return { ok: false, errorKey: "rollForwardFailed" }
  }
  revalidatePath(`/${slug}/settings/periods`)
  return { ok: true }
}

/**
 * Restore any missing default number series. Conservative by design: only
 * adds series the org doesn't already have — never edits or removes an
 * existing series (gapless numbering is legally sensitive).
 */
export async function backfillNumberSeriesAction(
  slug: string,
): Promise<SettingsResult & { added?: number }> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  let added: number
  try {
    added = await backfillOrgNumberSeries(auth.ctx, auth.userId)
  } catch {
    return { ok: false, errorKey: "backfillFailed" }
  }
  revalidatePath(`/${slug}/settings/number-series`)
  return { ok: true, added }
}

export async function changeVatStatusAction(
  slug: string,
  input: {
    vatRegimeCode: VatRegime
    validFrom: string
    filingPeriod: VatFilingPeriod | null
  },
): Promise<SettingsResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  if (input.validFrom.trim() === "") {
    return { ok: false, errorKey: "validFromRequired" }
  }
  try {
    // filing_period applies to PAYER only (§99); drop it for the other regimes.
    const filingPeriod =
      input.vatRegimeCode === "PAYER" ? input.filingPeriod : null
    await changeVatStatus(auth.ctx, auth.userId, {
      vatRegimeCode: input.vatRegimeCode,
      validFrom: input.validFrom,
      filingPeriod,
    })
  } catch {
    return { ok: false, errorKey: "changeVatFailed" }
  }
  revalidatePath(`/${slug}/settings/vat-status`)
  return { ok: true }
}

export async function changeTaxProfileAction(
  slug: string,
  input: PayrollProfileInput,
): Promise<SettingsResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  const parsed = PayrollProfileSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errorKey: "invalidInput" }
  try {
    await changeTaxProfile(auth.ctx, auth.userId, parsed.data)
  } catch {
    return { ok: false, errorKey: "changeTaxProfileFailed" }
  }
  revalidatePath(`/${slug}/settings/tax-profile`)
  return { ok: true }
}

export async function addOssRegistrationAction(
  slug: string,
  input: { scheme: string; validFrom: string },
): Promise<SettingsResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  if (input.scheme !== "UNION" && input.scheme !== "IMPORT") {
    return { ok: false, errorKey: "invalidScheme" }
  }
  if (input.validFrom.trim() === "") {
    return { ok: false, errorKey: "validFromRequired" }
  }
  try {
    await addOssRegistration(auth.ctx, auth.userId, input)
  } catch {
    return { ok: false, errorKey: "addOssFailed" }
  }
  revalidatePath(`/${slug}/settings/vat-status`)
  return { ok: true }
}

export async function closeOssRegistrationAction(
  slug: string,
  input: { id: string; validTo: string },
): Promise<SettingsResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  if (input.validTo.trim() === "") {
    return { ok: false, errorKey: "validToRequired" }
  }
  try {
    await closeOssRegistration(auth.ctx, auth.userId, input)
  } catch {
    return { ok: false, errorKey: "closeOssFailed" }
  }
  revalidatePath(`/${slug}/settings/vat-status`)
  return { ok: true }
}

export async function saveTaxRepresentativeAction(
  slug: string,
  input: TaxRepresentativeInput,
): Promise<SettingsResult> {
  const auth = await authorizeOrgAdmin(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  try {
    await saveTaxRepresentative(auth.ctx, auth.userId, {
      representativeType: input.representativeType?.trim() || null,
      legalName: input.legalName?.trim() || null,
      givenName: input.givenName?.trim() || null,
      familyName: input.familyName?.trim() || null,
      ico: input.ico?.trim() || null,
      dic: input.dic?.trim() || null,
      advisorRegistrationNumber:
        input.advisorRegistrationNumber?.trim() || null,
    })
  } catch {
    return { ok: false, errorKey: "saveRepresentativeFailed" }
  }
  revalidatePath(`/${slug}/settings/vat-status`)
  return { ok: true }
}
