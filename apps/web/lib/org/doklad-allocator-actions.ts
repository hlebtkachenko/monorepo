"use server"

import { withOrganization } from "@workspace/db"
import { allocateForDocumentType } from "@workspace/accounting"

import { getActivePeriod } from "./period"
import { resolveMembership } from "./resolve"
import { getRequestSession } from "./session"

/**
 * Server action for the Debug → Doklad allocator page. Given a doklad TYPE, it
 * runs the typ→řada→číslo chain: resolves the type's default číselná řada and
 * burns its next gapless Označení in the org's active účetní období. Tenancy is
 * derived server-side (session `userId`, `organizationId`/`workspaceId` from
 * `resolveMembership`); the allocation runs under `withOrganization` (FORCE RLS).
 * This really advances the counter — it is a dev/debug tool behind the Debug gate.
 */

type AllocateResult =
  | {
      ok: true
      seriesCode: string
      designation: string
      sequenceNumber: number
    }
  | { ok: false; error: string }

async function tenancy(slug: string) {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return null
  const membership = await resolveMembership({ slug, userId })
  if (!membership) return null
  return { userId, ...membership }
}

export async function allocateDokladNumber(input: {
  slug: string
  typeId: string
}): Promise<AllocateResult> {
  const t = await tenancy(input.slug)
  if (!t) return { ok: false, error: "auth" }

  // Today's date feeds the série pattern's date tokens (e.g. {YYYY}).
  const isoDate = new Date().toISOString().slice(0, 10)
  // Advance the counter of the série's active-period row when one exists; the
  // domain falls back to the flat counter for a série with no per-období rows.
  const { active } = await getActivePeriod(t.organizationId, t.userId)

  try {
    const r = await withOrganization(t.organizationId, t.userId, (db) =>
      allocateForDocumentType(
        db,
        { organizationId: t.organizationId, workspaceId: t.workspaceId },
        { documentTypeId: input.typeId, isoDate, periodId: active?.id },
      ),
    )
    return {
      ok: true,
      seriesCode: r.seriesCode,
      designation: r.designation,
      sequenceNumber: r.sequenceNumber,
    }
  } catch {
    return { ok: false, error: "allocate" }
  }
}
