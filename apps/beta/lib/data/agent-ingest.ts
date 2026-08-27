import "server-only"

import { betaDb, type BetaTx } from "@/db/client"
import type {
  AccountBalanceMapUpsertInput,
  AssetsUpsertInput,
  ClientTasksUpsertInput,
  FilingsUpsertInput,
  IndicatorsUpsertInput,
  LiabilitiesUpsertInput,
  PublishPayrollInput,
  PublishSaldokontoInput,
  PublishStatementsInput,
  PublishTrialBalanceInput,
} from "@/lib/agent/schemas"
import { isCheckViolation, isUniqueViolation } from "@/lib/pg-error"

import {
  accountMappingIdByCode,
  createAccountMapping,
  updateAccountMapping,
} from "./account-balances"
import { recordAgentActivity, agentActivityByRequestId } from "./activity-log"
import {
  assetByExternalRef,
  createAsset,
  disposeAsset,
  updateAsset,
} from "./assets"
import {
  clientTaskIdByExternalRef,
  createClientTask,
  setClientTaskDone,
  updateClientTask,
} from "./client-tasks"
import { createFiling, filingByExternalRef, updateFiling } from "./filings"
import { upsertIndicator } from "./indicators"
import {
  createDraftBatch,
  publishBatch,
  type PartnerSaldoLineInput,
  type PayrollLineInput,
  type PayrollSummaryInput,
} from "./imports"
import {
  createLiability,
  liabilityIdByExternalRef,
  updateLiability,
} from "./liabilities"
import { createPartner, partnerForUpsert, updatePartner } from "./partners"
import {
  createPayrollEmployee,
  payrollEmployeeByExternalRef,
  updatePayrollEmployee,
} from "./payroll"
import { ensureReportingPeriod } from "./reporting-periods"
import type { AgentScope, OwnerScope } from "./scope"

/**
 * The ingestion API's write layer (spec §3.2).
 *
 * IT ADDS NO WRITE PATH. Every statement below goes through the same
 * `lib/data/*` function the office's own forms call — `createDraftBatch`,
 * `publishBatch`, `createFiling`, `updateLiability`, `disposeAsset` — each of
 * which still takes an `OwnerScope` and still filters on `scope.organizationId`.
 * What this module contributes is the ENVELOPE: one transaction per API call,
 * carrying the mutation and its `activity_log` row together, plus the upsert
 * matching that turns a re-sent row into an update instead of a duplicate.
 *
 * THE OWNER SCOPE IS THE ACCOUNTANT'S OWN. `resolveAgentOwnerScope` mints it
 * from the key's acting user and that user's active `owner` membership, so
 * nothing here is reachable for a book the accountant cannot open, and no client
 * tier gains anything: there is no agent path that produces a non-owner handle.
 *
 * ATOMICITY, IN BOTH DIRECTIONS:
 *   - a refusal (`IngestRefused`) rolls the whole call back, log row included,
 *     so a half-applied upsert is not representable;
 *   - a duplicate `Idempotency-Key` fails the log INSERT, which rolls the
 *     mutation back with it, and the first call's summary is replayed.
 *
 * THE SUMMARY IS THE RESPONSE. What the caller is told and what the office sees
 * in the log are the same object, built once — so an agent cannot be shown a
 * result the audit trail does not record.
 */

type IngestRefusal =
  /**
   * A row's identity moved. A filing's `kind` and `period` are what it IS
   * (`updateFiling` refuses to patch either), so an `externalRef` that comes
   * back pointing at a different filing is a source-side change this API will
   * not silently apply — the honest fix is a new ref.
   */
  | "identity_changed"
  /** The import spine refused the publish, or two calls raced on a unique key. */
  | "conflict"
  /**
   * This `Idempotency-Key` was already spent on a DIFFERENT act — another
   * endpoint, or another book. It is refused rather than replayed: see the
   * catch block below.
   */
  | "idempotency_key_reused"

export type IngestOutcome =
  | {
      readonly status: "applied" | "replayed"
      readonly summary: Record<string, unknown>
    }
  | { readonly status: "refused"; readonly reason: IngestRefusal }

/** Sentinel that aborts the transaction with a named refusal. */
class IngestRefused extends Error {
  constructor(readonly reason: IngestRefusal) {
    super(`agent ingest refused: ${reason}`)
  }
}

type IngestOp = (tx: BetaTx) => Promise<{
  entityId: string | null
  summary: Record<string, unknown>
}>

