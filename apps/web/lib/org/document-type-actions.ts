"use server"

import { revalidatePath } from "next/cache"

import { withOrganization } from "@workspace/db"
import {
  setDocumentTypeActive,
  setPrimaryDocumentType,
  upsertDocumentType,
} from "@workspace/accounting"
import type { DocumentCategory, DocumentKind } from "@workspace/accounting"

import { orgHref } from "./href"
import { resolveMembership } from "./resolve"
import { getRequestSession } from "./session"

/**
 * Server actions for the Typy dokladů page. Tenancy is derived server-side
 * (`userId` from the session, `organizationId` + `workspaceId` from
 * `resolveMembership`, so only an org the caller belongs to resolves); every write
 * runs under `withOrganization`, where the FORCE-RLS policy is the real boundary.
 * The domain layer (`@workspace/accounting`) owns the invariants — Druh-per-category,
 * DOCUMENT-only default série, exclusive primary — so these actions just forward and
 * surface a rejection. `slug` is a routing key, never a tenant id.
 *
 * Authorization: any active org member may edit doklad-type config — deliberately
 * un-role-gated, matching the sibling `updatePeriodZkratka` / číselné-řady config
 * writes. A future org-config role policy, if introduced, is a cross-cutting change
 * applied to all of these together, not a one-off here.
 */

const ROUTE = "accounting/document-types"
const CODE_MAX = 32
const NAME_MAX = 120

type ActionResult = { ok: boolean; error?: string }

async function tenancy(slug: string) {
  const session = await getRequestSession()
  const userId = session?.user?.id
  if (!userId) return null
  const membership = await resolveMembership({ slug, userId })
  if (!membership) return null
  return { userId, ...membership }
}

export interface SaveDocumentTypeInput {
  slug: string
  category: DocumentCategory
  code: string
  name: string
  kind?: DocumentKind | null
  defaultSeriesId?: string | null
  defaultAccount?: string | null
  postingPrescription?: string | null
  costCentre?: string | null
  activity?: string | null
  bankAccount?: string | null
  paymentForm?: string | null
  dueDays?: number | null
  vatCountry?: string | null
  khSection?: string | null
  description?: string | null
  validFromYear?: number | null
  validToYear?: number | null
}

/** Create or edit a doklad type (upsert keyed on org+category+Zkratka). */
export async function saveDocumentType(
  input: SaveDocumentTypeInput,
): Promise<ActionResult> {
  const code = input.code.trim()
  const name = input.name.trim()
  if (!code || code.length > CODE_MAX) return { ok: false, error: "code" }
  if (!name || name.length > NAME_MAX) return { ok: false, error: "name" }

  const t = await tenancy(input.slug)
  if (!t) return { ok: false, error: "auth" }

  try {
    await withOrganization(t.organizationId, t.userId, (db) =>
      upsertDocumentType(
        db,
        { organizationId: t.organizationId, workspaceId: t.workspaceId },
        {
          category: input.category,
          code,
          name,
          kind: input.kind ?? null,
          defaultSeriesId: input.defaultSeriesId ?? null,
          defaultAccount: input.defaultAccount ?? null,
          postingPrescription: input.postingPrescription ?? null,
          costCentre: input.costCentre ?? null,
          activity: input.activity ?? null,
          bankAccount: input.bankAccount ?? null,
          paymentForm: input.paymentForm ?? null,
          dueDays: input.dueDays ?? null,
          vatCountry: input.vatCountry ?? null,
          khSection: input.khSection ?? null,
          description: input.description ?? null,
          validFromYear: input.validFromYear ?? null,
          validToYear: input.validToYear ?? null,
        },
      ),
    )
  } catch {
    // Domain-invariant rejection (bad Druh, non-DOCUMENT série) → soft failure.
    return { ok: false, error: "invalid" }
  }

  revalidatePath(orgHref(input.slug, ROUTE))
  return { ok: true }
}

/** Make one type the primary of its category (atomic, exactly one primary). */
export async function setPrimaryType(input: {
  slug: string
  id: string
  category: DocumentCategory
}): Promise<ActionResult> {
  const t = await tenancy(input.slug)
  if (!t) return { ok: false, error: "auth" }
  try {
    await withOrganization(t.organizationId, t.userId, (db) =>
      setPrimaryDocumentType(
        db,
        { organizationId: t.organizationId, workspaceId: t.workspaceId },
        { id: input.id, category: input.category },
      ),
    )
  } catch {
    return { ok: false, error: "invalid" }
  }
  revalidatePath(orgHref(input.slug, ROUTE))
  return { ok: true }
}

/** Archive / restore a type (archiving also demotes it from primary). */
export async function setTypeActive(input: {
  slug: string
  id: string
  isActive: boolean
}): Promise<ActionResult> {
  const t = await tenancy(input.slug)
  if (!t) return { ok: false, error: "auth" }
  try {
    await withOrganization(t.organizationId, t.userId, (db) =>
      setDocumentTypeActive(
        db,
        { organizationId: t.organizationId, workspaceId: t.workspaceId },
        { id: input.id, isActive: input.isActive },
      ),
    )
  } catch {
    return { ok: false, error: "invalid" }
  }
  revalidatePath(orgHref(input.slug, ROUTE))
  return { ok: true }
}
