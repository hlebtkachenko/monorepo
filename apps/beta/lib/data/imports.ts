import "server-only"

import { aliasedTable, and, asc, desc, eq, inArray } from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  app_user,
  import_batch,
  reporting_period,
  statement_line,
  trial_balance_line,
  type BetaImportDataset,
  type BetaImportSource,
  type BetaImportStatus,
  type BetaStatementKind,
} from "@/db/schema"
import { isUniqueViolation } from "@/lib/pg-error"

import {
  importBatchView,
  officeImportBatchRow,
  reportingPeriodView,
  statementLineView,
  trialBalanceLineView,
  type ImportBatchView,
  type OfficeImportBatchRow,
  type ReportingPeriodView,
  type StatementLineView,
  type TrialBalanceLineView,
} from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * The import spine — dataset batches and the publish ritual over them
 * (spec §3.2, §4; Advisor F10).
 *
 * ONE MONTH-END RITUAL (spec §0.2). The office's own software already holds
 * every number in this product; the platform's job is to receive a period's
 * worth of them, show the office what it is about to publish, and flip the whole
 * period at once. Everything in this module exists to make that flip ATOMIC from
 * the reader's point of view: rows accumulate in a `draft` no client read ever
 * touches, and one UPDATE changes what the entire product means by "the rozvaha
 * for 07/2026".
 *
 * READS ARE FOR EVERY ROLE, WRITES ARE OWNER-ONLY. §5 makes guest an external
 * viewer of client-visible data, and a published statement is client-visible;
 * §3.3 makes Pro účetní the only editing home. A non-owner additionally never
 * sees a DRAFT: the office has to be able to stage a correction without the
 * client watching it happen.
 *
 * THE GATE IS THE PARAMETER TYPE, not a call at the top of each body. Every
 * write below takes an `OwnerScope` (PR 14's brand), which only
 * `requireOwner()` can mint — so reaching a publish with a member's or a
 * guest's handle is a COMPILE error rather than a convention someone can forget
 * on the next write added here. `lib/data/documents-office.ts` set that shape;
 * this module follows it rather than re-introducing a runtime `assertOwner`.
 * Reads keep taking a bare `OrgScope`, because they are for every role.
 *
 * THE LOCK PROTOCOL, IN ONE PLACE. Every write that can change which batch is
 * published takes exactly ONE lock, and always the same one: the
 * `reporting_period` row for (organization, period), `FOR NO KEY UPDATE`.
 *
 *   - One lock class means no lock-ordering cycle is expressible here, so
 *     nothing in this module can deadlock against itself. (`FOR NO KEY UPDATE`
 *     rather than `FOR UPDATE` so it does not block the foreign-key checks other
 *     tables take against the same period row — the same choice
 *     `lib/data/documents.ts` makes on `organization`.)
 *   - Publishing needs the batch's period BEFORE it can take the lock, which is
 *     only safe because `import_batch_freeze_identity` (migration 0007) makes
 *     `period_id` and `dataset` immutable. The pre-lock read cannot go stale in
 *     the way that matters.
 *   - The lock is NOT what makes the invariant true. That is
 *     `import_batch_one_published_idx`, the partial unique index. The lock makes
 *     the ordinary concurrent case resolve into a clean supersession instead of
 *     a duplicate-key error; the index is the floor under every caller,
 *     including a future one that forgets the lock. `isUniqueViolation` below is
 *     that floor being reported honestly rather than as a 500.
 */

/**
 * The five batch datasets (spec §4), and whether each one has a payload table
 * yet.
 *
 * `implemented: false` is not a placeholder — spec §0.3 forbids those. It is the
 * fact the completeness matrix (§3.2) needs in order to render a dataset that
 * does not exist yet as ABSENT rather than as an empty period, which is the
 * difference between "we have not built this" and "the office has not sent it".
 *
 * Creating a batch for an unimplemented dataset is not merely refused at runtime
 * — `ImportBatchPayload` has no arm for one, so it is a type error.
 */
export const IMPORT_DATASETS: readonly {
  readonly dataset: BetaImportDataset
  readonly implemented: boolean
}[] = Object.freeze([
  { dataset: "predvaha", implemented: true },
  { dataset: "rozvaha", implemented: true },
  { dataset: "vzz", implemented: true },
  // PR 27 (partner + partner_saldo) and PR 29 (payroll_summary +
  // payroll_employee_line) add a payload table and one arm to
  // `ImportBatchPayload`. Neither adds a publish semantic — that is this file.
  { dataset: "saldokonto", implemented: false },
  { dataset: "payroll", implemented: false },
])

// ---------------------------------------------------------------------------
// Write inputs
// ---------------------------------------------------------------------------

/**
 * One řádek of a statutory statement, as the office (or PR 24's agent) states
 * it.
 *
 * EVERY VALUE IS A STRING OR NULL, and is stored verbatim. Beta never computes
 * an accounting number (spec §0.2) — including `netto`, which is arithmetically
 * `brutto − korekce` and is nonetheless taken as given, because the office's
 * software printed that number onto the form the client already has.
 * `numeric(14,2)` rejects a malformed one at the boundary, which is where
 * validation belongs.
 *
 * The type parameter narrows which statement kinds a payload arm accepts, so
 * putting a `vzz` row into a rozvaha batch is a compile error rather than a
 * trigger refusal. The trigger (`statement_line_matches_dataset`) is still the
 * floor under PR 24, whose input arrives as JSON with every type erased.
 */
export type StatementLineInput<
  K extends BetaStatementKind = BetaStatementKind,
> = {
  readonly statementKind: K
  /** Označení, column (a) of the printed form. Blank on a spacer row. */
  readonly ozn?: string | null
  /** Číslo řádku — the form's own identifier for the line. */
  readonly rowCode: string
  /** Column (b), the Czech label as printed. */
  readonly rowLabel: string
  readonly sortOrder: number
  readonly indent?: number
  readonly isBold?: boolean
  /** Rozvaha aktiva only; `numeric(14,2)` as a string. */
  readonly brutto?: string | null
  /** Rozvaha aktiva only. */
  readonly korekce?: string | null
  /** Rozvaha aktiva only — stored as imported, never derived. */
  readonly netto?: string | null
  /** Rozvaha pasiva and VZZ. */
  readonly bezne?: string | null
  readonly minule?: string | null
}

/** One account of an obratová předvaha. Four money strings, none computed. */
export type TrialBalanceLineInput = {
  readonly accountCode: string
  readonly accountName: string
  readonly openingBalance?: string | null
  readonly turnoverDebit?: string | null
  readonly turnoverCredit?: string | null
  readonly closingBalance?: string | null
}

/**
 * The dataset and its rows, as ONE value. Not exported — `ImportBatchInput` is
 * the shape a caller names; this is how it is composed.
 *
 * A discriminated union rather than a batch input with three optional arrays,
 * because the pairing is the thing most worth making unrepresentable: a
 * `predvaha` batch carrying rozvaha rows would publish cleanly, satisfy every
 * constraint on `import_batch`, and then surface under whichever period the
 * reader happened to query by. Here it does not compile.
 */
type ImportBatchPayload =
  | {
      readonly dataset: "rozvaha"
      readonly statementLines: readonly StatementLineInput<
        "rozvaha_aktiva" | "rozvaha_pasiva"
      >[]
    }
  | {
      readonly dataset: "vzz"
      readonly statementLines: readonly StatementLineInput<"vzz">[]
    }
  | {
      readonly dataset: "predvaha"
      readonly trialBalanceLines: readonly TrialBalanceLineInput[]
    }

export type ImportBatchInput = ImportBatchPayload & {
  readonly periodId: string
  /** agent (spec §3.2's feeding channel) or manual (the file-drop fallback). */
  readonly source: BetaImportSource
  /** Manual drops only — `import_batch_manual_has_filename` refuses it otherwise. */
  readonly filename?: string | null
  readonly sha256?: string | null
  /** The office's CSV column mapping. Office-internal, never projected. */
  readonly mapping?: Record<string, unknown> | null
  /** Office-internal "why I re-imported" note. Never projected. */
  readonly noteInternal?: string | null
}

// ---------------------------------------------------------------------------
// Read shapes
// ---------------------------------------------------------------------------

const PERIOD_COLUMNS = {
  period_id: reporting_period.id,
  period_kind: reporting_period.period_kind,
  period_year: reporting_period.year,
  period_month: reporting_period.month,
  period_quarter: reporting_period.quarter,
  period_starts_on: reporting_period.starts_on,
  period_ends_on: reporting_period.ends_on,
}

const BATCH_COLUMNS = {
  id: import_batch.id,
  dataset: import_batch.dataset,
  status: import_batch.status,
  source: import_batch.source,
  filename: import_batch.filename,
  row_count: import_batch.row_count,
  imported_at: import_batch.imported_at,
  published_at: import_batch.published_at,
  superseded_at: import_batch.superseded_at,
  superseded_by_batch_id: import_batch.superseded_by_batch_id,
  // `sha256`, `mapping`, `note_internal` and both user ids are deliberately not
  // selected. Not selecting them means no projection built from this row can
  // leak one even by accident (`forbiddenClientKeys` covers the two that are
  // named columns; the other two are simply not the client's business).
  ...PERIOD_COLUMNS,
}

type BatchRow = {
  id: string
  dataset: BetaImportDataset
  status: BetaImportStatus
  source: BetaImportSource
  filename: string | null
  row_count: number
  imported_at: Date
  published_at: Date | null
  superseded_at: Date | null
  superseded_by_batch_id: string | null
  period_id: string
  period_kind: ReportingPeriodView["kind"]
  period_year: number
  period_month: number | null
  period_quarter: number | null
  period_starts_on: string
  period_ends_on: string
}

function toBatchView(row: BatchRow): ImportBatchView {
  return importBatchView({
    ...row,
    period: reportingPeriodView({
      id: row.period_id,
      period_kind: row.period_kind,
      year: row.period_year,
      month: row.period_month,
      quarter: row.period_quarter,
      starts_on: row.period_starts_on,
      ends_on: row.period_ends_on,
    }),
  })
}

/** The period join, carrying tenancy for the same reason `filings.ts` does. */
const periodJoin = and(
  eq(reporting_period.id, import_batch.period_id),
  eq(reporting_period.organization_id, import_batch.organization_id),
)

/** Which dataset of which period — the key the published-unique index is on. */
export type DatasetTarget = {
  readonly periodId: string
  readonly dataset: BetaImportDataset
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The batch a surface means when it says "the rozvaha for this period".
 *
 * `status = 'published'` is in the WHERE clause, not applied by the caller, and
 * that is the whole of "drafts are never served": there is no way to reach this
 * function's result with a draft in it, so a half-finished import cannot leak
 * into a client page by a caller forgetting a filter. The partial unique index
 * is what makes "the" batch singular.
 *
 * `null` is the honest answer for a period the office has not published, and
 * §0.4 says the surface renders it as "zatím nebylo nahráno" rather than
 * reaching for an older period.
 */
export async function publishedBatchFor(
  scope: OrgScope,
  target: DatasetTarget,
): Promise<ImportBatchView | null> {
  const [row] = await betaDb()
    .select(BATCH_COLUMNS)
    .from(import_batch)
    .innerJoin(reporting_period, periodJoin)
    .where(
      and(
        eq(import_batch.organization_id, scope.organizationId),
        eq(import_batch.period_id, target.periodId),
        eq(import_batch.dataset, target.dataset),
        eq(import_batch.status, "published"),
      ),
    )
    .limit(1)

  return row ? toBatchView(row) : null
}

/**
 * The periods a dataset actually HAS a published batch for, newest first — the
 * list Výkazy's period picker (spec §2.5) is built from.
 *
 * NO DEAD PERIODS, and that is the whole reason this is a separate read rather
 * than `reportingPeriodsForScope` filtered in the page. `reporting_period` rows
 * accumulate from every source in the product (a filing creates one), so the
 * organization's period list is mostly periods Výkazy has nothing for. A picker
 * built from it would offer 07/2026 and then answer "zatím nebylo nahráno" —
 * which is §0.4's honest EMPTY state being used as a dead end, not as
 * information. Here the picker can only offer periods that render something.
 *
 * `status = 'published'` is in the WHERE clause for the same reason it is in
 * `publishedBatchFor`: a draft must not put a period into a client's picker.
 */
export async function publishedPeriodsForDataset(
  scope: OrgScope,
  dataset: BetaImportDataset,
): Promise<ReportingPeriodView[]> {
  const rows = await betaDb()
    .select(PERIOD_COLUMNS)
    .from(import_batch)
    .innerJoin(reporting_period, periodJoin)
    .where(
      and(
        eq(import_batch.organization_id, scope.organizationId),
        eq(import_batch.dataset, dataset),
        eq(import_batch.status, "published"),
      ),
    )
    .orderBy(desc(reporting_period.ends_on))

  return rows.map((row) =>
    reportingPeriodView({
      id: row.period_id,
      period_kind: row.period_kind,
      year: row.period_year,
      month: row.period_month,
      quarter: row.period_quarter,
      starts_on: row.period_starts_on,
      ends_on: row.period_ends_on,
    }),
  )
}

export type BatchHistoryFilter = {
  readonly dataset?: BetaImportDataset
  readonly periodId?: string
}

/**
 * Batch history (spec §3.2), newest import first.
 *
 * OWNER SEES DRAFTS, NOBODY ELSE DOES. The history of what the office published
 * is client-visible — it is the audit trail behind the numbers on the client's
 * own screen — but a draft is work in progress, and a client watching a
 * correction being staged would be reading a number nobody has stood behind yet.
 */
export async function batchHistoryForScope(
  scope: OrgScope,
  filter: BatchHistoryFilter = {},
): Promise<ImportBatchView[]> {
  const visibleStatuses: BetaImportStatus[] =
    scope.role === "owner"
      ? ["draft", "published", "superseded"]
      : ["published", "superseded"]

  const rows = await betaDb()
    .select(BATCH_COLUMNS)
    .from(import_batch)
    .innerJoin(reporting_period, periodJoin)
    .where(
      and(
        eq(import_batch.organization_id, scope.organizationId),
        inArray(import_batch.status, visibleStatuses),
        filter.dataset ? eq(import_batch.dataset, filter.dataset) : undefined,
        filter.periodId
          ? eq(import_batch.period_id, filter.periodId)
          : undefined,
      ),
    )
    .orderBy(desc(import_batch.imported_at), desc(import_batch.id))

  return rows.map(toBatchView)
}

/**
 * The SAME history, plus WHO — the office's own view of it (spec §3.2: "batch
 * history with diffs, publish/rollback buttons").
 *
 * A SECOND FUNCTION RATHER THAN A FLAG ON THE FIRST, and a second projection
 * rather than a widened `ImportBatchView`. `ImportBatchView`'s own header says
 * the two user id columns are absent because "a client tier must not be handed
 * the office's user ids", and names the office review surface as the thing that
 * "joins `app_user` and projects them". This is that join. Keeping it apart
 * means the client shape cannot acquire a `publishedByName` by someone adding a
 * field to the wrong projection: the office read takes an `OwnerScope`, so a
 * page holding a bare `OrgScope` cannot call it at all.
 *
 * IT STILL SHIPS NO USER ID — a name and nothing else. The office needs to know
 * which colleague published a batch; nothing on this surface needs to address
 * that person, and an id in a payload is an invitation for the next feature to
 * accept one back.
 *
 * `agent`-sourced batches have no `imported_by_user_id` at all (PR 24 posts
 * under an office agent key, not a session), so a null name is the ordinary
 * case here and renders as the SOURCE — "agent" — not as an unknown human.
 */
export async function officeBatchHistoryFor(
  scope: OwnerScope,
  filter: BatchHistoryFilter = {},
): Promise<OfficeImportBatchRow[]> {
  const rows = await officeBatchQuery(
    and(
      eq(import_batch.organization_id, scope.organizationId),
      filter.dataset ? eq(import_batch.dataset, filter.dataset) : undefined,
      filter.periodId ? eq(import_batch.period_id, filter.periodId) : undefined,
    ),
  )
  return rows.map(toOfficeBatchRow)
}

/**
 * ONE batch by id, for the office's batch preview.
 *
 * OWNER-ONLY, and that is the whole visibility rule this read needs: the page
 * it serves shows a DRAFT's rows (the manual fallback's preview step, spec
 * §3.2), and a draft is work in progress no client may watch. A read that took
 * a bare `OrgScope` would have to re-decide that per caller; taking an
 * `OwnerScope` makes it a compile error to ask from anywhere else.
 *
 * `null` covers "another organization's" and "does not exist" identically —
 * the same non-oracle `requireScope` keeps everywhere.
 */
export async function officeBatchFor(
  scope: OwnerScope,
  batchId: string,
): Promise<OfficeImportBatchRow | null> {
  const [row] = await officeBatchQuery(
    and(
      eq(import_batch.id, batchId),
      eq(import_batch.organization_id, scope.organizationId),
    ),
  )
  return row ? toOfficeBatchRow(row) : null
}

/** The office join, written once so the two reads above cannot drift. */
function officeBatchQuery(where: ReturnType<typeof and>) {
  const importedBy = aliasedTable(app_user, "imported_by")
  const publishedBy = aliasedTable(app_user, "published_by")

  return betaDb()
    .select({
      ...BATCH_COLUMNS,
      imported_by_name: importedBy.name,
      published_by_name: publishedBy.name,
    })
    .from(import_batch)
    .innerJoin(reporting_period, periodJoin)
    .leftJoin(importedBy, eq(importedBy.id, import_batch.imported_by_user_id))
    .leftJoin(
      publishedBy,
      eq(publishedBy.id, import_batch.published_by_user_id),
    )
    .where(where)
    .orderBy(desc(import_batch.imported_at), desc(import_batch.id))
}

function toOfficeBatchRow(
  row: BatchRow & {
    imported_by_name: string | null
    published_by_name: string | null
  },
): OfficeImportBatchRow {
  return officeImportBatchRow(toBatchView(row), {
    importedByName: row.imported_by_name,
    publishedByName: row.published_by_name,
  })
}

/**
 * The §0.4 freshness contract, per dataset: when this organization last had each
 * dataset published, and for which period.
 *
 * ONE ROW PER DATASET, ALWAYS — built from `IMPORT_DATASETS`, not from the
 * query. A dataset the office has never sent has to appear with `publishedAt:
 * null`, or the surface cannot tell "nothing has been imported" apart from "this
 * dataset does not exist", and §0.4's warning band ("Poslední údaje k <date> —
 * novější zatím nebyly nahrány") has nothing to compare against.
 *
 * NEWEST BY PERIOD, NOT BY PUBLICATION TIME. The office publishing March in
 * April, after April, does not make March the current period — `ends_on DESC` is
 * the ordering the client's question ("how up to date are my numbers?") is
 * actually about. `published_at` still rides along as the as-of stamp, because
 * that is when the office stood behind it.
 */
export type DatasetFreshness = {
  dataset: BetaImportDataset
  /** False until the dataset has a payload table — see `IMPORT_DATASETS`. */
  implemented: boolean
  /** The newest published period, or null when the office has sent none. */
  period: ReportingPeriodView | null
  /** ISO instant the office published it. Null iff `period` is null. */
  publishedAt: string | null
  batchId: string | null
  rowCount: number
}

export async function datasetFreshnessForScope(
  scope: OrgScope,
): Promise<DatasetFreshness[]> {
  const rows = await betaDb()
    .selectDistinctOn([import_batch.dataset], BATCH_COLUMNS)
    .from(import_batch)
    .innerJoin(reporting_period, periodJoin)
    .where(
      and(
        eq(import_batch.organization_id, scope.organizationId),
        eq(import_batch.status, "published"),
      ),
    )
    .orderBy(
      asc(import_batch.dataset),
      desc(reporting_period.ends_on),
      desc(import_batch.published_at),
    )

  const newestByDataset = new Map(
    rows.map((row) => [row.dataset, toBatchView(row)]),
  )

  return IMPORT_DATASETS.map(({ dataset, implemented }) => {
    const batch = newestByDataset.get(dataset) ?? null
    return {
      dataset,
      implemented,
      period: batch?.period ?? null,
      publishedAt: batch?.publishedAt ?? null,
      batchId: batch?.id ?? null,
      rowCount: batch?.rowCount ?? 0,
    }
  })
}

/**
 * Whether this scope may read the payload of `batchId`, and nothing else.
 *
 * Returns the batch id rather than a boolean so the callers below can use it as
 * their WHERE clause and take tenancy + visibility in one round trip. A batch of
 * another organization, and a draft read by anyone but the owner, are both
 * simply absent — the payload reads then return `[]`, which is the same answer
 * the reader would get for an empty batch. Nothing distinguishes "not yours"
 * from "not there", for the same reason `requireScope` answers 404 six ways.
 */
async function readableBatchId(
  scope: OrgScope,
  batchId: string,
): Promise<string | null> {
  const [row] = await betaDb()
    .select({ id: import_batch.id })
    .from(import_batch)
    .where(
      and(
        eq(import_batch.id, batchId),
        eq(import_batch.organization_id, scope.organizationId),
        scope.role === "owner"
          ? undefined
          : inArray(import_batch.status, ["published", "superseded"]),
      ),
    )
    .limit(1)

  return row?.id ?? null
}

/**
 * Every řádek of a statement batch, in printed order.
 *
 * `sort_order` then `row_code`: the office's own ordering first, with the form's
 * line number as the tiebreak, so two rows that were given the same sort_order
 * still come out deterministically rather than in whatever order the heap
 * returned them.
 */
export async function statementLinesForBatch(
  scope: OrgScope,
  batchId: string,
  filter: { readonly statementKind?: BetaStatementKind } = {},
): Promise<StatementLineView[]> {
  const readable = await readableBatchId(scope, batchId)
  if (!readable) return []

  const rows = await betaDb()
    .select({
      id: statement_line.id,
      statement_kind: statement_line.statement_kind,
      ozn: statement_line.ozn,
      row_code: statement_line.row_code,
      row_label: statement_line.row_label,
      indent: statement_line.indent,
      is_bold: statement_line.is_bold,
      value_brutto: statement_line.value_brutto,
      value_korekce: statement_line.value_korekce,
      value_netto: statement_line.value_netto,
      value_bezne: statement_line.value_bezne,
      value_minule: statement_line.value_minule,
    })
    .from(statement_line)
    .where(
      and(
        eq(statement_line.import_batch_id, readable),
        // Redundant with the composite FK, written anyway: this is the place a
        // future migration relaxing that FK would silently start leaking.
        eq(statement_line.organization_id, scope.organizationId),
        filter.statementKind
          ? eq(statement_line.statement_kind, filter.statementKind)
          : undefined,
      ),
    )
    .orderBy(asc(statement_line.sort_order), asc(statement_line.row_code))

  return rows.map(statementLineView)
}

/** Every account of a předvaha batch, by account code. */
export async function trialBalanceLinesForBatch(
  scope: OrgScope,
  batchId: string,
): Promise<TrialBalanceLineView[]> {
  const readable = await readableBatchId(scope, batchId)
  if (!readable) return []

  const rows = await betaDb()
    .select({
      id: trial_balance_line.id,
      account_code: trial_balance_line.account_code,
      account_name: trial_balance_line.account_name,
      opening_balance: trial_balance_line.opening_balance,
      turnover_debit: trial_balance_line.turnover_debit,
      turnover_credit: trial_balance_line.turnover_credit,
      closing_balance: trial_balance_line.closing_balance,
    })
    .from(trial_balance_line)
    .where(
      and(
        eq(trial_balance_line.import_batch_id, readable),
        eq(trial_balance_line.organization_id, scope.organizationId),
      ),
    )
    .orderBy(asc(trial_balance_line.account_code))

  return rows.map(trialBalanceLineView)
}

// ---------------------------------------------------------------------------
// Office writes (spec §3.2 / §3.3)
// ---------------------------------------------------------------------------

/**
 * Create a draft batch and write its rows, in ONE transaction.
 *
 * The batch and its payload land together or not at all. A partial draft would
 * be invisible to clients (drafts are not served) but not to the office, which
 * would then publish half a rozvaha — and a published statement whose bilanční
 * suma does not foot is worse than no statement, because it looks like an
 * accounting error rather than an import error.
 *
 * `period_id` is taken as an id, so a caller cannot name another organization's
 * period without having held a scope for it: `import_batch_period_fk` carries
 * `organization_id` and refuses the insert outright (23503) rather than writing
 * a silently-wrong row.
 *
 * The rows go in as ONE multi-row INSERT. A 300-line předvaha is one statement,
 * not 300 round trips — which matters because the BEFORE INSERT trigger that
 * enforces "payload belongs to a draft" runs per row either way.
 */
export async function createDraftBatch(
  scope: OwnerScope,
  input: ImportBatchInput,
): Promise<{ id: string; rowCount: number }> {
  const rowCount =
    input.dataset === "predvaha"
      ? input.trialBalanceLines.length
      : input.statementLines.length

  return betaDb().transaction(async (tx) => {
    const [batch] = await tx
      .insert(import_batch)
      .values({
        organization_id: scope.organizationId,
        period_id: input.periodId,
        dataset: input.dataset,
        status: "draft",
        source: input.source,
        filename: input.filename ?? null,
        sha256: input.sha256 ?? null,
        row_count: rowCount,
        mapping: input.mapping ?? null,
        note_internal: input.noteInternal ?? null,
        imported_by_user_id: scope.userId,
      })
      .returning({ id: import_batch.id })

    if (!batch) throw new Error("import batch insert returned no row")

    if (input.dataset === "predvaha") {
      if (input.trialBalanceLines.length > 0) {
        await tx.insert(trial_balance_line).values(
          input.trialBalanceLines.map((line) => ({
            organization_id: scope.organizationId,
            import_batch_id: batch.id,
            period_id: input.periodId,
            account_code: line.accountCode,
            account_name: line.accountName,
            opening_balance: line.openingBalance ?? null,
            turnover_debit: line.turnoverDebit ?? null,
            turnover_credit: line.turnoverCredit ?? null,
            closing_balance: line.closingBalance ?? null,
          })),
        )
      }
    } else if (input.statementLines.length > 0) {
      await tx.insert(statement_line).values(
        input.statementLines.map((line) => ({
          organization_id: scope.organizationId,
          import_batch_id: batch.id,
          period_id: input.periodId,
          statement_kind: line.statementKind,
          ozn: line.ozn ?? null,
          row_code: line.rowCode,
          row_label: line.rowLabel,
          sort_order: line.sortOrder,
          indent: line.indent ?? 0,
          is_bold: line.isBold ?? false,
          value_brutto: line.brutto ?? null,
          value_korekce: line.korekce ?? null,
          value_netto: line.netto ?? null,
          value_bezne: line.bezne ?? null,
          value_minule: line.minule ?? null,
        })),
      )
    }

    return { id: batch.id, rowCount }
  })
}

export type PublishRefusal =
  /** No batch with that id in this organization. */
  | "unknown_batch"
  /**
   * The batch was published once and has already been replaced. Re-publishing it
   * is not a publish — it is a rollback of everything since, and spec §3.2 gives
   * that its own operation with its own button.
   */
  | "already_superseded"
  /**
   * `import_batch_one_published_idx` refused. Unreachable while every caller
   * takes the period lock; reported rather than thrown so the floor under the
   * lock is visible instead of arriving as a 500.
   */
  | "conflict"

export type PublishOutcome =
  | {
      readonly ok: true
      readonly batchId: string
      /** The batch this publish replaced, or null when the key was empty. */
      readonly supersededBatchId: string | null
      /** It was already the published batch — the call changed nothing. */
      readonly alreadyPublished: boolean
    }
  | { readonly ok: false; readonly reason: PublishRefusal }

/**
 * Publish a draft: supersede whatever this key currently has, and put this batch
 * in its place. One transaction, so no reader ever sees zero or two.
 *
 * WHAT CONCURRENCY DOES TO IT (two connections, same key):
 *
 *   - SAME batch twice — one publishes; the other takes the lock afterwards,
 *     finds itself already published, and returns `alreadyPublished: true`
 *     having written nothing. Re-publish is idempotent, which is spec §3.2's
 *     word, and it matters because PR 24's agent will retry a request whose
 *     response it did not see.
 *   - DIFFERENT batches — the lock serialises them. The first publishes; the
 *     second supersedes the first and publishes itself. Both calls succeed,
 *     exactly one batch is published, and the supersession chain records what
 *     happened. There is no version of this that should be an error: both
 *     imports were real, and the second one is the newer truth.
 *
 * Either way the end state is exactly one published batch for the key — asserted
 * from two live connections in `lib/data/imports.test.ts`.
 */
export async function publishBatch(
  scope: OwnerScope,
  batchId: string,
): Promise<PublishOutcome> {
  try {
    return await betaDb().transaction(async (tx) => {
      // Pre-lock read, safe only because `import_batch_freeze_identity` makes
      // (period_id, dataset) immutable: the coordinates this lock is taken on
      // cannot change under it.
      const [target] = await tx
        .select({
          id: import_batch.id,
          period_id: import_batch.period_id,
          dataset: import_batch.dataset,
        })
        .from(import_batch)
        .where(
          and(
            eq(import_batch.id, batchId),
            eq(import_batch.organization_id, scope.organizationId),
          ),
        )
        .limit(1)

      if (!target)
        return { ok: false as const, reason: "unknown_batch" as const }

      await lockPeriod(tx, scope, target.period_id)

      // Re-read AFTER the lock. Between the read above and the lock, another
      // connection may have published this very batch (the idempotent case) or
      // superseded it.
      const [current] = await tx
        .select({ status: import_batch.status })
        .from(import_batch)
        .where(eq(import_batch.id, target.id))
        .limit(1)

      if (!current)
        return { ok: false as const, reason: "unknown_batch" as const }
      if (current.status === "published") {
        return {
          ok: true as const,
          batchId: target.id,
          supersededBatchId: null,
          alreadyPublished: true,
        }
      }
      if (current.status === "superseded") {
        return { ok: false as const, reason: "already_superseded" as const }
      }

      const [incumbent] = await tx
        .select({ id: import_batch.id })
        .from(import_batch)
        .where(
          and(
            eq(import_batch.organization_id, scope.organizationId),
            eq(import_batch.period_id, target.period_id),
            eq(import_batch.dataset, target.dataset),
            eq(import_batch.status, "published"),
          ),
        )
        .limit(1)

      // ORDER MATTERS. The incumbent has to LEAVE `published` before the new
      // batch enters it: `import_batch_one_published_idx` is a plain unique
      // index, checked per statement, not deferred to commit.
      if (incumbent) {
        await tx
          .update(import_batch)
          .set({
            status: "superseded",
            superseded_at: new Date(),
            superseded_by_batch_id: target.id,
          })
          .where(eq(import_batch.id, incumbent.id))
      }

      await tx
        .update(import_batch)
        .set({
          status: "published",
          published_at: new Date(),
          published_by_user_id: scope.userId,
        })
        .where(eq(import_batch.id, target.id))

      return {
        ok: true as const,
        batchId: target.id,
        supersededBatchId: incumbent?.id ?? null,
        alreadyPublished: false,
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "conflict" }
    }
    throw error
  }
}

export type RollbackOutcome =
  | {
      readonly ok: true
      /** The batch that was published and no longer is; back to `draft`. */
      readonly unpublishedBatchId: string
      /**
       * The predecessor put back in its place, or null when there was none — the
       * dataset then has NO published batch for the period, and §0.4 says the
       * surface renders that as "zatím nebylo nahráno" rather than as zeroes.
       */
      readonly restoredBatchId: string | null
    }
  | { readonly ok: false; readonly reason: "nothing_published" }

/**
 * "Vrátit poslední import" (spec §3.2): undo the most recent publish for one
 * dataset of one period.
 *
 * THE PREDECESSOR IS FOUND BY WALKING THE FORWARD POINTER BACKWARDS — the batch
 * whose `superseded_by_batch_id` is the current published one. That is a
 * function rather than a guess because `import_batch_supersession_injective_idx`
 * allows at most one row to point at any batch.
 *
 * THE UNPUBLISHED BATCH GOES BACK TO `draft`, NOT TO `superseded`. `superseded`
 * means "replaced by a newer published batch", and after a rollback there is no
 * such batch — a superseded row with nothing superseding it would violate
 * `import_batch_status_coherence`, and rightly so. Back in `draft` it is exactly
 * what it is: an import that exists and is not live, which the office can
 * publish again if the rollback was the mistake. The loop is closed and
 * symmetric.
 *
 * WHAT IT COSTS: the chain link between the two batches is dropped, so a
 * rollback is not itself recorded as a supersession. The history view still
 * shows both batches with their own timestamps, and the alternative — a fourth
 * status, or a rollback log — buys an audit trail this product has no surface
 * for. If one is ever wanted, `activity_log` (spec §4) is where it belongs, not
 * a fourth state on this row.
 */
export async function rollbackDataset(
  scope: OwnerScope,
  target: DatasetTarget,
): Promise<RollbackOutcome> {
  return betaDb().transaction(async (tx) => {
    await lockPeriod(tx, scope, target.periodId)

    const [current] = await tx
      .select({ id: import_batch.id })
      .from(import_batch)
      .where(
        and(
          eq(import_batch.organization_id, scope.organizationId),
          eq(import_batch.period_id, target.periodId),
          eq(import_batch.dataset, target.dataset),
          eq(import_batch.status, "published"),
        ),
      )
      .limit(1)

    if (!current)
      return { ok: false as const, reason: "nothing_published" as const }

    const [predecessor] = await tx
      .select({ id: import_batch.id })
      .from(import_batch)
      .where(
        and(
          eq(import_batch.organization_id, scope.organizationId),
          eq(import_batch.superseded_by_batch_id, current.id),
        ),
      )
      .limit(1)

    // Same ordering rule as `publishBatch`: vacate the unique index first.
    await tx
      .update(import_batch)
      .set({
        status: "draft",
        published_at: null,
        published_by_user_id: null,
      })
      .where(eq(import_batch.id, current.id))

    if (predecessor) {
      await tx
        .update(import_batch)
        .set({
          status: "published",
          superseded_at: null,
          superseded_by_batch_id: null,
        })
        .where(eq(import_batch.id, predecessor.id))
    }

    return {
      ok: true as const,
      unpublishedBatchId: current.id,
      restoredBatchId: predecessor?.id ?? null,
    }
  })
}

/**
 * Discard a draft, and its rows with it (`ON DELETE CASCADE`).
 *
 * DRAFTS ONLY, and the filter is in the WHERE clause rather than in a check
 * above it. A published batch is what a client has been looking at and a
 * superseded one is the record of what they were looking at before — neither is
 * this product's to remove, and §3.2's answer to a wrong import is a new batch
 * published over it, never a deletion.
 *
 * Returns whether a row matched, so the caller can 404 rather than report a
 * successful discard of nothing.
 */
export async function deleteDraftBatch(
  scope: OwnerScope,
  batchId: string,
): Promise<boolean> {
  const deleted = await betaDb()
    .delete(import_batch)
    .where(
      and(
        eq(import_batch.id, batchId),
        eq(import_batch.organization_id, scope.organizationId),
        eq(import_batch.status, "draft"),
      ),
    )
    .returning({ id: import_batch.id })

  return deleted.length > 0
}

/**
 * The one lock this module takes, in the one place it is taken.
 *
 * `FOR NO KEY UPDATE` on the `reporting_period` row for (organization, period).
 * It serialises every publish and rollback touching that period — slightly wider
 * than the (period, dataset) key the index is on, and deliberately so: the
 * office publishes one period's datasets as one month-end act, the contention
 * is between a retry and a human clicking twice, and a coarser lock on a row
 * that already exists beats an advisory lock whose key nobody can inspect.
 *
 * Filtering on `organization_id` is not decoration. Without it a leaked period
 * id would let a holder of any scope take a lock inside another organization's
 * book — harmless on its own, but this database has no RLS behind the seam and
 * the rule here is that every statement carries the tenant.
 */
async function lockPeriod(
  tx: Parameters<Parameters<ReturnType<typeof betaDb>["transaction"]>[0]>[0],
  scope: OrgScope,
  periodId: string,
): Promise<void> {
  await tx
    .select({ id: reporting_period.id })
    .from(reporting_period)
    .where(
      and(
        eq(reporting_period.id, periodId),
        eq(reporting_period.organization_id, scope.organizationId),
      ),
    )
    .for("no key update")
}