export type IngestContext = {
  readonly owner: OwnerScope
  readonly agent: AgentScope
  readonly requestId: string | null
}

async function ingest(
  ctx: IngestContext,
  entry: { action: string; entityKind: string },
  op: IngestOp,
): Promise<IngestOutcome> {
  try {
    const summary = await betaDb().transaction(async (tx) => {
      const written = await op(tx)
      await recordAgentActivity(tx, ctx.owner, ctx.agent, {
        action: entry.action,
        entityKind: entry.entityKind,
        entityId: written.entityId,
        requestId: ctx.requestId,
        summary: written.summary,
      })
      return written.summary
    })
    return { status: "applied", summary }
  } catch (error) {
    if (error instanceof IngestRefused) {
      return { status: "refused", reason: error.reason }
    }
    if (isUniqueViolation(error)) {
      // Either the idempotency index (a retry) or a registry's own
      // `external_ref` index (two calls racing on the same row). The first has a
      // prior act to replay; the second does not, and is a plain conflict the
      // caller should retry rather than a 500.
      if (ctx.requestId) {
        const prior = await agentActivityByRequestId(ctx.agent, ctx.requestId)
        if (prior) {
          // A REPLAY IS ONLY A REPLAY IF IT IS THE SAME ACT. The unique index is
          // on (key, request id) and spans every endpoint and every book, so an
          // agent that mints one id per RUN — the natural shape for a month-end
          // script — spends `run-42` on `filings` and then sends it to `assets`.
          // Answering that with the filings summary would report a 200 for a
          // write that never happened, which is the one failure this whole
          // mechanism exists to prevent. The mismatch is the caller's bug, and
          // it is told so.
          const sameAct =
            prior.action === entry.action &&
            prior.organizationId === ctx.owner.organizationId
          return sameAct
            ? { status: "replayed", summary: prior.summary }
            : { status: "refused", reason: "idempotency_key_reused" }
        }
      }
      return { status: "refused", reason: "conflict" }
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Batch datasets — draft + publish, in one call
// ---------------------------------------------------------------------------

/**
 * Publish a rozvaha or a VZZ.
 *
 * ONE CALL DOES BOTH HALVES of the spine's ritual: the rows land in a draft
 * nobody reads, and the same transaction flips it live. The office agent has no
 * review step to insert between them — it is publishing what its own source
 * already printed — and leaving the draft unpublished would put the client's
 * period in the "zatím nebylo nahráno" state with the data sitting right there
 * (§0.4's exact failure mode). The review surface (PR 25) reads the batch
 * HISTORY and rolls back; it does not gate the publish.
 *
 * A REPEAT IS A SUPERSESSION, NOT A DUPLICATE. Publishing the same period twice
 * leaves exactly one published batch — the newer one — with the older recorded
 * as superseded (`import_batch_one_published_idx` plus `publishBatch`'s lock).
 * That is idempotent in EFFECT, which is the property the client's page depends
 * on; sending an `Idempotency-Key` additionally makes a retried request write
 * nothing at all.
 */
export async function ingestStatements(
  ctx: IngestContext,
  input: PublishStatementsInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "statements.publish", entityKind: "import_batch" },
    async (tx) => {
      const period = await ensureReportingPeriod(ctx.owner, input.period, tx)

      const common = input.lines.map((line) => ({
        ozn: line.ozn ?? null,
        rowCode: line.rowCode,
        rowLabel: line.rowLabel,
        sortOrder: line.sortOrder,
        indent: line.indent ?? 0,
        isBold: line.isBold ?? false,
        brutto: line.brutto ?? null,
        korekce: line.korekce ?? null,
        netto: line.netto ?? null,
        bezne: line.bezne ?? null,
        minule: line.minule ?? null,
      }))

      // The dataset↔kind pairing was refused by `publishStatementsSchema` already;
      // this re-states it in a form the compiler can see, so `ImportBatchPayload`
      // is satisfied without a type assertion.
      const batch =
        input.dataset === "vzz"
          ? await createDraftBatch(
              ctx.owner,
              {
                dataset: "vzz",
                periodId: period.id,
                source: "agent",
                noteInternal: input.noteInternal ?? null,
                statementLines: common.map((line) => ({
                  ...line,
                  statementKind: "vzz" as const,
                })),
              },
              tx,
            )
          : await createDraftBatch(
              ctx.owner,
              {
                dataset: "rozvaha",
                periodId: period.id,
                source: "agent",
                noteInternal: input.noteInternal ?? null,
                statementLines: common.map((line, index) => ({
                  ...line,
                  statementKind:
                    input.lines[index]?.statementKind === "rozvaha_pasiva"
                      ? ("rozvaha_pasiva" as const)
                      : ("rozvaha_aktiva" as const),
                })),
              },
              tx,
            )

      const published = await publishBatch(ctx.owner, batch.id, tx)
      if (!published.ok) throw new IngestRefused("conflict")

      return {
        entityId: batch.id,
        summary: {
          dataset: input.dataset,
          periodId: period.id,
          batchId: batch.id,
          rowCount: batch.rowCount,
          supersededBatchId: published.supersededBatchId,
          alreadyPublished: published.alreadyPublished,
        },
      }
    },
  )
}

/** Publish an obratová předvaha. Same ritual, one payload table over. */
export async function ingestTrialBalance(
  ctx: IngestContext,
  input: PublishTrialBalanceInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "predvaha.publish", entityKind: "import_batch" },
    async (tx) => {
      const period = await ensureReportingPeriod(ctx.owner, input.period, tx)

      const batch = await createDraftBatch(
        ctx.owner,
        {
          dataset: "predvaha",
          periodId: period.id,
          source: "agent",
          noteInternal: input.noteInternal ?? null,
          trialBalanceLines: input.lines.map((line) => ({
            accountCode: line.accountCode,
            accountName: line.accountName,
            openingBalance: line.openingBalance ?? null,
            turnoverDebit: line.turnoverDebit ?? null,
            turnoverCredit: line.turnoverCredit ?? null,
            closingBalance: line.closingBalance ?? null,
          })),
        },
        tx,
      )

      const published = await publishBatch(ctx.owner, batch.id, tx)
      if (!published.ok) throw new IngestRefused("conflict")

      return {
        entityId: batch.id,
        summary: {
          dataset: "predvaha",
          periodId: period.id,
          batchId: batch.id,
          rowCount: batch.rowCount,
          supersededBatchId: published.supersededBatchId,
          alreadyPublished: published.alreadyPublished,
        },
      }
    },
  )
}

