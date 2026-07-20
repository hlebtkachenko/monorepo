"use server"

import { revalidatePath } from "next/cache"

import { withOrganization } from "@workspace/db"
import {
  deleteNumberSeriesPeriod,
  upsertDocumentSeries,
  upsertNumberSeriesPeriod,
} from "@workspace/accounting"
import type { DocumentCategory } from "@workspace/accounting"

import { orgHref } from "./href"
import { resolveMembership } from "./resolve"
import { getRequestSession } from "./session"

/**
 * Server actions for the Dokladové řady page. Tenancy is derived server-side
 * (`userId` from the session, `organizationId` + `workspaceId` from
 * `resolveMembership`, so only an org the caller belongs to resolves); every write
 * runs under `withOrganization`, where the FORCE-RLS policy is the real boundary.
 * The domain layer (`@workspace/accounting`) owns the invariants — a per-období row
 * edit never touches the gapless counter, and a row that has issued numbers cannot
 * be deleted — so these actions just forward and surface a rejection. `slug` is a
 * routing key, never a tenant id.
 *
 * Authorization: any active org member may edit číselné řady config — deliberately
 * un-role-gated, matching the sibling `updatePeriodZkratka` / document-type config
 * writes. A future org-config role policy, if introduced, is a cross-cutting change
 * applied to all of these together, not a one-off here.
 */

const ROUTE = "accounting/document-series"
const CODE_MAX = 32
const NAME_MAX = 120
const NUMBER_LENGTH_MAX = 18

type ActionResult = { ok: boolean; error?: string }

async function tenancy(slug: string) {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return null
  const membership = await resolveMembership({ slug, userId })
  if (!membership) return null
  return { userId, ...membership }
}

export interface SaveSeriesInput {
  slug: string
  category: DocumentCategory
  code: string
  name?: string | null
  note?: string | null
  description?: string | null
  validFromYear?: number | null
  validToYear?: number | null
}

/** Edit a Dokladová řada's Identity + Platnost (upsert keyed on org+DOCUMENT+Zkratka).
 *  Never touches `pattern` or the gapless counter — those are owned by the domain. */
export async function saveSeries(
  input: SaveSeriesInput,
): Promise<ActionResult> {
  const code = input.code.trim()
  if (!code || code.length > CODE_MAX) return { ok: false, error: "code" }
  const name = input.name?.trim() || null
  if (name && name.length > NAME_MAX) return { ok: false, error: "name" }

  const t = await tenancy(input.slug)
  if (!t) return { ok: false, error: "auth" }

  try {
    await withOrganization(t.organizationId, t.userId, (db) =>
      upsertDocumentSeries(
        db,
        { organizationId: t.organizationId, workspaceId: t.workspaceId },
        {
          category: input.category,
          code,
          name,
          note: input.note?.trim() || null,
          description: input.description?.trim() || null,
          validFromYear: input.validFromYear ?? null,
          validToYear: input.validToYear ?? null,
        },
      ),
    )
  } catch {
    return { ok: false, error: "invalid" }
  }

  revalidatePath(orgHref(input.slug, ROUTE))
  return { ok: true }
}

export interface SavePeriodRowInput {
  slug: string
  numberSeriesId: string
  periodId: string
  numberLength: number
  prefix?: string | null
  postfix?: string | null
}

/**
 * Create a per-účetní-období numbering row, or edit only its format
 * (length / prefix / postfix). Never passes `currentNumber`, so a fresh row seeds
 * at 1 and an existing row's live counter is left untouched.
 */
export async function savePeriodRow(
  input: SavePeriodRowInput,
): Promise<ActionResult> {
  const numberLength = Number(input.numberLength)
  if (
    !Number.isInteger(numberLength) ||
    numberLength < 1 ||
    numberLength > NUMBER_LENGTH_MAX
  ) {
    return { ok: false, error: "length" }
  }

  const t = await tenancy(input.slug)
  if (!t) return { ok: false, error: "auth" }

  try {
    await withOrganization(t.organizationId, t.userId, (db) =>
      upsertNumberSeriesPeriod(
        db,
        { organizationId: t.organizationId, workspaceId: t.workspaceId },
        {
          numberSeriesId: input.numberSeriesId,
          periodId: input.periodId,
          numberLength,
          prefix: input.prefix?.trim() ?? "",
          postfix: input.postfix?.trim() ?? "",
        },
      ),
    )
  } catch {
    return { ok: false, error: "invalid" }
  }

  revalidatePath(orgHref(input.slug, ROUTE))
  return { ok: true }
}

/** Delete a per-období numbering row. The domain refuses a row that has already
 *  issued numbers (gapless counter) — surfaced as a soft `inuse` failure. */
export async function deletePeriodRow(input: {
  slug: string
  id: string
}): Promise<ActionResult> {
  const t = await tenancy(input.slug)
  if (!t) return { ok: false, error: "auth" }

  try {
    await withOrganization(t.organizationId, t.userId, (db) =>
      deleteNumberSeriesPeriod(
        db,
        { organizationId: t.organizationId, workspaceId: t.workspaceId },
        { id: input.id },
      ),
    )
  } catch {
    return { ok: false, error: "inuse" }
  }

  revalidatePath(orgHref(input.slug, ROUTE))
  return { ok: true }
}
