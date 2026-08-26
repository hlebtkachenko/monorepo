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
  asset,
  asset_event,
  client_task,
  document,
  filing,
  import_batch,
  liability,
  organization,
  organization_membership,
  reporting_period,
  statement_line,
  trial_balance_line,
  BetaAssetCategory,
  BetaAssetEventKind,
  BetaAssetStatus,
  BetaClientTaskLinkKind,
  BetaClientTaskStatus,
  BetaFilingFamily,
  BetaFilingKind,
  BetaFilingStatus,
  BetaImportDataset,
  BetaImportSource,
  BetaImportStatus,
  BetaObligationGroup,
  BetaPeriodKind,
  BetaSetupTokenPurpose,
  BetaStatementKind,
} from "@/db/schema"

type AppUserRow = typeof app_user.$inferSelect
type DocumentRow = typeof document.$inferSelect
type OrganizationRow = typeof organization.$inferSelect
type MembershipRow = typeof organization_membership.$inferSelect
type ReportingPeriodRow = typeof reporting_period.$inferSelect
type FilingRow = typeof filing.$inferSelect
type LiabilityRow = typeof liability.$inferSelect
type ImportBatchRow = typeof import_batch.$inferSelect
type StatementLineRow = typeof statement_line.$inferSelect
type TrialBalanceLineRow = typeof trial_balance_line.$inferSelect
type AssetRow = typeof asset.$inferSelect
type AssetEventRow = typeof asset_event.$inferSelect
type ClientTaskRow = typeof client_task.$inferSelect

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
  // The derivative's key (PR 11). Listed separately because the normalizer
  // collapses case and separators, not prefixes — `preview_storage_key` and
  // `storage_key` are two different names to it, and both are keys the client
  // must never receive. `DocumentSummary.hasPreview` is the derived boolean the
  // row sheet actually needs.
  "preview_storage_key",
  "sha256",
  "visible_to_client",
  // filing — the office's own working note about a client's tax affairs, which
  // has never been written to be read by that client. Spelled `note_internal`
  // rather than document's `internal_note`, so BOTH spellings are listed: the
  // normalizer above collapses separators and case, not word order.
  "note_internal",
  // filing / liability / asset — the source system's own id for the row
  // (migration 0011). Not a secret in the "if leaked, game over" sense, and
  // forbidden for the same reason `storage_key` is: shipping it would invite the
  // next feature to accept one BACK from a browser, and "here is the office's
  // internal id, act on it" is a shape the client tier must never learn exists.
  "external_ref",
  // agent_key — the credential hash and the account it acts as. No client-facing
  // surface reads this table at all; listing them means a future projection
  // cannot start.
  "key_hash",
  "acting_user_id",
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

/**
 * The identity card of spec §2.1 item 5 — "název, IČO, DIČ / 'Neplátce DPH'
 * badge, sídlo, účet, datová schránka, spisová značka" — and the same fields
 * Nastavení › Společnost (§2.10, PR 21) edits.
 *
 * A WIDER PROJECTION THAN `OrganizationSummary`, NOT A REPLACEMENT FOR IT. The
 * summary is read by the header, the switcher and every org page's chrome, on
 * every request; the card is read by the two surfaces that actually print an
 * address. Keeping them apart keeps the wide read off the hot path — and keeps
 * this file's own rule visible, which is that a projection is an allowlist for
 * ONE surface's needs rather than "the row, mostly".
 *
 * `aresFetchedAt` is here because §2.10's 24-hour ARES cache is a fact ABOUT the
 * identity fields — the card can say where the values came from and when. Every
 * OTHER column of `organization` stays out: `archived_at` (an archived book
 * never resolves a scope at all), `is_demo` (already on the summary),
 * `contact_email` / `contact_phone` (office contact routing, not the statutory
 * identity §2.1 lists), and the timestamps.
 *
 * The bank account arrives as its THREE PARTS plus IBAN/BIC, not as a display
 * string. A Czech account number is prefix / number / bank code and cannot be
 * validated once it has been joined up (see `db/schema/organization.ts`);
 * `formatBetaBankAccount` in `lib/format/identity.ts` is where the parts become
 * the printed `předčíslí-číslo/kód banky`, at the last step before display.
 */