/**
 * Publish a saldokonto — the one dataset that is BOTH an upsert and a publish
 * (spec §3.2: "saldokonto (partner+saldo upsert)").
 *
 * TWO LIFETIMES, ONE TRANSACTION. Each line carries a partner IDENTITY, which is
 * upserted into a registry that outlives every period, and three FIGURES, which
 * are published as this period's measurement and superseded wholesale next
 * month. Both halves commit together: a partner created for a batch that then
 * failed to publish would leave the registry carrying a supplier the client's
 * books never mentioned.
 *
 * THE PARTNERS ARE RESOLVED FIRST, ALL OF THEM, BEFORE THE BATCH EXISTS. The
 * batch's payload names partner IDS (`PartnerSaldoLineInput`), so identity is
 * settled before a single saldo row is written — which is what keeps "which row
 * is this counterparty?" in `lib/data/partners.ts` (where the match order and
 * its reasoning live) instead of spreading into the import spine.
 *
 * A SECOND SOURCE ID ON ONE IČO IS `identity_changed`, and the whole call rolls
 * back. `partnerForUpsert` found the partner by IČO, and that partner already
 * carries a DIFFERENT `external_ref`: two rows of the office's own system are
 * claiming one legal person. Re-pointing would move that partner's entire saldo
 * history under a new id and inserting would violate `partner_ico_idx` anyway,
 * so the honest answer is to refuse and let the office fix its source — the same
 * judgement `ingestFilings` makes when a ref comes back on a different kind.
 */
