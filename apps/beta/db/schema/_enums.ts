/**
 * Drizzle pgEnum declarations for the beta portal database.
 *
 * Every declaration here MUST mirror `apps/beta/db/migrations/*.sql` exactly.
 * A future `ALTER TYPE ... ADD VALUE` migration updates this file in the same
 * PR. `db/schema-drift.test.ts` fails the build when the two drift apart.
 *
 * Names are `beta_`-prefixed on purpose. Beta runs on its own database, so a
 * runtime collision with the main app is impossible, but a bare `org_role`
 * would read in review as the main app's `organization_role` (owner | admin |
 * member | agent | guest) — a different enum with a different meaning.
 */
import { pgEnum } from "drizzle-orm/pg-core"

/**
 * Mirrors: 0000_init.sql — CREATE TYPE beta_org_role.
 *
 * The single role axis (plan Part 4, Hleb decision 2026-08-25):
 *   owner  — Účetní. Accounting data entry + office-internal layer + org
 *            settings + invites + org delete. Requires `app_user.is_staff`.
 *   admin  — Majitel společnosti. All client-visible data, uploads, and invites
 *            limited to admin | member | guest.
 *   member — Pracovník firmy (vedení). Uploads + views, no invites.
 *   guest  — Host. Read-only; also the employee seat when linked to a payroll
 *            employee row (PR 29+), which narrows it to own-payroll only.
 */
export const betaOrgRole = pgEnum("beta_org_role", [
  "owner",
  "admin",
  "member",
  "guest",
])

/** A membership role value, derived from the enum — never a hand-written union. */
export type BetaOrgRole = (typeof betaOrgRole.enumValues)[number]

/**
 * Mirrors: 0011_agent_api.sql — CREATE TYPE beta_actor_kind.
 *
 * Spec §4 activity_log: "actor kind user|agent". Two values and no third — a
 * system actor would be an authority nobody granted.
 */
export const betaActorKind = pgEnum("beta_actor_kind", ["user", "agent"])

export type BetaActorKind = (typeof betaActorKind.enumValues)[number]

/** Mirrors: 0000_init.sql — CREATE TYPE beta_vat_regime. */
export const betaVatRegime = pgEnum("beta_vat_regime", ["platce", "neplatce"])

export type BetaVatRegime = (typeof betaVatRegime.enumValues)[number]

/**
 * Mirrors: 0000_init.sql — CREATE TYPE beta_setup_token_purpose.
 *
 * Advisor blocker B4-4 splits the one-time link by purpose because the three
 * flows have different preconditions: `account_setup` only when no account
 * exists, `org_invite` only with an authenticated session on a matching email,
 * `password_reset` only when issued by office staff (and it revokes every
 * session on consume).
 */
export const betaSetupTokenPurpose = pgEnum("beta_setup_token_purpose", [
  "account_setup",
  "org_invite",
  "password_reset",
])

export type BetaSetupTokenPurpose =
  (typeof betaSetupTokenPurpose.enumValues)[number]

/**
 * Mirrors: 0004_documents.sql — CREATE TYPE beta_document_status.
 *
 * Spec §2.2: Přijato / Zpracovává se / Zpracováno / Vráceno. `returned` is not
 * "rejected" — the document comes back for a fix — and a returned row must
 * carry an `office_message` (DB CHECK).
 */
export const betaDocumentStatus = pgEnum("beta_document_status", [
  "received",
  "in_processing",
  "processed",
  "returned",
])

export type BetaDocumentStatus = (typeof betaDocumentStatus.enumValues)[number]

/** Mirrors: 0004_documents.sql — CREATE TYPE beta_document_type. */
export const betaDocumentType = pgEnum("beta_document_type", [
  "invoice_in",
  "invoice_out",
  "receipt",
  "bank_statement",
  "contract",
  "payroll",
  "attendance",
  "hr",
  "payslip",
  "other",
])

export type BetaDocumentType = (typeof betaDocumentType.enumValues)[number]

/**
 * The document kinds a CLIENT-FACING upload may declare.
 *
 * `payslip` is excluded at the TYPE level, not by a runtime `if`. Payslips are
 * office-produced payroll artefacts (spec §2.6 Výplatnice, PR 31): they are
 * excluded from every Dokumenty view server-side, so a row a client could label
 * `payslip` would be a row that client can no longer see. Making it
 * unrepresentable in the upload API's input type means no route can grow that
 * hole by forgetting a check.
 */
