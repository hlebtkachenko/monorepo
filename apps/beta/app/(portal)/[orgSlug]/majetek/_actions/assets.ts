"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import {
  addAssetEvent,
  assetForScope,
  createAsset,
  disposeAsset,
  updateAsset,
  type AssetWriteInput,
} from "@/lib/data/assets"
import { requireOwner, requireScope } from "@/lib/data/scope"
import { isCheckViolation } from "@/lib/pg-error"

import {
  formAssetCategory,
  formAssetEventKind,
  formChecked,
  formDate,
  formMoney,
  formOptionalMoney,
  formOptionalString,
  formString,
  isUuid,
} from "./input"
import type { MajetekActionState } from "./state"

/**
 * Majetek writes — owner-only (spec §3.3). `requireOwner(await
 * requireScope(orgSlug))` IS THE FIRST STATEMENT of every action below, the
 * same pattern `app/(portal)/[orgSlug]/pro-ucetni/_actions/documents.ts` (PR
 * 14) established: `lib/data/assets.ts`'s writes take an `OwnerScope`, so a
 * non-owner is refused before any form field is even read, not after.
 *
 * `requireScope` is called fresh in every action rather than reused from a
 * page's memoized read: a Server Action is its own request, and React's
 * `cache()` scoping in `_lib/org-scope.ts` only covers renders of the SAME
 * request.
 *
 * `orgSlug` and, where relevant, `assetId` travel as hidden form fields — the
 * fixed `(previousState, formData) => state` shape `useActionState` requires
 * leaves no other place to carry them.
 */

const INVALID: MajetekActionState = {
  status: "error",
  error: "majetek.errorInvalidInput",
}

/**
 * Any `asset_*` CHECK this file's own validation does not pre-empt
 * (`asset_minor_has_no_depreciation`, a race, a future column) becomes this
 * Czech sentence instead of the raw constraint reaching the client as a 500 —
 * the same `guarded` idiom `pro-ucetni/_actions/partners.ts` and
 * `finance/uvery/_actions/loans.ts` use.
 */
async function guarded(
  write: () => Promise<MajetekActionState>,
): Promise<MajetekActionState> {
  try {
    return await write()
  } catch (error) {
    if (isCheckViolation(error)) {
      return { status: "error", error: "majetek.errorRejected" }
    }
    throw error
  }
}

/**
 * The field set `createAssetAction` and `updateAssetAction` share, or the
 * named field error when it is unusable.
 *
 * THE STAMP PAIR IS NOT SYMMETRIC. `asset_depreciation_stamp_coherence` is
 * both-or-neither at the database, but only one direction is refused here: a
 * STATED oprávky figure with no as-of date is the office's own typed amount,
 * and silently dropping it would lose data the office just entered, so it is
 * refused with a named field error instead — the same "value stated ⇒ date
 * required" rule `publishSaldokontoSchema` in `lib/agent/schemas.ts` applies
 * to a stated payable and its splatnost. An orphan date with no figure is
 * still noise (nothing to check it against) and is still dropped silently.
 */
function readAssetForm(
  formData: FormData,
):
  | { ok: true; value: AssetWriteInput }
  | { ok: false; state: MajetekActionState } {
  const name = formString(formData, "name")
  const category = formAssetCategory(formData, "category")
  const acquisitionCost = formMoney(formData, "acquisitionCost")
  if (name.length === 0 || !category || acquisitionCost === null) {
    return { ok: false, state: INVALID }
  }

  const accumulatedDepreciation = formOptionalMoney(
    formData,
    "accumulatedDepreciation",
  )
  if (accumulatedDepreciation === undefined) {
    return { ok: false, state: INVALID }
  }

  const depreciationAsOf = formDate(formData, "depreciationAsOf")
  // `asset_depreciation_stamp_coherence`: a stated oprávky figure with no
  // as-of date would otherwise reach the database and crash on the CHECK.
  // Named here, before either that or a silent drop of the office's own
  // figure can happen.
  if (accumulatedDepreciation !== null && depreciationAsOf === null) {
    return {
      ok: false,
      state: {
        status: "error",
        error: "majetek.errorDepreciationAsOfRequired",
      },
    }
  }

  return {
    ok: true,
    value: {
      name,
      category,
      isMinor: formChecked(formData, "isMinor"),
      acquisitionCost,
      acquiredOn: formDate(formData, "acquiredOn"),
      placedInServiceOn: formDate(formData, "placedInServiceOn"),
      accumulatedDepreciation,
      // The orphan-date direction is still noise and is still dropped — the
      // stated-value direction is refused above, never silently dropped.
      depreciationAsOf:
        accumulatedDepreciation === null ? null : depreciationAsOf,
      taxResidualValue: formOptionalMoney(formData, "taxResidualValue") ?? null,
      siteRef: formOptionalString(formData, "siteRef"),
      noteClient: formOptionalString(formData, "noteClient"),
    },
  }
}