export async function ingestSaldokonto(
  ctx: IngestContext,
  input: PublishSaldokontoInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "saldokonto.publish", entityKind: "import_batch" },
    async (tx) => {
      const period = await ensureReportingPeriod(ctx.owner, input.period, tx)

      const partners: UpsertedItem[] = []
      const saldoLines: PartnerSaldoLineInput[] = []

      for (const line of input.lines) {
        const stated = line.partner

        // Every field the payload can reach, stated on every run: the office's
        // own system is the authority on a supplier's identity, so an omitted
        // field is an ABSENT one (`?? null`), never "keep what the portal had".
        // `noteClient` / `noteInternal` are deliberately unreachable from here —
        // they are the portal's own layer (§3.3) and an import must never erase
        // an accountant's note about a supplier.
        const fields = {
          name: stated.name,
          ico: stated.ico ?? null,
          dic: stated.dic ?? null,
          role: stated.partnerRole ?? ("other" as const),
          email: stated.email ?? null,
          phone: stated.phone ?? null,
          street: stated.street ?? null,
          houseNumber: stated.houseNumber ?? null,
          orientationNumber: stated.orientationNumber ?? null,
          city: stated.city ?? null,
          postalCode: stated.postalCode ?? null,
          countryCode: stated.countryCode ?? "CZ",
        } as const

        const match = await partnerForUpsert(
          ctx.owner,
          { externalRef: stated.externalRef, ico: stated.ico },
          tx,
        )

        let partnerId: string
        if (match) {
          if (match.matchedBy === "ico" && match.externalRef !== null) {
            throw new IngestRefused("identity_changed")
          }
          await updatePartner(
            ctx.owner,
            match.id,
            {
              ...fields,
              // Adoption: the IČO matched a partner the office typed by hand
              // (`external_ref IS NULL`), so the import claims it rather than
              // shadowing it with a duplicate. `source` stays `manual` — it
              // records the row's ORIGIN and the database freezes it.
              ...(match.externalRef === null
                ? { externalRef: stated.externalRef }
                : {}),
            },
            tx,
          )
          partnerId = match.id
          partners.push({
            externalRef: stated.externalRef,
            id: partnerId,
            action: "updated",
          })
        } else {
          const created = await createPartner(
            ctx.owner,
            {
              ...fields,
              externalRef: stated.externalRef,
              source: "saldokonto",
            },
            tx,
          )
          partnerId = created.id
          partners.push({
            externalRef: stated.externalRef,
            id: partnerId,
            action: "created",
          })
        }

        saldoLines.push({
          partnerId,
          receivableTotal: line.receivableTotal ?? null,
          payableTotal: line.payableTotal ?? null,
          oldestDue: line.oldestDue ?? null,
        })
      }

      const batch = await createDraftBatch(
        ctx.owner,
        {
          dataset: "saldokonto",
          periodId: period.id,
          source: "agent",
          noteInternal: input.noteInternal ?? null,
          partnerSaldoLines: saldoLines,
        },
        tx,
      )

      const published = await publishBatch(ctx.owner, batch.id, tx)
      if (!published.ok) throw new IngestRefused("conflict")

      return {
        entityId: batch.id,
        summary: {
          dataset: "saldokonto",
          periodId: period.id,
          batchId: batch.id,
          rowCount: batch.rowCount,
          supersededBatchId: published.supersededBatchId,
          alreadyPublished: published.alreadyPublished,
          // The registry side of the act, reported apart from the batch: the
          // office reading the log needs to see that a run created four
          // suppliers it has never seen, which is the one part of a saldokonto
          // publish that is not superseded next month.
          partners: upsertSummary(partners),
        },
      }
    },
  )
}

/**
 * Publish one period's payroll: the employee register, the totals and the
 * per-employee lines (spec §3.2, §2.6).
 *
 * THREE WRITES, ONE TRANSACTION, IN THIS ORDER, and the order is the design:
 *
 *   1. UPSERT THE REGISTER. `payroll_employee` is not period-versioned — a
 *      person is on the books across months — so it is matched on
 *      `externalRef` exactly as `filing` and `asset` are, and it is written
 *      FIRST because a line has to name an employee row that exists.
 *   2. CREATE THE DRAFT BATCH with the summary and the lines as its payload.
 *   3. PUBLISH IT, which supersedes whatever this period had before.
 *
 * A refusal at any step rolls all three back, register included — so a payroll
 * run that fails half way does not leave new people in the register with no
 * figures against them.
 *
 * THE PAYLOAD IS THE WHOLE EMPLOYEE ROW, not a patch. An omitted `endedOn` is
 * not "leave it as it was", it is "the office's source no longer states one" —
 * the same full-state semantics `ingestFilings` and `ingestAssets` already have,
 * and the property that makes re-sending last month's file idempotent instead of
 * accumulating stale fields.
 *
 * `app_user_id` IS NEVER TOUCHED. `updatePayrollEmployee` has no parameter for
 * it (see `lib/data/payroll.ts`), so an office agent cannot bind — or unbind —
 * a portal account to a person. That is the employee seat's identity act, not an
 * accounting fact.
 *
 * REPUBLISHING IS A SUPERSESSION, exactly as for a rozvaha: the period ends with
 * one published payroll batch, the newer one, and the older recorded as
 * superseded. The register is upserted rather than superseded, because it is a
 * registry and not a period snapshot — a person who left in March is still the
 * person the March lines point at.
 */
