/**
 * Client projections — the column allowlists for everything that crosses from
 * the database into a rendered page or a client component.
 *
 * WHY THIS MODULE EXISTS. Beta has no RLS (plan Part 4): the outer wall is the
 * dedicated database, the inner wall is the scope seam in `scope.ts`. Neither
 * wall says anything about WHICH COLUMNS of a row a browser gets to see, and a
 * row read inside the right organization can still carry columns that belong to
 * the office alone. `app_user.is_staff` is the precondition for an owner
 * membership, `app_user.disabled_at` is the offboarding switch, and
 * `user_setup_token` is nothing but secrets. None of them has a client-side use.
 *
 * THE RULE. A DB row is never spread into a client-visible object. Every one of
 * these helpers is an explicit `pick`: the returned object literal names each
 * field, so a column added to a table later is invisible here until someone
 * deliberately adds it — the opposite of `{ ...row }`, which would ship it the
 * day it is created.
 *
 * This module is deliberately PURE — no `server-only`, no runtime import of the
 * Drizzle schema (the table imports are `import type`, erased at compile time).
 * A client component may therefore import these TYPES without dragging the
 * database layer into its bundle.
 */
import type {
  app_user,
  document,
  filing,
  organization,
  organization_membership,
  reporting_period,
  BetaFilingFamily,
  BetaFilingKind,
  BetaFilingStatus,
  BetaPeriodKind,
  BetaSetupTokenPurpose,
} from "@/db/schema"

type AppUserRow = typeof app_user.$inferSelect
type DocumentRow = typeof document.$inferSelect
type OrganizationRow = typeof organization.$inferSelect
type MembershipRow = typeof organization_membership.$inferSelect
type ReportingPeriodRow = typeof reporting_period.$inferSelect
type FilingRow = typeof filing.$inferSelect

/**
 * Columns that must never appear in a client-visible object, in any spelling.
 *
 * The comparison in `forbiddenClientKeys` is done on a normalized form
 * (lowercased, separators stripped), so `is_staff`, `isStaff` and `IsStaff` are
 * all the same name here: a projection cannot smuggle a forbidden column past
 * the check by renaming it to camelCase on the way out.
 */
export const CLIENT_FORBIDDEN_COLUMNS = Object.freeze([
  // app_user — office-internal identity state.
  "is_staff",
  "disabled_at",
  "email_verified",
  "two_factor_enabled",
  // user_setup_token — the link secret and its forensics.
  "token_hash",
  "issued_by_user_id",
  "issued_ip",
  "consumed_ip",
  "consumed_user_agent",
  "consumed_user_id",
  "revoked_at",
  "granted_role",
  // document — the office-internal layer and the storage identity.
  //
  // `internal_note` is the office's own note about a client's document
  // (spec §3.1), so it is office-only in the same way `is_staff` is.
  //
  // `storage_key` and `sha256` are not secrets in the "if leaked, game over"
  // sense — the key alone gets nobody bytes, because the route resolves the row
  // from a document id and the store refuses a key outside the caller's own
  // prefix. They are forbidden because SHIPPING THEM CREATES THE TEMPTATION: a
  // key in a client payload invites the next feature to accept one back, and
  // that route ("here is a key, give me the file") is the one shape of this API
  // that cannot be made safe. The client never learns that S3 exists.
  //
  // `visible_to_client` is the hidden-class flag itself. A row that reached a
  // client tier has already been filtered on it; echoing it would tell that
  // client the mechanism exists and invite a UI to branch on it.
  "internal_note",
  "storage_key",
  "sha256",
  "visible_to_client",
  // filing — the office's own working note about a client's tax affairs, which
  // has never been written to be read by that client. Spelled `note_internal`
  // rather than document's `internal_note`, so BOTH spellings are listed: the
  // normalizer above collapses separators and case, not word order.
  "note_internal",
])

const normalize = (key: string): string =>
  key.replace(/[_-]/g, "").toLowerCase()

const FORBIDDEN_NORMALIZED = new Set(CLIENT_FORBIDDEN_COLUMNS.map(normalize))

/**
 * Every forbidden column name reachable from `value`, recursively. Returns the
 * offending keys rather than a boolean so a failing test names the leak.
 */
