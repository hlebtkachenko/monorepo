import "server-only"

import { and, asc, eq, sql } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import {
  partner,
  type BetaPartnerRole,
  type BetaPartnerSource,
} from "@/db/schema"

import {
  partnerSaldoView,
  partnerView,
  reportingPeriodView,
  type ImportBatchView,
  type PartnerSaldoView,
  type PartnerView,
  type ReportingPeriodView,
} from "./projections"
import { publishedBatchFor, publishedPeriodsForDataset } from "./imports"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * The partner registry and the saldokonto it is fed by (spec §2.4 "Pohledávky a
 * závazky" / "Partneři", §3.2, §4).
 *
 * TWO THINGS WITH DIFFERENT LIFETIMES, IN ONE MODULE because one write path
 * touches both. A PARTNER is an identity: it outlives every period it appears
 * in, carries the office's own notes and (PR 29) an ARES stamp, and is upserted
 * in place. A SALDO is a measurement of one period: it belongs to an
 * `import_batch`, is frozen once that batch leaves draft, and is superseded
 * wholesale when the office re-publishes the month. The saldokonto ingest does
 * both — upsert the identities, publish the measurements — which is why the
 * reads and the upsert live next to each other rather than in two files that
 * would have to agree about the match rules.
 *
 * READS ARE FOR EVERY ROLE, WRITES TAKE AN `OwnerScope`. §5 makes guest an
 * external viewer of the same client-visible data and Pohledávky is
 * client-visible; §3.3 makes the office the only editing home. The gate is the
 * PARAMETER TYPE, as in `liabilities.ts` and `imports.ts`: only `requireOwner`
 * (and `resolveAgentOwnerScope`, the office agent's non-interactive form of the
 * same authority) mints the brand, so reaching a write with a client's handle is
 * a compile error rather than a forgotten runtime check.
 *
 * ═══ THE MATCH ORDER, AND WHY IT IS NOT A NAME ═══
 *
 * An import run states a partner and this module has to decide whether that is a
 * row it already has. Two keys, tried in this order, and never a third:
 *
 *   1. `external_ref` — the office system's own id, exactly as on every other
 *      registry the ingestion API upserts into (migration 0011). It is the only
 *      key that means anything for a counterparty with no IČO at all: a foreign
 *      supplier, a natural person.
 *   2. `ico` — a GENUINE natural key, not a content-matching heuristic. An IČO
 *      identifies a legal person, so two partners carrying the same one in the
 *      same book ARE the same counterparty; splitting them would split one
 *      supplier's saldo across two lines of Pohledávky, and the client would
 *      read two smaller debts instead of one real one. It is also what lets an
 *      import ADOPT a partner the office typed by hand (`external_ref IS NULL`)
 *      rather than shadow it with a duplicate — which is precisely §2.4's
 *      "auto-fed from saldokonto + office edits" working as one registry.
 *
 * A NAME IS NEVER A MATCH KEY. Two real counterparties can share a name, one
 * counterparty is spelled three ways across three exports, and matching on
 * either outcome is the read model guessing at identity — the same rule
 * `agent-ingest.ts` states for filings ("MATCHED ON `externalRef`, NEVER ON
 * CONTENT"). Guessing wrong merges two companies' debts into one row, which is
 * the worst error this surface can make.
 *
 * A SECOND SOURCE ID ON ONE IČO IS REFUSED, not re-pointed. When the IČO match
 * lands on a partner that already carries a DIFFERENT `external_ref`, two source
 * rows are claiming one legal person: re-pointing would move that partner's
 * whole saldo history under a new id, and creating a second row would violate
 * `partner_ico_idx` anyway. The caller turns it into `identity_changed` and the
 * office fixes its own source, which is the only place the ambiguity can be
 * resolved.
 *
 * NOTHING HERE COMPUTES A NUMBER (spec §0.2). The two totals are stored
 * verbatim, the page totals are SQL window sums over exactly the rows returned,
 * and the aging band is a `CASE` over `CURRENT_DATE - oldest_due` — a
 * classification of a date, never an arithmetic on money.
 */

// ---------------------------------------------------------------------------
// Reads — the registry
// ---------------------------------------------------------------------------

const PARTNER_COLUMNS = {
  id: partner.id,
  name: partner.name,
  ico: partner.ico,
  dic: partner.dic,
  partner_role: partner.partner_role,
  email: partner.email,
  phone: partner.phone,
  street: partner.street,
  house_number: partner.house_number,
  orientation_number: partner.orientation_number,
  city: partner.city,
  postal_code: partner.postal_code,
  country_code: partner.country_code,
  legal_form_csu_code: partner.legal_form_csu_code,
  registry_file_number: partner.registry_file_number,
  ares_fetched_at: partner.ares_fetched_at,
  note_client: partner.note_client,
  source: partner.source,
  updated_at: partner.updated_at,
  // `note_internal` and `external_ref` are deliberately not selected. Both are
  // on CLIENT_FORBIDDEN_COLUMNS; not selecting them means no projection built
  // from this row can leak one even by accident.
}

/**
 * Every partner of the organization, by name.
 *
 * The registry is small (a construction client's supplier list is tens of rows,
 * not thousands) and Partneři renders all of it, so there is no pagination here
 * and no filter parameter invented ahead of the surface that would use one.
 */
export async function partnersForScope(
  scope: OrgScope,
): Promise<PartnerView[]> {
  const rows = await betaDb()
    .select(PARTNER_COLUMNS)
    .from(partner)
    .where(eq(partner.organization_id, scope.organizationId))
    .orderBy(asc(partner.name), asc(partner.id))

  return rows.map(partnerView)
}

/**
 * The registry, WITH each partner's office-only note — Zadávání dat's own
 * read (spec §3.3's editing home for `partner`). `OwnerScope`, not `OrgScope`:
 * the gate is the parameter type, the same discipline `documents-office.ts`
 * uses, so this cannot be reached with a client's handle even by mistake.
 */
export async function partnersForOwner(
  owner: OwnerScope,
): Promise<(PartnerView & { readonly noteInternal: string })[]> {
  const rows = await betaDb()
    .select(PARTNER_DETAIL_COLUMNS)
    .from(partner)
    .where(eq(partner.organization_id, owner.organizationId))
    .orderBy(asc(partner.name), asc(partner.id))

  return rows.map((row) => ({
    ...partnerView(row),
    noteInternal: row.note_internal ?? "",
  }))
}

// ---------------------------------------------------------------------------
// Reads — the saldokonto
// ---------------------------------------------------------------------------

/**
 * The §2.4 aging bands, derived from the ONE date the office states.
 *
 * The boundaries are the ones a Czech saldokonto is read in (do splatnosti /
 * 1-30 / 31-90 / 90+). `CURRENT_DATE - oldest_due` is a whole number of days, so
 * the bands are disjoint by construction and a row on a boundary falls in the
 * lower one — `oldest_due = CURRENT_DATE` is NOT yet overdue, exactly as
 * `obligations.ts` derives "Po splatnosti" from `due_on < CURRENT_DATE`.
 */
const AGING = sql`
  CASE
    WHEN ps.oldest_due IS NULL                       THEN 'unknown'
    WHEN ps.oldest_due >= CURRENT_DATE               THEN 'not_due'
    WHEN CURRENT_DATE - ps.oldest_due <= 30          THEN 'days_1_30'
    WHEN CURRENT_DATE - ps.oldest_due <= 90          THEN 'days_31_90'
    ELSE 'days_over_90'
  END`

type SaldoRow = {
  id: string
  partner_id: string
  partner_name: string
  partner_ico: string | null
  partner_role: BetaPartnerRole
  receivable_total: string | null
  payable_total: string | null
  oldest_due: string | null
  aging: PartnerSaldoView["aging"]
  days_overdue: number | null
  total_receivable: string
  total_payable: string
}

/**
 * The rows of one saldokonto batch, joined to their partners.
 *
 * The two page totals ride along as `SUM(...) OVER ()` window values rather than
 * a second round trip: computed once, by Postgres, over exactly the rows being
 * returned. That is §0.2's "presentation-level SQL over provided rows" satisfied
 * without a money value ever entering JavaScript arithmetic — the same shape
 * `obligations.ts` uses for its own totals.
 *
 * `COALESCE(..., 0)` on the window sums covers the all-NULL column case (an
 * export that stated only payables): `SUM` of nothing is NULL, and the page
 * needs a figure to print. It is a constant substituted for an empty set, not a
 * derived number.
 */
function saldoRowsQuery(organizationId: string, batchId: string) {
  return sql<SaldoRow>`
    SELECT
      ps.id,
      ps.partner_id,
      p.name                                        AS partner_name,
      p.ico                                         AS partner_ico,
      p.partner_role::text                          AS partner_role,
      ps.receivable_total::text                     AS receivable_total,
      ps.payable_total::text                        AS payable_total,
      ps.oldest_due::text                           AS oldest_due,
      ${AGING}                                      AS aging,
      CASE
        WHEN ps.oldest_due IS NULL THEN NULL
        ELSE GREATEST(CURRENT_DATE - ps.oldest_due, 0)
      END                                           AS days_overdue,
      COALESCE(SUM(ps.receivable_total) OVER (),
               0::numeric(14,2))::text              AS total_receivable,
      COALESCE(SUM(ps.payable_total) OVER (),
               0::numeric(14,2))::text              AS total_payable
    FROM partner_saldo ps
    JOIN partner p
      ON p.id = ps.partner_id
     AND p.organization_id = ps.organization_id
    WHERE ps.organization_id = ${organizationId}
      AND ps.import_batch_id = ${batchId}
    -- Name first, so the page reads as the partner list it is; the id breaks a
    -- duplicate-name tie deterministically, so two renders of an unchanged book
    -- never reorder the table under the reader.
    ORDER BY p.name ASC, ps.id ASC
  `
}

/**
 * Finance › Pohledávky a závazky, as the page renders it (spec §2.4).
 *
 * THE NEWEST PUBLISHED PERIOD, AND ONLY IT. §2.4 stamps this surface with "the
 * import period" and gives it no period picker (unlike Výkazy, §2.5) — a
 * saldokonto is a position as of a date, and the question a client opens this
 * page with is "who owes what right now", not "what did 03/2026 look like". The
 * per-partner history across periods is `partnerSaldoHistory` below, which the
 * Partneři detail (PR 29) reads.
 *
 * `period === null` is the honest answer for an organization the office has not
 * sent a saldokonto for, and §0.4 says the page renders it as "zatím nebylo
 * nahráno" rather than as an empty table that looks like "nobody owes anything".
 */
export type SaldokontoView = {
  /** The period the newest published batch covers, or null when there is none. */
  readonly period: ReportingPeriodView | null
  /** The batch itself — its `publishedAt` is the §0.4 stamp. Null iff `period` is. */
  readonly batch: ImportBatchView | null
  readonly rows: readonly PartnerSaldoView[]
  /** SQL window sums over exactly `rows`. `numeric(14,2)` as strings. */
  readonly totals: {
    readonly receivable: string
    readonly payable: string
  }
}

const ZERO = "0.00"

export async function saldokontoForScope(
  scope: OrgScope,
): Promise<SaldokontoView> {
  const periods = await publishedPeriodsForDataset(scope, "saldokonto")
  const period = periods[0] ?? null

  if (!period) {
    return {
      period: null,
      batch: null,
      rows: [],
      totals: { receivable: ZERO, payable: ZERO },
    }
  }

  const batch = await publishedBatchFor(scope, {
    periodId: period.id,
    dataset: "saldokonto",
  })
  if (!batch) {
    // Unreachable: `publishedPeriodsForDataset` derives the list FROM published
    // batches. Stated rather than asserted, because the honest answer to "the
    // batch vanished between two statements" is the same empty state, not a
    // crash on a client's page.
    return {
      period,
      batch: null,
      rows: [],
      totals: { receivable: ZERO, payable: ZERO },
    }
  }

  const result = await betaDb().execute(
    saldoRowsQuery(scope.organizationId, batch.id),
  )
  const rows = result as unknown as SaldoRow[]
  const first = rows[0]

  return {
    period,
    batch,
    rows: rows.map(partnerSaldoView),
    totals: {
      receivable: first?.total_receivable ?? ZERO,
      payable: first?.total_payable ?? ZERO,
    },
  }
}

/**
 * One partner's saldo across every published period, newest first — the
 * per-partner history behind the Partneři detail (spec §2.4: "detail: ... +
 * saldi").
 *
 * PUBLISHED BATCHES ONLY, and the filter is in the WHERE clause rather than
 * applied by the caller: a draft is work in progress that no client may watch,
 * exactly as `publishedBatchFor` decides for every other dataset. A superseded
 * batch is excluded too — its rows are what the client saw BEFORE a correction,
 * and a history that interleaved both would show the same period twice with two
 * different numbers.
 */
type SaldoHistoryRow = Omit<SaldoRow, "total_receivable" | "total_payable"> & {
  period_id: string
  period_kind: ReportingPeriodView["kind"]
  period_year: number
  period_month: number | null
  period_quarter: number | null
  period_starts_on: string
  period_ends_on: string
}

export async function partnerSaldoHistory(
  scope: OrgScope,
  partnerId: string,
): Promise<{ period: ReportingPeriodView; saldo: PartnerSaldoView }[]> {
  const result = await betaDb().execute(sql<SaldoHistoryRow>`
    SELECT
      ps.id,
      ps.partner_id,
      p.name                    AS partner_name,
      p.ico                     AS partner_ico,
      p.partner_role::text      AS partner_role,
      ps.receivable_total::text AS receivable_total,
      ps.payable_total::text    AS payable_total,
      ps.oldest_due::text       AS oldest_due,
      ${AGING}                  AS aging,
      CASE
        WHEN ps.oldest_due IS NULL THEN NULL
        ELSE GREATEST(CURRENT_DATE - ps.oldest_due, 0)
      END                       AS days_overdue,
      rp.id                     AS period_id,
      rp.period_kind::text      AS period_kind,
      rp.year                   AS period_year,
      rp.month                  AS period_month,
      rp.quarter                AS period_quarter,
      rp.starts_on::text        AS period_starts_on,
      rp.ends_on::text          AS period_ends_on
    FROM partner_saldo ps
    JOIN partner p
      ON p.id = ps.partner_id
     AND p.organization_id = ps.organization_id
    JOIN import_batch b
      ON b.id = ps.import_batch_id
     AND b.organization_id = ps.organization_id
    JOIN reporting_period rp
      ON rp.id = ps.period_id
     AND rp.organization_id = ps.organization_id
    WHERE ps.organization_id = ${scope.organizationId}
      AND ps.partner_id = ${partnerId}
      AND b.status = 'published'
    ORDER BY rp.ends_on DESC, ps.id ASC
  `)

  return (result as unknown as SaldoHistoryRow[]).map((row) => ({
    period: reportingPeriodView({
      id: row.period_id,
      period_kind: row.period_kind,
      year: row.period_year,
      month: row.period_month,
      quarter: row.period_quarter,
      starts_on: row.period_starts_on,
      ends_on: row.period_ends_on,
    }),
    saldo: partnerSaldoView(row),
  }))
}

// ---------------------------------------------------------------------------
// Writes — the registry (owner / office agent only)
// ---------------------------------------------------------------------------

/** The identity fields an import (or, from PR 29, a form) may state. */
export type PartnerWriteInput = {
  readonly name: string
  /** Eight digits or null (DB CHECK). Also the secondary match key. */
  readonly ico?: string | null
  readonly dic?: string | null
  readonly role?: BetaPartnerRole
  readonly email?: string | null
  readonly phone?: string | null
  readonly street?: string | null
  readonly houseNumber?: string | null
  readonly orientationNumber?: string | null
  readonly city?: string | null
  readonly postalCode?: string | null
  readonly countryCode?: string
  /** ČSÚ právní forma code, as ARES states it (PR 29's prefill). */
  readonly legalFormCsuCode?: string | null
  /** The ARES spisová značka (PR 29's prefill). */
  readonly registryFileNumber?: string | null
  /** The office system's own id — the primary match key. */
  readonly externalRef?: string | null
}

/**
 * What a match found: enough for the caller to tell an update from an adoption
 * from an ambiguity, and nothing more.
 */
export type PartnerMatch = {
  readonly id: string
  readonly source: BetaPartnerSource
  readonly externalRef: string | null
  readonly matchedBy: "external_ref" | "ico"
}

/**
 * Find the partner an import's row refers to — `external_ref`, then `ico`.
 *
 * See the module header for the full rule and for why a name is never tried.
 * Returns `null` when neither key matches, which the caller reads as "create".
 */
export async function partnerForUpsert(
  owner: OwnerScope,
  key: { readonly externalRef: string; readonly ico?: string | null },
  executor: BetaExecutor = betaDb(),
): Promise<PartnerMatch | null> {
  const [byRef] = await executor
    .select({
      id: partner.id,
      source: partner.source,
      external_ref: partner.external_ref,
    })
    .from(partner)
    .where(
      and(
        eq(partner.organization_id, owner.organizationId),
        eq(partner.external_ref, key.externalRef),
      ),
    )
    .limit(1)

  if (byRef) {
    return {
      id: byRef.id,
      source: byRef.source,
      externalRef: byRef.external_ref,
      matchedBy: "external_ref",
    }
  }

  if (!key.ico) return null

  const [byIco] = await executor
    .select({
      id: partner.id,
      source: partner.source,
      external_ref: partner.external_ref,
    })
    .from(partner)
    .where(
      and(
        eq(partner.organization_id, owner.organizationId),
        eq(partner.ico, key.ico),
      ),
    )
    .limit(1)

  return byIco
    ? {
        id: byIco.id,
        source: byIco.source,
        externalRef: byIco.external_ref,
        matchedBy: "ico",
      }
    : null
}

/**
 * Create a partner.
 *
 * `source` is stated by the caller and is FROZEN from here (trigger
 * `partner_freeze_source`): it records where the row came from, and a value
 * that could change under a later import would make that unanswerable.
 */
export async function createPartner(
  owner: OwnerScope,
  input: PartnerWriteInput & { readonly source: BetaPartnerSource },
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string }> {
  const [row] = await executor
    .insert(partner)
    .values({
      organization_id: owner.organizationId,
      name: input.name,
      ico: input.ico ?? null,
      dic: input.dic ?? null,
      ...(input.role ? { partner_role: input.role } : {}),
      email: input.email ?? null,
      phone: input.phone ?? null,
      street: input.street ?? null,
      house_number: input.houseNumber ?? null,
      orientation_number: input.orientationNumber ?? null,
      city: input.city ?? null,
      postal_code: input.postalCode ?? null,
      ...(input.countryCode ? { country_code: input.countryCode } : {}),
      legal_form_csu_code: input.legalFormCsuCode ?? null,
      registry_file_number: input.registryFileNumber ?? null,
      source: input.source,
      external_ref: input.externalRef ?? null,
    })
    .returning({ id: partner.id })

  if (!row) throw new Error("partner insert returned no row")
  return row
}

/**
 * Edit a partner's identity fields.
 *
 * WHAT IS NOT PATCHABLE HERE, and why. `source` is frozen by the database.
 * `note_client` and `note_internal` are absent on purpose: they are the
 * PORTAL's own layer — the office writes them in Zadávání dat (§3.3) about a
 * partner, not in its source system about a supplier — so an import that could
 * write them would silently erase an accountant's note every month. PR 29's
 * form is what edits them, through its own patch type.
 *
 * `"key" in patch` rather than `!== undefined`, exactly as `updateLiability`
 * does: an explicit `{ ico: null }` is "this partner has no IČO after all",
 * which is a different instruction from "leave the IČO alone".
 */
export type PartnerPatch = Partial<PartnerWriteInput>

export async function updatePartner(
  owner: OwnerScope,
  partnerId: string,
  patch: PartnerPatch,
  executor: BetaExecutor = betaDb(),
): Promise<boolean> {
  const values = {
    ...("name" in patch ? { name: patch.name } : {}),
    ...("ico" in patch ? { ico: patch.ico ?? null } : {}),
    ...("dic" in patch ? { dic: patch.dic ?? null } : {}),
    ...("role" in patch ? { partner_role: patch.role } : {}),
    ...("email" in patch ? { email: patch.email ?? null } : {}),
    ...("phone" in patch ? { phone: patch.phone ?? null } : {}),
    ...("street" in patch ? { street: patch.street ?? null } : {}),
    ...("houseNumber" in patch
      ? { house_number: patch.houseNumber ?? null }
      : {}),
    ...("orientationNumber" in patch
      ? { orientation_number: patch.orientationNumber ?? null }
      : {}),
    ...("city" in patch ? { city: patch.city ?? null } : {}),
    ...("postalCode" in patch ? { postal_code: patch.postalCode ?? null } : {}),
    ...("countryCode" in patch ? { country_code: patch.countryCode } : {}),
    ...("legalFormCsuCode" in patch
      ? { legal_form_csu_code: patch.legalFormCsuCode ?? null }
      : {}),
    ...("registryFileNumber" in patch
      ? { registry_file_number: patch.registryFileNumber ?? null }
      : {}),
    ...("externalRef" in patch
      ? { external_ref: patch.externalRef ?? null }
      : {}),
  }

  if (Object.keys(values).length === 0) return true

  // `organization_id` in the WHERE clause even though `id` is a primary key:
  // without it, an id leaked or guessed from anywhere would let a holder of ANY
  // owner scope edit ANY partner, and this database has no RLS behind the seam.
  const updated = await executor
    .update(partner)
    .set(values)
    .where(
      and(
        eq(partner.id, partnerId),
        eq(partner.organization_id, owner.organizationId),
      ),
    )
    .returning({ id: partner.id })

  return updated.length > 0
}

// ---------------------------------------------------------------------------
// Reads / writes — the Partneři detail (PR 29: spec §2.4 "detail: identity +
// address + linked documents + saldi + client-visible note (internal note
// office-only)")
// ---------------------------------------------------------------------------

/**
 * `PartnerView` plus the office's own note — present ONLY when the reader is
 * `owner`, absent (not `null`) for every other role.
 *
 * `noteInternal` is on `CLIENT_FORBIDDEN_COLUMNS` and `PARTNER_COLUMNS` never
 * selects it (see `partnerView`'s own header) precisely so no ordinary read can
 * leak it by accident. `partnerForScope` below is the ONE function that is
 * allowed to hold it in memory, and it only ever puts the key on the returned
 * object when `scope.role === "owner"` — the same "gate is what gets attached
 * to the object" discipline `ownerDocumentDetail` uses via a whole separate
 * type, done here as an optional key because the rest of the shape (identity,
 * address, ARES stamp) is identical for every role.
 */
export type PartnerDetailView = PartnerView & {
  readonly noteInternal?: string
}

const PARTNER_DETAIL_COLUMNS = {
  ...PARTNER_COLUMNS,
  note_internal: partner.note_internal,
}

/** One partner, or null when it does not exist or belongs to another book. */
export async function partnerForScope(
  scope: OrgScope,
  partnerId: string,
): Promise<PartnerDetailView | null> {
  const [row] = await betaDb()
    .select(PARTNER_DETAIL_COLUMNS)
    .from(partner)
    .where(
      and(
        eq(partner.organization_id, scope.organizationId),
        eq(partner.id, partnerId),
      ),
    )
    .limit(1)

  if (!row) return null

  const view = partnerView(row)
  return scope.role === "owner"
    ? { ...view, noteInternal: row.note_internal ?? "" }
    : view
}

/** Whether `partnerId` names a real partner in this scope's own book. */
export async function partnerExists(
  scope: OrgScope,
  partnerId: string,
): Promise<boolean> {
  const [row] = await betaDb()
    .select({ id: partner.id })
    .from(partner)
    .where(
      and(
        eq(partner.organization_id, scope.organizationId),
        eq(partner.id, partnerId),
      ),
    )
    .limit(1)

  return row !== undefined
}

/**
 * The two notes (spec §2.4: "client-visible note (internal note
 * office-only)") — their OWN patch type, deliberately separate from
 * `PartnerPatch`. `updatePartner`'s own header explains why: an import that
 * could touch these would erase an accountant's commentary on every
 * re-publish, so the two writers are split by what may call them, not merely
 * by convention.
 */
export type PartnerNotesPatch = {
  readonly noteClient?: string | null
  readonly noteInternal?: string | null
}

export async function updatePartnerNotes(
  owner: OwnerScope,
  partnerId: string,
  patch: PartnerNotesPatch,
  executor: BetaExecutor = betaDb(),
): Promise<boolean> {
  const values = {
    ...("noteClient" in patch ? { note_client: patch.noteClient ?? null } : {}),
    ...("noteInternal" in patch
      ? { note_internal: patch.noteInternal ?? null }
      : {}),
  }

  if (Object.keys(values).length === 0) return true

  const updated = await executor
    .update(partner)
    .set(values)
    .where(
      and(
        eq(partner.id, partnerId),
        eq(partner.organization_id, owner.organizationId),
      ),
    )
    .returning({ id: partner.id })

  return updated.length > 0
}

/**
 * Stamp the §2.10 ARES cache marker on ONE partner — the per-partner twin of
 * `organization-identity.ts`'s `stampAresFetched`. Written whenever a lookup
 * ran, whether or not any suggestion was accepted (mirrors
 * `lookupAresAction`'s own reasoning: the stamp answers "when did we last ask
 * ARES about this partner", not "when did we last change it").
 */
export async function stampPartnerAresFetched(
  owner: OwnerScope,
  partnerId: string,
  fetchedAt: Date,
  executor: BetaExecutor = betaDb(),
): Promise<void> {
  await executor
    .update(partner)
    .set({ ares_fetched_at: fetchedAt })
    .where(
      and(
        eq(partner.id, partnerId),
        eq(partner.organization_id, owner.organizationId),
      ),
    )
}