export async function ingestPayroll(
  ctx: IngestContext,
  input: PublishPayrollInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "payroll.publish", entityKind: "import_batch" },
    async (tx) => {
      const period = await ensureReportingPeriod(ctx.owner, input.period, tx)

      const employees: UpsertedItem[] = []
      const lines: PayrollLineInput[] = []

      for (const item of input.employees) {
        const fields = {
          fullName: item.fullName,
          contractType: item.contractType,
          startedOn: item.startedOn ?? null,
          endedOn: item.endedOn ?? null,
          active: item.active ?? true,
        } as const

        const existing = await payrollEmployeeByExternalRef(
          ctx.owner,
          item.externalRef,
          tx,
        )

        let employeeId: string
        if (existing) {
          await updatePayrollEmployee(ctx.owner, existing.id, fields, tx)
          employeeId = existing.id
          employees.push({
            externalRef: item.externalRef,
            id: employeeId,
            action: "updated",
          })
        } else {
          const created = await createPayrollEmployee(
            ctx.owner,
            { ...fields, externalRef: item.externalRef },
            tx,
          )
          employeeId = created.id
          employees.push({
            externalRef: item.externalRef,
            id: employeeId,
            action: "created",
          })
        }

        lines.push({
          payrollEmployeeId: employeeId,
          gross: item.gross ?? null,
          deductionsTotal: item.deductionsTotal ?? null,
          net: item.net ?? null,
          employerCost: item.employerCost ?? null,
        })
      }

      // Twelve office-stated figures, copied one by one. No total is footed
      // from the others here or anywhere below it (spec §0.2).
      const summary: PayrollSummaryInput = {
        grossTotal: input.summary.grossTotal ?? null,
        employerSocial: input.summary.employerSocial ?? null,
        employerHealth: input.summary.employerHealth ?? null,
        employerCostTotal: input.summary.employerCostTotal ?? null,
        employeeWithholdingsTotal:
          input.summary.employeeWithholdingsTotal ?? null,
        incomeTaxAdvance: input.summary.incomeTaxAdvance ?? null,
        netPaidTotal: input.summary.netPaidTotal ?? null,
        paymentDueDate: input.summary.paymentDueDate ?? null,
        headcountHpp: input.summary.headcountHpp ?? null,
        headcountDpc: input.summary.headcountDpc ?? null,
        headcountDpp: input.summary.headcountDpp ?? null,
        noteClient: input.summary.noteClient ?? null,
      }

      const batch = await createDraftBatch(
        ctx.owner,
        {
          dataset: "payroll",
          periodId: period.id,
          source: "agent",
          noteInternal: input.noteInternal ?? null,
          payrollSummary: summary,
          payrollLines: lines,
        },
        tx,
      )

      const published = await publishBatch(ctx.owner, batch.id, tx)
      if (!published.ok) throw new IngestRefused("conflict")

      return {
        entityId: batch.id,
        summary: {
          dataset: "payroll",
          periodId: period.id,
          batchId: batch.id,
          rowCount: batch.rowCount,
          supersededBatchId: published.supersededBatchId,
          alreadyPublished: published.alreadyPublished,
          // NAMES DO NOT GO IN THE LOG. `activity_log.summary` is read by the
          // office to see WHAT a call did, and the office's own employee ids
          // answer that; a payload of full names would put personal data into an
          // append-only table with no surface that needs it (spec §4's rule that
          // the summary carries "counts, external refs and ids", read together
          // with migration 0016's personal-data minimum).
          employees,
          employeesCreated: employees.filter((e) => e.action === "created")
            .length,
          employeesUpdated: employees.filter((e) => e.action === "updated")
            .length,
        },
      }
    },
  )
}

// ---------------------------------------------------------------------------
// Registry upserts — matched on `external_ref`
// ---------------------------------------------------------------------------

type UpsertedItem = {
  externalRef: string
  id: string
  action: "created" | "updated"
}

function upsertSummary(items: UpsertedItem[]): Record<string, unknown> {
  return {
    items,
    created: items.filter((item) => item.action === "created").length,
    updated: items.filter((item) => item.action === "updated").length,
  }
}