export function forbiddenClientKeys(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || typeof value !== "object") return []
  if (Array.isArray(value)) {
    return value.flatMap((item) => forbiddenClientKeys(item, depth + 1))
  }
  const found: string[] = []
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_NORMALIZED.has(normalize(key))) found.push(key)
    found.push(...forbiddenClientKeys(nested, depth + 1))
  }
  return found
}

// ---------------------------------------------------------------------------
// Viewer — the signed-in identity itself
// ---------------------------------------------------------------------------

/**
 * The signed-in user as the browser is allowed to know them. This is also the
 * shape `getBetaSession()` returns, so the session object a page holds IS the
 * projection — there is no unprojected user row anywhere above the data layer.
 */
export type ViewerProfile = {
  userId: string
  email: string
  name: string
}

export function viewerProfile(
  row: Pick<AppUserRow, "id" | "email" | "name">,
): ViewerProfile {
  return { userId: row.id, email: row.email, name: row.name }
}

// ---------------------------------------------------------------------------
// Organization — the client book
// ---------------------------------------------------------------------------

/**
 * The organization as every org-scoped surface (header, switcher, dashboard)
 * needs it. Deliberately NOT the identity card: sídlo, bank details and the
 * ARES stamp are a separate, larger projection that lands with Nastavení ›
 * Společnost (PR 21) and is read by fewer pages.
 *
 * `archived_at` is absent by design. An archived organization never resolves a
 * scope at all (`requireScope`), so a page holding this object is by
 * construction looking at a live book and has no state to branch on.
 */
export type OrganizationSummary = {
  id: string
  slug: string
  legalName: string
  vatRegime: OrganizationRow["vat_regime"]
  vatRegisteredFrom: string | null
  isDemo: boolean
}

export function organizationSummary(
  row: Pick<
    OrganizationRow,
    | "id"
    | "slug"
    | "legal_name"
    | "vat_regime"
    | "vat_registered_from"
    | "is_demo"
  >,
): OrganizationSummary {
  return {
    id: row.id,
    slug: row.slug,
    legalName: row.legal_name,
    vatRegime: row.vat_regime,
    vatRegisteredFrom: row.vat_registered_from,
    isDemo: row.is_demo,
  }
}

// ---------------------------------------------------------------------------
// Membership summary — the viewer's OWN membership list (root picker + switcher)
// ---------------------------------------------------------------------------

/**
 * One organization the SIGNED-IN VIEWER holds an active membership in, as the
 * pre-scope root picker (`app/(portal)/page.tsx`) and the header org switcher
 * need it (`lib/data/memberships.ts`). `OrganizationSummary` plus the one
 * fact neither the picker nor the switcher can do without: which role this
 * particular viewer holds THERE — not `organization_membership`'s role for
 * some other user, always the caller's own.
 */
export type MembershipSummary = OrganizationSummary & {
  role: MembershipRow["role"]
}

export function membershipSummary(
  row: Pick<
    OrganizationRow,
    | "id"
    | "slug"
    | "legal_name"
    | "vat_regime"
    | "vat_registered_from"
    | "is_demo"
  > & { role: MembershipRow["role"] },
): MembershipSummary {
  return {
    ...organizationSummary(row),
    role: row.role,
  }
}

// ---------------------------------------------------------------------------
// Membership — a person in an organization's people list
// ---------------------------------------------------------------------------

/**
 * One row of Nastavení › Lidé (spec §2.10), which is the people-management
 * surface admins use. It joins `organization_membership` to `app_user`, and
 * that join is exactly where `is_staff` and `disabled_at` would ride along:
 * a company admin must not be able to read off which of their colleagues is
 * office staff, and the office's deactivation timestamps are not their
 * business either.
 *
 * The DISPLAY label (Účetní / Majitel společnosti / Pracovník firmy (vedení) /
 * Host) is derived from `role` in the UI layer, not stored here.
 */
export type OrgMemberSummary = {
  userId: string
  name: string
  email: string
  role: MembershipRow["role"]
  active: boolean
}

export function orgMemberSummary(
  row: Pick<AppUserRow, "email" | "name"> & {
    user_id: MembershipRow["user_id"]
    role: MembershipRow["role"]
    active: MembershipRow["active"]
  },
): OrgMemberSummary {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
  }
}

// ---------------------------------------------------------------------------
// Document — one row of Dokumenty
// ---------------------------------------------------------------------------