export type OrganizationCard = OrganizationSummary & {
  ico: string | null
  dic: string | null
  registeredStreet: string | null
  registeredHouseNumber: string | null
  registeredOrientationNumber: string | null
  registeredCity: string | null
  registeredPostalCode: string | null
  registeredCountryCode: string
  dataBoxId: string | null
  courtFileNumber: string | null
  taxOfficeCode: string | null
  bankAccountPrefix: string | null
  bankAccountNumber: string | null
  bankCode: string | null
  iban: string | null
  bic: string | null
  /** ISO instant of the last ARES refresh, or null (§2.10's 24h cache stamp). */
  aresFetchedAt: string | null
}

export function organizationCard(
  row: Pick<
    OrganizationRow,
    | "id"
    | "slug"
    | "legal_name"
    | "vat_regime"
    | "vat_registered_from"
    | "is_demo"
    | "ico"
    | "dic"
    | "registered_street"
    | "registered_house_number"
    | "registered_orientation_number"
    | "registered_city"
    | "registered_postal_code"
    | "registered_country_code"
    | "data_box_id"
    | "court_file_number"
    | "tax_office_code"
    | "bank_account_prefix"
    | "bank_account_number"
    | "bank_code"
    | "iban"
    | "bic"
    | "ares_fetched_at"
  >,
): OrganizationCard {
  return {
    ...organizationSummary(row),
    ico: row.ico,
    dic: row.dic,
    registeredStreet: row.registered_street,
    registeredHouseNumber: row.registered_house_number,
    registeredOrientationNumber: row.registered_orientation_number,
    registeredCity: row.registered_city,
    registeredPostalCode: row.registered_postal_code,
    registeredCountryCode: row.registered_country_code,
    dataBoxId: row.data_box_id,
    courtFileNumber: row.court_file_number,
    taxOfficeCode: row.tax_office_code,
    bankAccountPrefix: row.bank_account_prefix,
    bankAccountNumber: row.bank_account_number,
    bankCode: row.bank_code,
    iban: row.iban,
    bic: row.bic,
    aresFetchedAt:
      row.ares_fetched_at === null ? null : row.ares_fetched_at.toISOString(),
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
  /**
   * Whether a JPEG preview derivative exists for this row (PR 11, spec §2.2).
   *
   * A DERIVED BOOLEAN, NOT `preview_storage_key`. The client never learns that
   * S3 exists (see `CLIENT_FORBIDDEN_COLUMNS` on `storage_key`), and the same
   * argument applies twice over to a second key: what the row sheet needs to
   * know is "will `?disposition=preview` render something", which is a yes/no.
   * The route re-resolves the key itself from the row, so this field grants no
   * capability — it only saves the sheet from framing an element that would
   * answer with an attachment.
   *
   * False for every non-HEIC type (they are previewable on their own terms) and
   * false for a HEIC whose decode did not succeed.
   */
  hasPreview: boolean
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
    | "preview_storage_key"
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
    hasPreview: row.preview_storage_key !== null,
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
// Liability — the manual residue behind Finance › Dluhy a platby
// ---------------------------------------------------------------------------

/**
 * One manual liability as Zadávání dat edits it (spec §3.3).
 *
 * NOT the shape Dluhy a platby renders. That surface reads `Obligation` from
 * `lib/data/obligations.ts` — the union row shared by all three sources — and
 * never learns which table a row came from beyond the `source` discriminator.
 * This projection exists for the EDITING surface, which does know, and which
 * needs the fields the union deliberately drops: `paidAt` (an obligation is by
 * definition unpaid, so the union has no column for it) and `noteClient`.
 *
 * `note_internal` is absent — office-only (§3.1), on `CLIENT_FORBIDDEN_COLUMNS`,
 * and not selected by any query in `lib/data/liabilities.ts` either, so it
 * cannot leak even by accident. `organization_id` is absent because the reader
 * already holds the scope that produced the row. `created_at` is absent because
 * §2.4 stamps the source's last edit, not its birth.
 *
 * `amount` is a STRING, at `numeric(14,2)` scale, all the way to the formatter
 * (spec §0.7 — parsing it into a JavaScript number is how a haléř goes missing,
 * and nothing in this application does arithmetic on it anyway).
 *
 * `overdue` is DERIVED in SQL against `CURRENT_DATE` (spec §2.4) and must never
 * become a stored column.
 */
export type LiabilityView = {
  id: string
  group: BetaObligationGroup
  label: string
  /** `numeric(14,2)` as a string. Always strictly positive (DB CHECK). */
  amount: string
  dueOn: string
  paidAt: string | null
  variableSymbol: string | null
  noteClient: string | null
  overdue: boolean
  /** The §2.4 freshness stamp: when the office last edited this row. */
  updatedAt: string
}

export function liabilityView(
  row: Pick<
    LiabilityRow,
    | "id"
    | "creditor_group"
    | "label"
    | "amount"
    | "due_on"
    | "paid_at"
    | "variable_symbol"
    | "note_client"
    | "updated_at"
  > & { overdue: boolean },
): LiabilityView {
  return {
    id: row.id,
    group: row.creditor_group,
    label: row.label,
    amount: row.amount,
    dueOn: row.due_on,
    paidAt: row.paid_at === null ? null : row.paid_at.toISOString(),
    variableSymbol: row.variable_symbol,
    noteClient: row.note_client,
    overdue: row.overdue,
    updatedAt: row.updated_at.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Import spine — batches and their payload rows (spec §3.2, §4)
// ---------------------------------------------------------------------------

/**
 * One import batch as a surface renders it (spec §3.2: batch history,
 * completeness matrix, rollback button).
 *
 * WHAT IS ABSENT, AND WHY EACH ONE:
 *
 *   - `sha256` — on `CLIENT_FORBIDDEN_COLUMNS` for the same reason
 *     `document.sha256` is: shipping a content digest creates the temptation to
 *     accept one back.
 *   - `mapping` — the office's CSV column mapping. Configuration of how the
 *     office works, not a fact about the client's books.
 *   - `note_internal` — the office's own "why I re-imported" note, forbidden.
 *   - `imported_by_user_id` / `published_by_user_id` — a client tier must not be
 *     handed the office's user ids. The office review surface (PR 25) that wants
 *     names joins `app_user` and projects them, the way the /admin shapes below
 *     do.
 *   - `organization_id` — the reader already holds the scope that produced the
 *     row.
 *
 * `supersededByBatchId` IS here: it is the edge of the chain the batch-history
 * view draws, and it names a row in the same list the reader is already looking
 * at. `publishedAt` is the §0.4 freshness stamp itself, so it is the one field
 * on this shape no surface can do without.
 */
export type ImportBatchView = {
  id: string
  dataset: BetaImportDataset
  status: BetaImportStatus
  source: BetaImportSource
  period: ReportingPeriodView
  /** Present only for a manual file drop; an agent-fed batch has no file. */
  filename: string | null
  rowCount: number
  importedAt: string
  /** The §0.4 dataset stamp. NULL for a draft, and cleared again by a rollback. */
  publishedAt: string | null
  supersededAt: string | null
  supersededByBatchId: string | null
}

export function importBatchView(
  row: Pick<
    ImportBatchRow,
    | "id"
    | "dataset"
    | "status"
    | "source"
    | "filename"
    | "row_count"
    | "imported_at"
    | "published_at"
    | "superseded_at"
    | "superseded_by_batch_id"
  > & { period: ReportingPeriodView },
): ImportBatchView {
  return {
    id: row.id,
    dataset: row.dataset,
    status: row.status,
    source: row.source,
    period: row.period,
    filename: row.filename,
    rowCount: row.row_count,
    importedAt: row.imported_at.toISOString(),
    publishedAt: row.published_at?.toISOString() ?? null,
    supersededAt: row.superseded_at?.toISOString() ?? null,
    supersededByBatchId: row.superseded_by_batch_id,
  }
}

/**
 * A batch as the OFFICE's own review surface sees it (spec §3.2's batch
 * history) — `ImportBatchView` plus the two actor names, and nothing else.
 *
 * A SEPARATE TYPE, not a widened `ImportBatchView`, for exactly the reason that
 * type's header states: the client shape must never carry the office's user
 * ids, and the review surface "joins `app_user` and projects them, the way the
 * /admin shapes below do". Keeping the two apart is what stops a field added
 * here from reaching a client tier — `officeBatchHistoryFor` takes an
 * `OwnerScope`, so this shape is only reachable from a surface the client
 * cannot open.
 *
 * NAMES, NOT IDS, and NOT the raw column names either (same discipline as
 * `officeMemberRow`'s `staff`): `imported_by_user_id` becomes
 * `importedByName`, so a `{ ...row }` that skipped this function would be
 * caught rather than shipped.
 *
 * BOTH ARE NULLABLE, and the common case is null. An agent-fed batch (§3.2's
 * feeding channel) has no session behind it and therefore no user id; a batch
 * that has never been published has no publisher; and `ON DELETE SET NULL` on
 * both columns means an offboarded colleague's batches keep their history
 * without keeping their account. A surface renders a null as the batch's
 * SOURCE, never as an unknown person.
 */
export type OfficeImportBatchRow = ImportBatchView & {
  importedByName: string | null
  publishedByName: string | null
}

export function officeImportBatchRow(
  batch: ImportBatchView,
  actors: { importedByName: string | null; publishedByName: string | null },
): OfficeImportBatchRow {
  return {
    ...batch,
    importedByName: actors.importedByName,
    publishedByName: actors.publishedByName,
  }
}

/**
 * One řádek of a rozvaha or a VZZ (spec §2.5).
 *
 * ALL FIVE VALUE COLUMNS ARE STRINGS, and stay strings all the way to the
 * formatter. They are `numeric(14,2)` in Postgres (§0.7) and this application
 * does no arithmetic on them at all (§0.2) — parsing one into a JavaScript
 * number is how a haléř goes missing from a statutory statement.
 *
 * A `null` is not a zero. The rozvaha prints "x" in the korekce column of many
 * lines and leaves cells blank; §0.4's "empty beats stale" applies at cell
 * granularity, so an absent value renders absent.
 *
 * `sortOrder` is deliberately absent: the rows arrive in printed order and the
 * array order IS that order. Shipping the column would invite a client
 * component to re-sort by it, which is a second implementation of an ordering
 * the database already applied.
 */
export type StatementLineView = {
  id: string
  statementKind: BetaStatementKind
  /** Označení — "B.II.", "A.1.", "*", or null on a spacer row. */
  ozn: string | null
  rowCode: string
  rowLabel: string
  indent: number
  isBold: boolean
  /** Rozvaha aktiva only. */
  brutto: string | null
  /** Rozvaha aktiva only. */
  korekce: string | null
  /** Rozvaha aktiva only — STORED as imported, never derived from brutto − korekce. */
  netto: string | null
  /** Rozvaha pasiva and VZZ. */
  bezne: string | null
  minule: string | null
}

export function statementLineView(
  row: Pick<
    StatementLineRow,
    | "id"
    | "statement_kind"
    | "ozn"
    | "row_code"
    | "row_label"
    | "indent"
    | "is_bold"
    | "value_brutto"
    | "value_korekce"
    | "value_netto"
    | "value_bezne"
    | "value_minule"
  >,
): StatementLineView {
  return {
    id: row.id,
    statementKind: row.statement_kind,
    ozn: row.ozn,
    rowCode: row.row_code,
    rowLabel: row.row_label,
    indent: row.indent,
    isBold: row.is_bold,
    brutto: row.value_brutto,
    korekce: row.value_korekce,
    netto: row.value_netto,
    bezne: row.value_bezne,
    minule: row.value_minule,
  }
}

/**
 * One account of an obratová předvaha (spec §2.5), and the row Finance › Účty a
 * hotovost reads its bank and cash balances off (§2.4, via PR 26's
 * `account_balance_map`).
 *
 * Four money strings, same rule as above: `numeric(14,2)`, never parsed.
 */
export type TrialBalanceLineView = {
  id: string
  accountCode: string
  accountName: string
  openingBalance: string | null
  turnoverDebit: string | null
  turnoverCredit: string | null
  closingBalance: string | null
}

export function trialBalanceLineView(
  row: Pick<
    TrialBalanceLineRow,
    | "id"
    | "account_code"
    | "account_name"
    | "opening_balance"
    | "turnover_debit"
    | "turnover_credit"
    | "closing_balance"
  >,
): TrialBalanceLineView {
  return {
    id: row.id,
    accountCode: row.account_code,
    accountName: row.account_name,
    openingBalance: row.opening_balance,
    turnoverDebit: row.turnover_debit,
    turnoverCredit: row.turnover_credit,
    closingBalance: row.closing_balance,
  }
}

// ---------------------------------------------------------------------------
// Asset — Majetek (spec §2.7 Přehled majetku / Karta majetku)
// ---------------------------------------------------------------------------

/**
 * One asset as Přehled majetku and the Karta render it.
 *
 * `residualValue` is NOT a stored column — it is `acquisition_cost −
 * accumulated_depreciation`, computed in SQL at read time
 * (`lib/data/assets.ts`), null whenever `accumulatedDepreciation` is null
 * (spec §0.4: "empty beats stale", never a silent zero). `note_internal` is
 * absent by design: it is on `CLIENT_FORBIDDEN_COLUMNS`, the office's own
 * layer, mirrored from `filing.note_internal`.
 *
 * Every money field is a STRING (`numeric(14,2)`, spec §0.7) — this portal
 * never parses one into a JavaScript number.
 */
export type AssetView = {
  id: string
  name: string
  category: BetaAssetCategory
  isMinor: boolean
  acquisitionCost: string
  acquiredOn: string | null
  placedInServiceOn: string | null
  accumulatedDepreciation: string | null
  depreciationAsOf: string | null
  /** `acquisition_cost − accumulated_depreciation`, or null — see above. */
  residualValue: string | null
  taxResidualValue: string | null
  siteRef: string | null
  status: BetaAssetStatus
  disposedOn: string | null
  noteClient: string | null
  updatedAt: string
}

export function assetView(
  row: Pick<
    AssetRow,
    | "id"
    | "name"
    | "category"
    | "is_minor"
    | "acquisition_cost"
    | "acquired_on"
    | "placed_in_service_on"
    | "accumulated_depreciation"
    | "depreciation_as_of"
    | "tax_residual_value"
    | "site_ref"
    | "status"
    | "disposed_on"
    | "note_client"
    | "updated_at"
  > & { residualValue: string | null },
): AssetView {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    isMinor: row.is_minor,
    acquisitionCost: row.acquisition_cost,
    acquiredOn: row.acquired_on,
    placedInServiceOn: row.placed_in_service_on,
    accumulatedDepreciation: row.accumulated_depreciation,
    depreciationAsOf: row.depreciation_as_of,
    residualValue: row.residualValue,
    taxResidualValue: row.tax_residual_value,
    siteRef: row.site_ref,
    status: row.status,
    disposedOn: row.disposed_on,
    noteClient: row.note_client,
    updatedAt: row.updated_at.toISOString(),
  }
}

/** One row of an asset's Karta event history (spec §2.7). */
export type AssetEventView = {
  id: string
  kind: BetaAssetEventKind
  eventDate: string
  amount: string | null
  note: string | null
}

export function assetEventView(
  row: Pick<AssetEventRow, "id" | "kind" | "event_date" | "amount" | "note">,
): AssetEventView {
  return {
    id: row.id,
    kind: row.kind,
    eventDate: row.event_date,
    amount: row.amount,
    note: row.note,
  }
}

// ---------------------------------------------------------------------------
// Client task — Pro účetní › Úkoly klientovi (spec §3.4, §2.1)
// ---------------------------------------------------------------------------

/**
 * One OPEN, non-template task as the client's own list renders it (spec §2.1:
 * "open client_tasks (text, due, link)"). Deliberately narrow — no
 * `organization_id` (the reader already holds the scope that produced it),
 * no `status` (this view is only ever built from `status = 'open'` rows, the
 * same reasoning `filingView` gives for omitting `created_at`), and none of
 * the office-only bookkeeping (`isTemplate`, `createdBy`, the `source*`
 * pair, `templateDueDay`) — `OwnerClientTaskDetail` below is the office's own,
 * separate shape for those, the same split `documentSummary` /
 * `ownerDocumentDetail` already establish for `document`.
 */
export type ClientTaskView = {
  id: string
  title: string
  description: string | null
  dueDate: string
  linkKind: BetaClientTaskLinkKind
}

export function clientTaskView(
  row: Pick<ClientTaskRow, "id" | "title" | "description" | "link_kind"> & {
    due_date: string
  },
): ClientTaskView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    linkKind: row.link_kind,
  }
}

/**
 * One row of Pro účetní › Úkoly klientovi (spec §3.4) — a real task OR a
 * template, as the office's own CRUD list needs it. `generatedFromTemplate`
 * is DERIVED (`source_template_id !== null`), not the raw id itself: the
 * office UI only ever needs to know THAT a task came from a template, never
 * which one, so the raw foreign key stays out of this projection the same way
 * `hasAttachment` on `FilingView` reports a fact rather than the id behind it.
 */
export type OwnerClientTaskDetail = {
  id: string
  isTemplate: boolean
  title: string
  description: string | null
  dueDate: string | null
  templateDueDay: number | null
  linkKind: BetaClientTaskLinkKind
  status: BetaClientTaskStatus
  doneAt: string | null
  generatedFromTemplate: boolean
  createdAt: string
  updatedAt: string
}

export function ownerClientTaskDetail(
  row: Pick<
    ClientTaskRow,
    | "id"
    | "is_template"
    | "title"
    | "description"
    | "due_date"
    | "template_due_day"
    | "link_kind"
    | "status"
    | "done_at"
    | "source_template_id"
    | "created_at"
    | "updated_at"
  >,
): OwnerClientTaskDetail {
  return {
    id: row.id,
    isTemplate: row.is_template,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    templateDueDay: row.template_due_day,
    linkKind: row.link_kind,
    status: row.status,
    doneAt: row.done_at === null ? null : row.done_at.toISOString(),
    generatedFromTemplate: row.source_template_id !== null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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

/**
 * One row of the /admin agent-key registry (spec §3.2 "issued/revoked in
 * /admin"). Carries no part of the secret, by construction: only `key_hash` is
 * stored and this shape has no field to put one in — the same property
 * `OfficeSetupLinkRow` has, for the same reason.
 */
export type OfficeAgentKeyRow = {
  id: string
  label: string
  /** The book it is confined to, or null for an office-global key. */
  organizationName: string | null
  actingUserEmail: string | null
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  revoked: boolean
}

export function officeAgentKeyRow(row: {
  id: string
  label: string
  organizationName: string | null
  actingUserEmail: string | null
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}): OfficeAgentKeyRow {
  return {
    id: row.id,
    label: row.label,
    organizationName: row.organizationName,
    actingUserEmail: row.actingUserEmail,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revoked: row.revokedAt !== null,
  }
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