/**
 * Upsert filings.
 *
 * MATCHED ON `externalRef`, NEVER ON CONTENT. Two identical-looking DPH advances
 * can both be real, so content matching would silently merge them; the source
 * system's own id is the only key that means anything here. A row the office
 * typed by hand carries no `external_ref` and is therefore never touched by an
 * agent run — the partial unique index is what makes that a rule rather than a
 * habit.
 *
 * `kind` and `period` ARE THE ROW'S IDENTITY and are checked, not patched. A ref
 * that comes back on a different kind or period is `identity_changed`, and the
 * whole call rolls back: applying it would rewrite history for every surface
 * that already showed the filing, and ignoring it would leave the portal quietly
 * disagreeing with the office's own books.
 */
export async function ingestFilings(
  ctx: IngestContext,
  input: FilingsUpsertInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "filing.upsert", entityKind: "filing" },
    async (tx) => {
      const items: UpsertedItem[] = []
      const periods = new Map<string, string>()

      for (const item of input.items) {
        const periodKey = JSON.stringify(item.period)
        let periodId = periods.get(periodKey)
        if (!periodId) {
          periodId = (await ensureReportingPeriod(ctx.owner, item.period, tx))
            .id
          periods.set(periodKey, periodId)
        }

        const existing = await filingByExternalRef(
          ctx.owner,
          item.externalRef,
          tx,
        )

        const fields = {
          dueOn: item.dueOn,
          status: item.status ?? "planned",
          filedOn: item.filedOn ?? null,
          amountDue: item.amountDue ?? null,
          paidAt: item.paidAt ? new Date(item.paidAt) : null,
          variableSymbol: item.variableSymbol ?? null,
          noteClient: item.noteClient ?? null,
          noteInternal: item.noteInternal ?? null,
        }

        if (existing) {
          if (existing.kind !== item.kind || existing.periodId !== periodId) {
            throw new IngestRefused("identity_changed")
          }
          await updateFiling(ctx.owner, existing.id, fields, tx)
          items.push({
            externalRef: item.externalRef,
            id: existing.id,
            action: "updated",
          })
          continue
        }

        const created = await createFiling(
          ctx.owner,
          {
            ...fields,
            kind: item.kind,
            periodId,
            externalRef: item.externalRef,
          },
          tx,
        )
        items.push({
          externalRef: item.externalRef,
          id: created.id,
          action: "created",
        })
      }

      return {
        entityId: items.length === 1 ? (items[0]?.id ?? null) : null,
        summary: upsertSummary(items),
      }
    },
  )
}

/** Upsert manual liabilities. Matched on `externalRef`, like filings. */
export async function ingestLiabilities(
  ctx: IngestContext,
  input: LiabilitiesUpsertInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "liability.upsert", entityKind: "liability" },
    async (tx) => {
      const items: UpsertedItem[] = []

      for (const item of input.items) {
        const fields = {
          group: item.creditorGroup ?? "ostatni",
          label: item.label,
          amount: item.amount,
          dueOn: item.dueOn,
          paidAt: item.paidAt ? new Date(item.paidAt) : null,
          variableSymbol: item.variableSymbol ?? null,
          noteClient: item.noteClient ?? null,
          noteInternal: item.noteInternal ?? null,
        } as const

        const existingId = await liabilityIdByExternalRef(
          ctx.owner,
          item.externalRef,
          tx,
        )

        if (existingId) {
          await updateLiability(ctx.owner, existingId, fields, tx)
          items.push({
            externalRef: item.externalRef,
            id: existingId,
            action: "updated",
          })
          continue
        }

        const created = await createLiability(
          ctx.owner,
          { ...fields, externalRef: item.externalRef },
          tx,
        )
        items.push({
          externalRef: item.externalRef,
          id: created.id,
          action: "created",
        })
      }

      return {
        entityId: items.length === 1 ? (items[0]?.id ?? null) : null,
        summary: upsertSummary(items),
      }
    },
  )
}

/**
 * Upsert assets.
 *
 * DISPOSAL IS A TRANSITION, NOT A FIELD, and goes through `disposeAsset` — the
 * same separation `updateAsset` keeps from `status` / `disposed_on` for the
 * office's own forms. It is applied only when the payload says `disposed` and
 * the row is not already, so a repeated run does not re-stamp a disposal date.
 * There is no un-disposal here for the same reason there is none in the UI.
 */