export type BetaClientDocumentType = Exclude<BetaDocumentType, "payslip">

export const BETA_CLIENT_DOCUMENT_TYPES: readonly BetaClientDocumentType[] =
  betaDocumentType.enumValues.filter(
    (value): value is BetaClientDocumentType => value !== "payslip",
  )

/**
 * Mirrors: 0005_filings.sql — CREATE TYPE beta_period_kind.
 *
 * Spec §4 names `month|year`; `quarter` is required by §2.3 twice over (DPH is
 * filed quarterly by small plátci, and the DPPO záloha schedule is quarterly
 * above 150 000 Kč of prior tax). See the migration for the full note.
 */
export const betaPeriodKind = pgEnum("beta_period_kind", [
  "month",
  "quarter",
  "year",
])

export type BetaPeriodKind = (typeof betaPeriodKind.enumValues)[number]

/**
 * Mirrors: 0005_filings.sql — CREATE TYPE beta_filing_kind.
 *
 * Every filing type the beta scope covers (spec §2.3 + `11-product-research.md`),
 * spelled as the Czech form's own name. Czech here and English for
 * `betaFilingStatus` below is deliberate: these are the legal names of
 * documents, the way `platce` / `neplatce` are the legal names of a VAT regime,
 * whereas a status is a workflow state this application invented.
 */
export const betaFilingKind = pgEnum("beta_filing_kind", [
  "dph_priznani",
  "dph_kontrolni_hlaseni",
  "dph_souhrnne_hlaseni",
  "dppo_priznani",
  "dppo_zaloha",
  "ucetni_zaverka",
  "vyuctovani_dane",
  "prehled_cssz",
  "prehled_zp",
  "jmhz",
  "silnicni_dan",
  "ostatni",
])

export type BetaFilingKind = (typeof betaFilingKind.enumValues)[number]

/**
 * Mirrors: 0005_filings.sql — CREATE TYPE beta_filing_family.
 *
 * The four Daně a podání families (spec §2.3). `Souhrn` is NOT a value: it is
 * the cross-family rollup view, not a bucket a filing can belong to.
 *
 * A filing does NOT carry its family as a column. The mapping lives once, in the
 * SQL function `beta_filing_family(kind)`, and `lib/data/filings.ts` selects it
 * back off the row — see the migration's section 4.
 */
export const betaFilingFamily = pgEnum("beta_filing_family", [
  "dph",
  "dan_z_prijmu",
  "mzdove_odvody",
  "ostatni",
])

export type BetaFilingFamily = (typeof betaFilingFamily.enumValues)[number]

/**
 * Mirrors: 0005_filings.sql — CREATE TYPE beta_filing_status.
 *
 * `overdue` is deliberately absent: spec §2.4 makes "Po splatnosti" a DERIVED
 * fact (`due_on < CURRENT_DATE`), and a stored overdue flag is a value that goes
 * wrong every night at midnight.
 */
export const betaFilingStatus = pgEnum("beta_filing_status", [
  "planned",
  "filed",
  "confirmed",
  "corrective",
])

export type BetaFilingStatus = (typeof betaFilingStatus.enumValues)[number]

/**
 * Mirrors: 0005_filings.sql — CREATE TYPE beta_obligation_group.
 *
 * Creditor grouping for the derived obligations read model (spec §2.4).
 * `dodavatele` is produced by the partner_saldo source (PR 28) — no filing kind
 * maps to it and none ever will; it is declared now so the union contract in
 * `lib/data/obligations.ts` is complete before the second source arrives.
 */
export const betaObligationGroup = pgEnum("beta_obligation_group", [
  "fu",
  "cssz_zp",
  "dodavatele",
  "ostatni",
])

export type BetaObligationGroup =
  (typeof betaObligationGroup.enumValues)[number]

/**
 * Mirrors: 0007_import_spine.sql — CREATE TYPE beta_import_dataset.
 *
 * The datasets that arrive as BATCHES (spec §4). All five are declared now and
 * three are implemented: `predvaha` → `trial_balance_line`, `rozvaha` / `vzz` →
 * `statement_line`. `saldokonto` (PR 27) and `payroll` (PR 29) add a payload
 * table and a write path, not a new publish semantic.
 *
 * Filings, liabilities, client tasks, assets and indicators are ingestion
 * ENDPOINTS (§3.2) but not datasets: none of them is a period-versioned
 * snapshot, so none of them has a publish state.
 */