/**
 * A document as the Dokumenty table, the row sheet and the download route see
 * it (spec §2.2: soubor, nahráno, typ, protistrana, částka, stavba, status,
 * zpráva od účetní).
 *
 * FOUR COLUMNS OF `document` ARE ABSENT, and each absence is a decision:
 *
 *   - `storage_key` and `sha256` — the client never learns that S3 exists
 *     (see `CLIENT_FORBIDDEN_COLUMNS`);
 *   - `internal_note` — the office's own layer;
 *   - `visible_to_client` — the filter, not a field.
 *
 * `contentType` and `byteSize` ARE here: the download route reads this
 * projection to build its response headers, and PR 12's sheet needs the type to
 * decide between an image and a sandboxed PDF frame. Neither is a secret — the
 * client uploaded the file.
 *
 * `amount` is a STRING, not a number. Beta stores money as `numeric(14,2)` and
 * never computes on it (spec §0.7); the driver hands back the exact decimal
 * text, and turning it into a float here would be the one place a rounding
 * error could enter a system that has no arithmetic in it at all.
 *
 * `protistrana` is not here yet: spec §4 gives `document.partner_id` to the
 * partner PR (27), which introduces the table.
 */
export type DocumentSummary = {
  id: string
  filename: string
  docType: DocumentRow["doc_type"]
  status: DocumentRow["status"]
  contentType: string
  byteSize: number
  uploadedAt: string
  documentDate: string | null
  amount: string | null
  siteRef: string | null
  officeMessage: string | null
}

export function documentSummary(
  row: Pick<
    DocumentRow,
    | "id"
    | "original_filename"
    | "doc_type"
    | "status"
    | "content_type"
    | "byte_size"
    | "created_at"
    | "document_date"
    | "amount"
    | "site_ref"
    | "office_message"
  >,
): DocumentSummary {
  return {
    id: row.id,
    filename: row.original_filename,
    docType: row.doc_type,
    status: row.status,
    contentType: row.content_type,
    byteSize: row.byte_size,
    uploadedAt: row.created_at.toISOString(),
    documentDate: row.document_date,
    amount: row.amount,
    siteRef: row.site_ref,
    officeMessage: row.office_message,
  }
}

// ---------------------------------------------------------------------------
// Reporting period — the period identity every stamped dataset points at
// ---------------------------------------------------------------------------

/**
 * One reporting period as a surface renders it (spec §4).
 *
 * `startsOn` / `endsOn` come across as ISO date strings because the database
 * computes them (generated columns) and nothing above the data layer should
 * recompute a period boundary from a year and a month — §2.4 / §2.5 stamp
 * balances "k <period-end>", and two implementations of that date is one too
 * many.
 *
 * There is no label. A period renders as "07/2026" or "Q3 2026" or "2026"
 * depending on `kind`, and that formatting is i18n's job (PR 17), not the data
 * layer's — a Czech string built here would be untranslatable and untestable.
 */
export type ReportingPeriodView = {
  id: string
  kind: BetaPeriodKind
  year: number
  month: number | null
  quarter: number | null
  startsOn: string
  endsOn: string
}

export function reportingPeriodView(
  row: Pick<
    ReportingPeriodRow,
    | "id"
    | "period_kind"
    | "year"
    | "month"
    | "quarter"
    | "starts_on"
    | "ends_on"
  >,
): ReportingPeriodView {
  return {
    id: row.id,
    kind: row.period_kind,
    year: row.year,
    month: row.month,
    quarter: row.quarter,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  }
}

// ---------------------------------------------------------------------------
// Filing — one row of the registry behind all five Daně a podání families
// ---------------------------------------------------------------------------

/**
 * One filing as the portal renders it (spec §2.3).
 *
 * WHAT IS ABSENT, AND WHY EACH ONE. `note_internal` is the office's working note
 * and is on `CLIENT_FORBIDDEN_COLUMNS`, so a `{ ...row }` projection would be
 * caught by `forbiddenClientKeys` rather than shipped. `organization_id` is
 * absent because the reader already holds the scope that produced the row and an
 * id they cannot use is only useful for guessing at others. `created_at` is
 * absent because §2.4 stamps the SOURCE's last edit, not its birth.
 *
 * `family` is not a column — it is `beta_filing_family(kind)`, read back off the
 * query. Carrying it here means the five sidebar views bucket rows without a
 * second copy of the mapping in TypeScript.
 *
 * `amountDue` is a STRING. It is `numeric(14,2)` in Postgres and stays a string
 * all the way to the formatter: parsing it into a JavaScript number is how a
 * cent goes missing, and this application never does arithmetic on it anyway
 * (spec §0.2 — every sum is SQL-side).
 *
 * `overdue` is DERIVED, in SQL, against `CURRENT_DATE` (spec §2.4). It is not a
 * stored column and must never become one.
 */