export async function ingestAssets(
  ctx: IngestContext,
  input: AssetsUpsertInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "asset.upsert", entityKind: "asset" },
    async (tx) => {
      const items: UpsertedItem[] = []

      for (const item of input.items) {
        const fields = {
          name: item.name,
          category: item.category,
          isMinor: item.isMinor ?? false,
          acquisitionCost: item.acquisitionCost,
          acquiredOn: item.acquiredOn ?? null,
          placedInServiceOn: item.placedInServiceOn ?? null,
          accumulatedDepreciation: item.accumulatedDepreciation ?? null,
          depreciationAsOf: item.depreciationAsOf ?? null,
          taxResidualValue: item.taxResidualValue ?? null,
          siteRef: item.siteRef ?? null,
          noteClient: item.noteClient ?? null,
          noteInternal: item.noteInternal ?? null,
        } as const

        const existing = await assetByExternalRef(
          ctx.owner,
          item.externalRef,
          tx,
        )

        let assetId: string
        if (existing) {
          await updateAsset(ctx.owner, existing.id, fields, tx)
          assetId = existing.id
          items.push({
            externalRef: item.externalRef,
            id: assetId,
            action: "updated",
          })
        } else {
          const created = await createAsset(
            ctx.owner,
            { ...fields, externalRef: item.externalRef },
            tx,
          )
          assetId = created.id
          items.push({
            externalRef: item.externalRef,
            id: assetId,
            action: "created",
          })
        }

        if (
          item.status === "disposed" &&
          item.disposedOn &&
          existing?.status !== "disposed"
        ) {
          await disposeAsset(ctx.owner, assetId, item.disposedOn, tx)
        }
      }

      return {
        entityId: items.length === 1 ? (items[0]?.id ?? null) : null,
        summary: upsertSummary(items),
      }
    },
  )
}

/**
 * Upsert the account balance map — spec §3.2's `account_balance_map` endpoint,
 * the feeder of Finance › Účty a hotovost (§2.4).
 *
 * MATCHED ON `accountCode`, NOT ON AN `externalRef`, and this is the one
 * registry on this API where that is the right key rather than a shortcut: the
 * account code IS the row's identity (it is what the office's own účtový rozvrh
 * calls it), migration 0014 makes it unique within the book, and there is no
 * `external_ref` column here to disagree with it. See `accountMappingIdByCode`.
 *
 * WHAT IT CANNOT DO: delete. `active: false` retires an entry and leaves it
 * findable; removing it outright would drop the account out of every past
 * card, which is a destructive act on the client's HISTORY and stays in the
 * office's own hands (Zadávání dat).
 *
 * A CHECK VIOLATION IS A REFUSAL, NOT A 500. The overlap trigger
 * (`account_balance_map_no_overlap`) is the rule that makes the page's "celkem"
 * a sum over disjoint sets: an agent that maps prefix `221` while exact `221.01`
 * already exists is stating a map in which one účet would be counted twice.
 * That is "your request is well-formed and the current state will not accept
 * it" — a 409 `conflict`, the same answer a raced unique key gets, and the
 * whole call rolls back so a partly-applied map is not representable.
 */
export async function ingestAccountBalanceMap(
  ctx: IngestContext,
  input: AccountBalanceMapUpsertInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "account_map.upsert", entityKind: "account_balance_map" },
    async (tx) => {
      const items: {
        accountCode: string
        id: string
        action: "created" | "updated"
      }[] = []

      try {
        for (const item of input.items) {
          const fields = {
            matchKind: item.matchKind ?? "exact",
            label: item.label,
            kind: item.kind,
            ...(item.sortOrder === undefined
              ? {}
              : { sortOrder: item.sortOrder }),
            ...(item.active === undefined ? {} : { active: item.active }),
          } as const

          const existingId = await accountMappingIdByCode(
            ctx.owner,
            item.accountCode,
            tx,
          )

          if (existingId) {
            await updateAccountMapping(ctx.owner, existingId, fields, tx)
            items.push({
              accountCode: item.accountCode,
              id: existingId,
              action: "updated",
            })
            continue
          }

          const created = await createAccountMapping(
            ctx.owner,
            { ...fields, accountCode: item.accountCode },
            tx,
          )
          items.push({
            accountCode: item.accountCode,
            id: created.id,
            action: "created",
          })
        }
      } catch (error) {
        if (isCheckViolation(error)) throw new IngestRefused("conflict")
        throw error
      }

      return {
        entityId: items.length === 1 ? (items[0]?.id ?? null) : null,
        summary: {
          items,
          created: items.filter((item) => item.action === "created").length,
          updated: items.filter((item) => item.action === "updated").length,
        },
      }
    },
  )
}

