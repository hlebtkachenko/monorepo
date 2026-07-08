"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@workspace/auth/server"

import {
  addAuthorizedPerson,
  addOssRegistration,
  backfillOrgNumberSeries,
  changeVatStatus,
  closeOssRegistration,
  removeAuthorizedPerson,
  resolveOrgContext,
  rollForwardOrgPeriod,
  saveTaxRepresentative,
  updateOrgConfig,
  type OrgContext,
  type TaxRepresentativeInput,
} from "./_lib/settings-data"
import { dataBoxError, type OrgSettingsUpdate } from "./_lib/org-update"
import type { VatFilingPeriod, VatRegime } from "@workspace/accounting"

export interface SettingsResult {
  ok: boolean
  errorKey?: string
}

async function authorize(
  slug: string,
): Promise<{ userId: string; ctx: OrgContext } | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  const userId = session?.user?.id
  if (!userId) return null
  const ctx = await resolveOrgContext(slug, userId)
  if (!ctx || (ctx.role !== "owner" && ctx.role !== "admin")) return null
  return { userId, ctx }
}

export async function updateOrgSettingsAction(
  slug: string,
  values: OrgSettingsUpdate,
): Promise<SettingsResult> {
  const auth = await authorize(slug)
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
  const auth = await authorize(slug)
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
  const auth = await authorize(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  try {
    await removeAuthorizedPerson(auth.ctx, auth.userId, personId)
  } catch {
    return { ok: false, errorKey: "removePersonFailed" }
  }
  revalidatePath(`/${slug}/settings/identity`)
  return { ok: true }
}

export async function rollForwardAction(
  slug: string,
  periodId: string,
): Promise<SettingsResult> {
  const auth = await authorize(slug)
  if (!auth) return { ok: false, errorKey: "forbidden" }
  try {
    await rollForwardOrgPeriod(auth.ctx, auth.userId, periodId)
  } catch {
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
  const auth = await authorize(slug)
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
  const auth = await authorize(slug)
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

export async function addOssRegistrationAction(
  slug: string,
  input: { scheme: string; validFrom: string },
): Promise<SettingsResult> {
  const auth = await authorize(slug)
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
  const auth = await authorize(slug)
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
  const auth = await authorize(slug)
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