export type FilingView = {
  id: string
  kind: BetaFilingKind
  family: BetaFilingFamily
  status: BetaFilingStatus
  period: ReportingPeriodView
  dueOn: string
  filedOn: string | null
  /** `numeric(14,2)` as a string. Positive = owed by the client; negative = refund. */
  amountDue: string | null
  paidAt: string | null
  variableSymbol: string | null
  /**
   * Whether an attachment exists THAT THIS READER MAY OPEN.
   *
   * Not `document_id !== null`: a document is soft-deleted rather than removed,
   * and the office can mark one hidden, so a filing can hold a valid id for a
   * row `lib/data/documents.ts` refuses to serve. The caller computes this
   * against the same four filters that module applies (`visibleAttachment` in
   * `lib/data/filings.ts`), so it cannot get the question wrong.
   */
  hasAttachment: boolean
  /**
   * The attachment's document id — present IF AND ONLY IF `hasAttachment` is
   * true (spec §2.3: "attachments (p7s/PDF/XML)", PR 17's download link).
   *
   * THIS IS NOT `filing.document_id`. It is the id read back off the SAME
   * filtered LEFT JOIN that produces `hasAttachment` — `visibleAttachment()`'s
   * four filters (tenancy, soft delete, the payslip exclusion, the hidden
   * class) have already run before this value exists at all. A soft-deleted or
   * office-hidden attachment's row never joins, so its id is null here exactly
   * when `hasAttachment` is false — the two can never disagree, because they
   * are the same column read twice: once through `!== null` and once as-is.
   * `lib/data/filings.test.ts` asserts they always agree.
   *
   * Handing the client this id is not a new capability. The download route
   * (`GET /api/orgs/[orgSlug]/documents/[documentId]/file`) re-resolves it
   * through `openDocumentFile`, which re-applies `visibleDocuments()` — the
   * identical four filters — independently of anything this projection
   * claims. So even a forged or stale id here opens nothing it should not;
   * this field only ever saves the reader a 404 they would otherwise cause by
   * guessing.
   */
  attachmentDocumentId: string | null
  noteClient: string | null
  overdue: boolean
  /** The §2.4 freshness stamp: when the office last edited this row. */
  updatedAt: string
}

