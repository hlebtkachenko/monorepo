"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import {
  addAssetEvent,
  assetForScope,
  createAsset,
  disposeAsset,
  updateAsset,
} from "@/lib/data/assets"
import { requireOwner, requireScope } from "@/lib/data/scope"

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

export async function createAssetAction(
  _previous: MajetekActionState,
  formData: FormData,
): Promise<MajetekActionState> {
  const orgSlug = formString(formData, "orgSlug")
  const owner = requireOwner(await requireScope(orgSlug))

  const name = formString(formData, "name")
  const category = formAssetCategory(formData, "category")
  const acquisitionCost = formMoney(formData, "acquisitionCost")
  const accumulatedDepreciation = formOptionalMoney(
    formData,
    "accumulatedDepreciation",
  )
  const depreciationAsOf = formDate(formData, "depreciationAsOf")

  if (name.length === 0 || !category || acquisitionCost === null) {
    return { status: "error", error: "majetek.errorInvalidInput" }
  }
  if (accumulatedDepreciation === undefined) {
    return { status: "error", error: "majetek.errorInvalidInput" }
  }

  const created = await createAsset(owner, {
    name,
    category,
    isMinor: formChecked(formData, "isMinor"),
    acquisitionCost,
    acquiredOn: formDate(formData, "acquiredOn"),
    placedInServiceOn: formDate(formData, "placedInServiceOn"),
    accumulatedDepreciation,
    // Both-or-neither at the database (asset_depreciation_stamp_coherence) —
    // an oprávky figure with no stated as-of date is dropped rather than
    // silently paired with an empty one.
    depreciationAsOf:
      accumulatedDepreciation === null ? null : depreciationAsOf,
    taxResidualValue: formOptionalMoney(formData, "taxResidualValue") ?? null,
    siteRef: formOptionalString(formData, "siteRef"),
    noteClient: formOptionalString(formData, "noteClient"),
  })

  revalidatePath(`/${orgSlug}/majetek`)
  redirect(`/${orgSlug}/majetek/${created.id}`)
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

  const name = formString(formData, "name")
  const category = formAssetCategory(formData, "category")
  const acquisitionCost = formMoney(formData, "acquisitionCost")
  const accumulatedDepreciation = formOptionalMoney(
    formData,
    "accumulatedDepreciation",
  )
  const depreciationAsOf = formDate(formData, "depreciationAsOf")

  if (name.length === 0 || !category || acquisitionCost === null) {
    return { status: "error", error: "majetek.errorInvalidInput" }
  }
  if (accumulatedDepreciation === undefined) {
    return { status: "error", error: "majetek.errorInvalidInput" }
  }

  const updated = await updateAsset(owner, assetId, {
    name,
    category,
    isMinor: formChecked(formData, "isMinor"),
    acquisitionCost,
    acquiredOn: formDate(formData, "acquiredOn"),
    placedInServiceOn: formDate(formData, "placedInServiceOn"),
    accumulatedDepreciation,
    depreciationAsOf:
      accumulatedDepreciation === null ? null : depreciationAsOf,
    taxResidualValue: formOptionalMoney(formData, "taxResidualValue") ?? null,
    siteRef: formOptionalString(formData, "siteRef"),
    noteClient: formOptionalString(formData, "noteClient"),
  })

  if (!updated) return { status: "error", error: "majetek.errorNotFound" }

  revalidatePath(`/${orgSlug}/majetek`)
  revalidatePath(`/${orgSlug}/majetek/${assetId}`)
  return { status: "ok", message: "majetek.okUpdated" }
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