/**
 * Upsert client tasks (spec §3.4, §2.1).
 *
 * REAL TASKS ONLY — `clientTaskIdByExternalRef` filters on `is_template =
 * false`, so an agent can neither read nor overwrite a template. A template is
 * the office's own construct in Pro účetní, and an agent that could write one
 * would be writing a monthly obligation for every client of the office.
 *
 * `done` goes through `setClientTaskDone`, the only write that may touch
 * `status` and `done_at` together, and only when it actually changes something:
 * re-sending a done task does not re-stamp `done_at`.
 */
export async function ingestClientTasks(
  ctx: IngestContext,
  input: ClientTasksUpsertInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "client_task.upsert", entityKind: "client_task" },
    async (tx) => {
      const items: UpsertedItem[] = []

      for (const item of input.items) {
        const fields = {
          title: item.title,
          description: item.description ?? null,
          dueDate: item.dueDate,
          linkKind: item.linkKind ?? "none",
        } as const

        const existingId = await clientTaskIdByExternalRef(
          ctx.owner,
          item.externalRef,
          tx,
        )

        let taskId: string
        if (existingId) {
          const updated = await updateClientTask(
            ctx.owner,
            existingId,
            fields,
            tx,
          )
          if (!updated.ok) throw new IngestRefused("conflict")
          taskId = existingId
          items.push({
            externalRef: item.externalRef,
            id: taskId,
            action: "updated",
          })
        } else {
          const created = await createClientTask(
            ctx.owner,
            { ...fields, externalRef: item.externalRef },
            tx,
          )
          if (!created.ok) throw new IngestRefused("conflict")
          taskId = created.id
          items.push({
            externalRef: item.externalRef,
            id: taskId,
            action: "created",
          })
        }

        if (item.done !== undefined) {
          await setClientTaskDone(ctx.owner, taskId, item.done, tx)
        }
      }

      return {
        entityId: items.length === 1 ? (items[0]?.id ?? null) : null,
        summary: upsertSummary(items),
      }
    },
  )
}

/**
 * State office-provided indicator readings (spec §2.1 item 4, migration 0020).
 *
 * MATCHED ON `(kind, asOf)` rather than on an `externalRef`, and each item is
 * ONE statement — `upsertIndicator` uses the unique index as its conflict
 * target, so a re-sent reading corrects the stored one instead of racing a
 * select-then-branch pair on the same key. The summary reports which arm ran per
 * item, exactly as the account map's does, because "this run overwrote a figure
 * the office had typed" is something the operator has to be able to see in the
 * activity log.
 *
 * NO DELETE ARM. Removing a reading is a judgement about which of two figures
 * was the typo — and `latestIndicator` makes that judgement visible on the
 * client's card — so it stays a human act on Zadávání dat (`deleteIndicators`),
 * never something a re-run can do silently.
 *
 * NOTHING IS COMPUTED. `amount` reaches Postgres as the string the office's
 * system sent (§0.2 / §0.7); obrat is 12 months of taxable supplies and this
 * endpoint plus the office's own form are the only ways it can enter at all.
 */
export async function ingestIndicators(
  ctx: IngestContext,
  input: IndicatorsUpsertInput,
): Promise<IngestOutcome> {
  return ingest(
    ctx,
    { action: "indicator.upsert", entityKind: "organization_indicator" },
    async (tx) => {
      const items: {
        kind: string
        asOf: string
        id: string
        action: "created" | "updated"
      }[] = []

      try {
        for (const item of input.items) {
          const { id, action } = await upsertIndicator(
            ctx.owner,
            {
              kind: item.kind,
              amount: item.amount,
              asOf: item.asOf,
              noteInternal: item.noteInternal ?? null,
            },
            tx,
          )
          items.push({ kind: item.kind, asOf: item.asOf, id, action })
        }
      } catch (error) {
        if (isCheckViolation(error)) throw new IngestRefused("conflict")
        throw error
      }

      return {
        entityId: items.length === 1 ? (items[0]?.id ?? null) : null,
        summary: {
          items,
          created: items.filter((item) => item.action === "created").length,
          updated: items.filter((item) => item.action === "updated").length,
        },
      }
    },
  )
}