export function filingView(
  row: Pick<
    FilingRow,
    | "id"
    | "kind"
    | "status"
    | "due_on"
    | "filed_on"
    | "amount_due"
    | "paid_at"
    | "variable_symbol"
    | "note_client"
    | "updated_at"
  > & {
    family: BetaFilingFamily
    overdue: boolean
    hasAttachment: boolean
    attachmentDocumentId: string | null
    period: ReportingPeriodView
  },
): FilingView {
  return {
    id: row.id,
    kind: row.kind,
    family: row.family,
    status: row.status,
    period: row.period,
    dueOn: row.due_on,
    filedOn: row.filed_on,
    amountDue: row.amount_due,
    paidAt: row.paid_at === null ? null : row.paid_at.toISOString(),
    variableSymbol: row.variable_symbol,
    hasAttachment: row.hasAttachment,
    attachmentDocumentId: row.attachmentDocumentId,
    noteClient: row.note_client,
    overdue: row.overdue,
    updatedAt: row.updated_at.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Owner document detail — Pro účetní › Zpracování (PR 14)
// ---------------------------------------------------------------------------

/**
 * A document as the office's OWN Zpracování queue sees it — the twin of
 * `DocumentSummary` above, deliberately kept a SEPARATE type rather than
 * `DocumentSummary & { internalNote: string }`. This projection is reached
 * only through an `OwnerScope` (`lib/data/documents-office.ts`), never a bare
 * `OrgScope`, so widening the client type instead would put the office layer
 * one accidental import away from a page every other role can reach.
 *
 * TWO FIELDS ARE DELIBERATELY RENAMED, NOT JUST INCLUDED: `internal_note`
 * becomes `note`, `visible_to_client` becomes `clientVisible`. Both names are
 * in `CLIENT_FORBIDDEN_COLUMNS` — the office is SUPPOSED to see them here, so
 * spreading the raw row instead of picking would be caught by
 * `forbiddenClientKeys`, and it stays caught: `documentSummary` above still
 * builds the client projection from the SAME `document` table and must never
 * carry either. Renaming (not just re-casing, the same discipline
 * `officeMemberRow` uses for `is_staff` → `staff`) is what keeps the two
 * projections from drifting into each other by a careless `{ ...row }`.
 */
export type OwnerDocumentDetail = {
  id: string
  filename: string
  docType: DocumentRow["doc_type"]
  status: DocumentRow["status"]
  contentType: string
  byteSize: number
  uploadedAt: string
  uploadedByUserId: string | null
  documentDate: string | null
  amount: string | null
  siteRef: string | null
  officeMessage: string | null
  /** `internal_note`, renamed — see the type's own header. */
  note: string | null
  /** `visible_to_client`, renamed — see the type's own header. */
  clientVisible: boolean
}

export function ownerDocumentDetail(
  row: Pick<
    DocumentRow,
    | "id"
    | "original_filename"
    | "doc_type"
    | "status"
    | "content_type"
    | "byte_size"
    | "created_at"
    | "uploaded_by_user_id"
    | "document_date"
    | "amount"
    | "site_ref"
    | "office_message"
    | "internal_note"
    | "visible_to_client"
  >,
): OwnerDocumentDetail {
  return {
    id: row.id,
    filename: row.original_filename,
    docType: row.doc_type,
    status: row.status,
    contentType: row.content_type,
    byteSize: row.byte_size,
    uploadedAt: row.created_at.toISOString(),
    uploadedByUserId: row.uploaded_by_user_id,
    documentDate: row.document_date,
    amount: row.amount,
    siteRef: row.site_ref,
    officeMessage: row.office_message,
    note: row.internal_note,
    clientVisible: row.visible_to_client,
  }
}

// ---------------------------------------------------------------------------
// Setup link — the one-time-link screens
// ---------------------------------------------------------------------------

/**
 * What a one-time link screen may render before anyone is authenticated
 * (`peekSetupToken`). Three fields, and every other column of
 * `user_setup_token` is a secret or a forensic record: the hash of the link,
 * the issuer, the IPs, the granted role.
 *
 * `organizationName` is an organization column reaching an unauthenticated
 * page, which is safe only because the visitor already holds the link that
 * names it — and it is precisely why this is a projection rather than a row.
 */
export type SetupInviteView = {
  purpose: BetaSetupTokenPurpose
  email: string
  organizationName: string | null
}

export function setupInviteView(row: {
  purpose: SetupInviteView["purpose"]
  email: string
  organizationName: string | null
}): SetupInviteView {
  return {
    purpose: row.purpose,
    email: row.email,
    organizationName: row.organizationName,
  }
}

// ---------------------------------------------------------------------------
// Office tier — the /admin surface
// ---------------------------------------------------------------------------

/**
 * /admin is above organizations and is reached only through `requireOffice()`,
 * so it legitimately renders facts the client tier above must never see: who is
 * office staff, who has been deactivated, what role a pending invite grants.
 *
 * THESE PROJECTIONS STILL PASS `forbiddenClientKeys`, AND THAT IS DELIBERATE —
 * not a loophole. The forbidden list is a list of RAW COLUMN NAMES: its job is
 * to catch a row that reached a component by being spread, which is how a
 * privileged column ships without anyone deciding to ship it. An office
 * projection that has decided to expose staff-ness says `staff: boolean`, a
 * derived fact with a chosen name and a chosen meaning; a `is_staff` key
 * appearing here would mean the row came through unpicked, which is the thing
 * being checked for. Same for `disabled` vs `disabled_at`, `role` vs
 * `granted_role`, and `status` vs the three timestamp columns behind it.
 *
 * What is absent from EVERY shape below, at every tier: `token_hash`. The
 * registry cannot render a link because it has no field for one — the raw
 * secret exists once, in `issueSetupToken`'s return value, and never again.
 */

export type OfficeOrganizationRow = {
  id: string
  slug: string
  legalName: string
  ico: string | null
  vatRegime: OrganizationRow["vat_regime"]
  /**
   * Load-bearing, not decorative. The /admin settings form posts the VAT regime
   * and its registration date TOGETHER (`organizationVatPayload` keeps the pair
   * coherent), so the date input has to be able to render the stored value as
   * its `defaultValue`. Without this field the input renders empty, every save
   * posts an empty date, and an unrelated edit — toggling `is_demo` — silently
   * nulls the registration date of a plátce.
   */
  vatRegisteredFrom: string | null
  isDemo: boolean
  archived: boolean
  /** Active memberships, and how many of them are owners (the ≥1 invariant). */
  memberCount: number
  ownerCount: number
}

export function officeOrganizationRow(row: {
  id: string
  slug: string
  legal_name: string
  ico: string | null
  vat_regime: OrganizationRow["vat_regime"]
  vat_registered_from: string | null
  is_demo: boolean
  archived_at: Date | null
  memberCount: number
  ownerCount: number
}): OfficeOrganizationRow {
  return {
    id: row.id,
    slug: row.slug,
    legalName: row.legal_name,
    ico: row.ico,
    vatRegime: row.vat_regime,
    vatRegisteredFrom: row.vat_registered_from,
    isDemo: row.is_demo,
    archived: row.archived_at !== null,
    memberCount: row.memberCount,
    ownerCount: row.ownerCount,
  }
}

/** One person in an organization, as the office sees them. */
export type OfficeMemberRow = {
  userId: string
  name: string
  email: string
  role: MembershipRow["role"]
  active: boolean
  /** Office staff. The precondition for `owner`, so the grid has to show it. */
  staff: boolean
  /** The account itself is deactivated — outranks the membership's own state. */
  disabled: boolean
}

export function officeMemberRow(row: {
  user_id: string
  name: string
  email: string
  role: MembershipRow["role"]
  active: boolean
  is_staff: boolean
  disabled_at: Date | null
}): OfficeMemberRow {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    staff: row.is_staff,
    disabled: row.disabled_at !== null,
  }
}

/** One account in the cross-org user list. */
export type OfficeUserRow = {
  userId: string
  name: string
  email: string
  staff: boolean
  disabled: boolean
  /** Whether a credential exists — a provisioned account has none yet. */
  activated: boolean
  /** Active memberships, so deactivation is never a blind action. */
  membershipCount: number
  ownerOfCount: number
}

export function officeUserRow(row: {
  id: string
  name: string
  email: string
  is_staff: boolean
  disabled_at: Date | null
  activated: boolean
  membershipCount: number
  ownerOfCount: number
}): OfficeUserRow {
  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    staff: row.is_staff,
    disabled: row.disabled_at !== null,
    activated: row.activated,
    membershipCount: row.membershipCount,
    ownerOfCount: row.ownerOfCount,
  }
}

