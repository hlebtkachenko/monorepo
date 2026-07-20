import "server-only"

import { withOrgReadonly } from "@workspace/db"
import {
  DOCUMENT_CATEGORIES,
  documentKindsFor,
  listDocumentSeries,
  listDocumentTypes,
} from "@workspace/accounting"
import type {
  DocumentCategory,
  DocumentKind,
  DocumentSeriesRow,
  DocumentTypeRow,
} from "@workspace/accounting"

/**
 * App-edge reads for the Typy dokladů page. Runs the domain reads under
 * `withOrgReadonly` (org FORCE-RLS + READ ONLY) and projects the snake_case
 * domain rows into the camelCase view models the client Table + Inspector consume.
 * The 9 config categories are the page's view tabs; the séries feed the Inspector's
 * "Dokladová řada" picker. Pure config data — not period-scoped.
 */

/** The 9 config categories, re-exported so the page/view need one import. */
export { DOCUMENT_CATEGORIES }
export type { DocumentCategory, DocumentKind }

/**
 * The valid Druh codes per category, resolved server-side (documentKindsFor lives
 * in @workspace/accounting, which pulls db code and can't cross into a client
 * component). The page passes this map to the Inspector's Druh picker, which
 * localizes the codes. A category with no defined kinds maps to an empty array.
 */
export function documentKindsByCategory(): Record<
  DocumentCategory,
  DocumentKind[]
> {
  return Object.fromEntries(
    DOCUMENT_CATEGORIES.map((c) => [c, [...documentKindsFor(c)]]),
  ) as Record<DocumentCategory, DocumentKind[]>
}

/** One Typ dokladu as the UI consumes it (camelCase, localizable enum codes). */
export interface DocumentTypeView {
  id: string
  category: DocumentCategory
  code: string
  name: string
  kind: DocumentTypeRow["kind"]
  defaultSeriesId: string | null
  defaultSeriesCode: string | null
  isPrimary: boolean
  isActive: boolean
  defaultAccount: string | null
  postingPrescription: string | null
  costCentre: string | null
  activity: string | null
  bankAccount: string | null
  paymentForm: string | null
  dueDays: number | null
  vatCountry: string | null
  khSection: string | null
  description: string | null
  validFromYear: number | null
  validToYear: number | null
}

/** One Dokladová řada option for the Inspector's default-série picker. */
export interface DocumentSeriesOption {
  id: string
  code: string
  category: DocumentCategory | null
  name: string | null
}

function toDocumentTypeView(r: DocumentTypeRow): DocumentTypeView {
  return {
    id: r.id,
    category: r.category,
    code: r.code,
    name: r.name,
    kind: r.kind,
    defaultSeriesId: r.default_series_id,
    defaultSeriesCode: r.default_series_code,
    isPrimary: r.is_primary,
    isActive: r.is_active,
    defaultAccount: r.default_account,
    postingPrescription: r.posting_prescription,
    costCentre: r.cost_centre,
    activity: r.activity,
    bankAccount: r.bank_account,
    paymentForm: r.payment_form,
    dueDays: r.due_days,
    vatCountry: r.vat_country,
    khSection: r.kh_section,
    description: r.description,
    validFromYear: r.valid_from_year,
    validToYear: r.valid_to_year,
  }
}

function toDocumentSeriesOption(r: DocumentSeriesRow): DocumentSeriesOption {
  return { id: r.id, code: r.code, category: r.category, name: r.name }
}

/** All the org's doklad types (every category; the page filters by tab). */
export async function getDocumentTypes(
  organizationId: string,
  userId: string,
): Promise<DocumentTypeView[]> {
  const rows = await withOrgReadonly(organizationId, userId, (db) =>
    listDocumentTypes(db, {}),
  )
  return rows.map(toDocumentTypeView)
}

/** Every DOCUMENT série (the Inspector's default-série options, grouped by category client-side). */
export async function getDocumentSeriesOptions(
  organizationId: string,
  userId: string,
): Promise<DocumentSeriesOption[]> {
  const rows = await withOrgReadonly(organizationId, userId, (db) =>
    listDocumentSeries(db, {}),
  )
  return rows.map(toDocumentSeriesOption)
}