export async function createAssetAction(
  _previous: MajetekActionState,
  formData: FormData,
): Promise<MajetekActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const fields = readAssetForm(formData)
  if (!fields.ok) return fields.state

  return guarded(async () => {
    const created = await createAsset(owner, fields.value)

    revalidatePath(`/${orgSlug}/majetek`)
    redirect(`/${orgSlug}/majetek/${created.id}`)
  })
}

export async function updateAssetAction(
  _previous: MajetekActionState,
  formData: FormData,
): Promise<MajetekActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const assetId = formString(formData, "assetId")
  if (!isUuid(assetId)) {
    return { status: "error", error: "majetek.errorNotFound" }
  }

  const fields = readAssetForm(formData)
  if (!fields.ok) return fields.state

  return guarded(async () => {
    const updated = await updateAsset(owner, assetId, fields.value)
    if (!updated) return { status: "error", error: "majetek.errorNotFound" }

    revalidatePath(`/${orgSlug}/majetek`)
    revalidatePath(`/${orgSlug}/majetek/${assetId}`)
    return { status: "ok", message: "majetek.okUpdated" }
  })
}

export async function disposeAssetAction(
  _previous: MajetekActionState,
  formData: FormData,
): Promise<MajetekActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const assetId = formString(formData, "assetId")
  if (!isUuid(assetId)) {
    return { status: "error", error: "majetek.errorNotFound" }
  }

  const disposedOn = formDate(formData, "disposedOn")
  if (!disposedOn) {
    return { status: "error", error: "majetek.errorInvalidInput" }
  }

  const disposed = await disposeAsset(owner, assetId, disposedOn)
  if (!disposed) return { status: "error", error: "majetek.errorNotFound" }

  revalidatePath(`/${orgSlug}/majetek`)
  revalidatePath(`/${orgSlug}/majetek/${assetId}`)
  return { status: "ok", message: "majetek.okDisposed" }
}

export async function addAssetEventAction(
  _previous: MajetekActionState,
  formData: FormData,
): Promise<MajetekActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const assetId = formString(formData, "assetId")
  if (!isUuid(assetId)) {
    return { status: "error", error: "majetek.errorNotFound" }
  }

  // Checked up front, cleanly, rather than left to the composite
  // `asset_event_asset_fk` — a tampered id from another book would otherwise
  // surface as a raw constraint throw instead of the ordinary "not found" this
  // form can render.
  const target = await assetForScope(owner, assetId)
  if (!target) return { status: "error", error: "majetek.errorNotFound" }

  const kind = formAssetEventKind(formData, "kind")
  const eventDate = formDate(formData, "eventDate")
  const amount = formOptionalMoney(formData, "amount")
  if (!kind || !eventDate || amount === undefined) {
    return { status: "error", error: "majetek.errorInvalidInput" }
  }

  await addAssetEvent(owner, assetId, {
    kind,
    eventDate,
    amount,
    note: formOptionalString(formData, "note"),
  })

  revalidatePath(`/${orgSlug}/majetek/${assetId}`)
  return { status: "ok", message: "majetek.okEventAdded" }
}