/**
 * The four states a link can be in, collapsed from three nullable timestamps
 * into one value the registry can filter on. `consumed` outranks `revoked`
 * because the sibling sweep revokes the OTHER links when one is consumed, and a
 * link that was actually used is the more important fact about it; both outrank
 * `expired`, which is only about the clock.
 */
export type SetupLinkStatus = "live" | "consumed" | "revoked" | "expired"

function setupLinkStatus(
  row: {
    consumedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date
  },
  now: Date = new Date(),
): SetupLinkStatus {
  if (row.consumedAt !== null) return "consumed"
  if (row.revokedAt !== null) return "revoked"
  return row.expiresAt.getTime() <= now.getTime() ? "expired" : "live"
}

/** One row of the /admin setup-link registry. Carries no secret of any kind. */
export type OfficeSetupLinkRow = {
  id: string
  purpose: BetaSetupTokenPurpose
  email: string
  organizationName: string | null
  /** The role the link grants, absent for an unscoped one. */
  role: MembershipRow["role"] | null
  status: SetupLinkStatus
  expiresAt: string
  createdAt: string
  issuedByEmail: string | null
}

export function officeSetupLinkRow(
  row: {
    id: string
    purpose: BetaSetupTokenPurpose
    email: string
    organizationName: string | null
    grantedRole: MembershipRow["role"] | null
    consumedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date
    createdAt: Date
    issuedByEmail: string | null
  },
  now?: Date,
): OfficeSetupLinkRow {
  return {
    id: row.id,
    purpose: row.purpose,
    email: row.email,
    organizationName: row.organizationName,
    role: row.grantedRole,
    status: setupLinkStatus(row, now),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    issuedByEmail: row.issuedByEmail,
  }
}