export const betaImportDataset = pgEnum("beta_import_dataset", [
  "predvaha",
  "rozvaha",
  "vzz",
  "saldokonto",
  "payroll",
])

export type BetaImportDataset = (typeof betaImportDataset.enumValues)[number]

/**
 * Mirrors: 0007_import_spine.sql — CREATE TYPE beta_import_status.
 *
 * Spec §3.2: "draft → published → superseded batches". `superseded` is not
 * deleted — it is the answer to "what did the client see before the
 * correction?", which is the question rollback exists to act on.
 */
export const betaImportStatus = pgEnum("beta_import_status", [
  "draft",
  "published",
  "superseded",
])

export type BetaImportStatus = (typeof betaImportStatus.enumValues)[number]

/**
 * Mirrors: 0007_import_spine.sql — CREATE TYPE beta_import_source.
 *
 * Spec §3.2: the office agent is the feeding channel, with a manual file drop as
 * the fallback. The two are recorded apart because they fail differently and the
 * completeness matrix triages them differently.
 */
export const betaImportSource = pgEnum("beta_import_source", [
  "agent",
  "manual",
])

export type BetaImportSource = (typeof betaImportSource.enumValues)[number]

/**
 * Mirrors: 0007_import_spine.sql — CREATE TYPE beta_statement_kind.
 *
 * Aktiva and pasiva are separate kinds because they do not share a column shape:
 * aktiva is printed in brutto / korekce / netto / minulé období, pasiva and VZZ
 * in běžné / minulé (Advisor F7/F8, verified against the monorepo's own ColKey
 * union in `apps/web/app/vykazy/_lib/types.ts`). One kind with a side flag would
 * make the `statement_line_column_shape` CHECK unstatable.
 */
export const betaStatementKind = pgEnum("beta_statement_kind", [
  "rozvaha_aktiva",
  "rozvaha_pasiva",
  "vzz",
])

export type BetaStatementKind = (typeof betaStatementKind.enumValues)[number]

/**
 * Mirrors: 0008_assets.sql — CREATE TYPE beta_asset_category.
 *
 * Spec §2.7 Přehled majetku column ("kategorie: Stroj/Vozidlo/Nářadí/
 * Nemovitost/Ostatní"), spelled in English like `betaDocumentType` — a
 * classification this application invented, not a legal document name. Czech
 * display labels live in `messages/cs.json`.
 */
export const betaAssetCategory = pgEnum("beta_asset_category", [
  "machine",
  "vehicle",
  "tool",
  "real_estate",
  "other",
])

export type BetaAssetCategory = (typeof betaAssetCategory.enumValues)[number]

/** Mirrors: 0008_assets.sql — CREATE TYPE beta_asset_status. Spec §2.7, verbatim. */
export const betaAssetStatus = pgEnum("beta_asset_status", [
  "in_use",
  "disposed",
])

export type BetaAssetStatus = (typeof betaAssetStatus.enumValues)[number]

/**
 * Mirrors: 0008_assets.sql — CREATE TYPE beta_asset_event_kind.
 *
 * Spec §2.7 Karta majetku event history: "Zařazení/TZ/Vyřazení: datum,
 * částka, poznámka".
 */
export const betaAssetEventKind = pgEnum("beta_asset_event_kind", [
  "put_into_service",
  "improvement",
  "disposal",
])

export type BetaAssetEventKind = (typeof betaAssetEventKind.enumValues)[number]

/**
 * Mirrors: 0009_client_tasks.sql — CREATE TYPE beta_client_task_status.
 *
 * A template never reaches `done` (0009's `client_task_template_never_done`
 * CHECK) — this is a real task's own two-state lifecycle, spec §2.1's "open
 * client_tasks" being exactly `status = 'open'`.
 */
export const betaClientTaskStatus = pgEnum("beta_client_task_status", [
  "open",
  "done",
])

export type BetaClientTaskStatus =
  (typeof betaClientTaskStatus.enumValues)[number]

/**
 * Mirrors: 0009_client_tasks.sql — CREATE TYPE beta_client_task_link_kind.
 *
 * A CLOSED list of modules that already have a route in this app — see the
 * migration's own comment on why a value is added only together with its
 * route.
 */
export const betaClientTaskLinkKind = pgEnum("beta_client_task_link_kind", [
  "none",
  "dokumenty",
  "dane",
])

export type BetaClientTaskLinkKind =
  (typeof betaClientTaskLinkKind.enumValues)[number]
