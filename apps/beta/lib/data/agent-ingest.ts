import "server-only"

import { betaDb, type BetaTx } from "@/db/client"
import type {
  AssetsUpsertInput,
  ClientTasksUpsertInput,
  FilingsUpsertInput,
  LiabilitiesUpsertInput,
  PublishStatementsInput,
  PublishTrialBalanceInput,
} from "@/lib/agent/schemas"
import { isUniqueViolation } from "@/lib/pg-error"

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
import { createDraftBatch, publishBatch } from "./imports"
import {
  createLiability,
  liabilityIdByExternalRef,
  updateLiability,
} from "./liabilities"
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
