import "server-only"

import { and, asc, desc, eq, sql } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import { client_task, type BetaClientTaskLinkKind } from "@/db/schema"
import { formatBetaDate } from "@/lib/format/date"
import { notifyClientTaskCreated } from "@/lib/notifications/events"

import { notifiableOrgMembers } from "./notification-prefs"
import { organizationForScope } from "./organizations"
import { ensureReportingPeriod } from "./reporting-periods"
import {
  clientTaskView,
  ownerClientTaskDetail,
  type ClientTaskView,
  type OwnerClientTaskDetail,
} from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * client_task — Pro účetní › Úkoly klientovi (spec §3.4) and the client's own
 * "Co od vás potřebujeme" (spec §2.1).
 *
 * READS SPLIT IN TWO, LIKE `documents.ts` / `documents-office.ts`.
 * `openClientTasksForScope` is readable by EVERY role off a bare `OrgScope`
 * (spec §5: guest is an external viewer of client-visible data, not a
 * blinded one). `listTasksForOwner` / `listTemplatesForOwner` are the
 * office's own CRUD list and take an `OwnerScope`.
 *
 * EVERY WRITE TAKES AN `OwnerScope`, NOT AN `OrgScope` + `assertOwner`. Spec
 * §3.3: "Client pages are read-only for every role; owner gets 'Upravit'
 * deep-links into these forms" — `client_task` is named in that list, and
 * `owner` IS the accountant (`db/schema/_enums.ts`), never the client
 * company. Mirrors `lib/data/documents-office.ts`'s discipline: a function
 * that declares its first parameter as `OwnerScope` cannot be called with a
 * bare `OrgScope` at all, so this table has no client-writable path even by
 * mistake.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function normalizeText(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// ---------------------------------------------------------------------------
// Client read — "Co od vás potřebujeme" (spec §2.1)
// ---------------------------------------------------------------------------

const CLIENT_VIEW_COLUMNS = {
  id: client_task.id,
  title: client_task.title,
  description: client_task.description,
  due_date: client_task.due_date,
  link_kind: client_task.link_kind,
}

/**
 * Open, non-template tasks, due date ascending — the feeder behind spec
 * §2.1's "open client_tasks (text, due, link)". Every role reads the same
 * rows; there is no per-role filter here (unlike `visibleAttachment` in
 * `lib/data/filings.ts`) because a task has no hidden layer of its own — it
 * exists only to be seen.
 */
export async function openClientTasksForScope(
  scope: OrgScope,
): Promise<ClientTaskView[]> {
  const rows = await betaDb()
    .select(CLIENT_VIEW_COLUMNS)
    .from(client_task)
    .where(
      and(
        eq(client_task.organization_id, scope.organizationId),
        eq(client_task.is_template, false),
        eq(client_task.status, "open"),
      ),
    )
    .orderBy(asc(client_task.due_date), asc(client_task.id))

  // `due_date` is NOT NULL for every non-template row (client_task_due_date_shape,
  // the migration's own CHECK) — the cast is the DSL's nullable column type,
  // not a real possibility here.
  return rows.map((row) =>
    clientTaskView({ ...row, due_date: row.due_date as string }),
  )
}

// ---------------------------------------------------------------------------
// Office reads — Pro účetní › Úkoly klientovi's two tabs
// ---------------------------------------------------------------------------

const OWNER_COLUMNS = {
  id: client_task.id,
  is_template: client_task.is_template,
  title: client_task.title,
  description: client_task.description,
  due_date: client_task.due_date,
  template_due_day: client_task.template_due_day,
  link_kind: client_task.link_kind,
  status: client_task.status,
  done_at: client_task.done_at,
  source_template_id: client_task.source_template_id,
  created_at: client_task.created_at,
  updated_at: client_task.updated_at,
}

/** Real tasks, open first then due-date ascending — mirrors the ordering
 * `listQueueDocuments` (`documents-office.ts`) uses for its own queue. */
export async function listTasksForOwner(
  owner: OwnerScope,
): Promise<OwnerClientTaskDetail[]> {
  const rows = await betaDb()
    .select(OWNER_COLUMNS)
    .from(client_task)
    .where(
      and(
        eq(client_task.organization_id, owner.organizationId),
        eq(client_task.is_template, false),
      ),
    )
    .orderBy(
      desc(sql`(${client_task.status} = 'open')`),
      asc(client_task.due_date),
      asc(client_task.id),
    )

  return rows.map(ownerClientTaskDetail)
}

/** Templates, alphabetical — there is no due date to order a template by. */
export async function listTemplatesForOwner(
  owner: OwnerScope,
): Promise<OwnerClientTaskDetail[]> {
  const rows = await betaDb()
    .select(OWNER_COLUMNS)
    .from(client_task)
    .where(
      and(
        eq(client_task.organization_id, owner.organizationId),
        eq(client_task.is_template, true),
      ),
    )
    .orderBy(asc(client_task.title), asc(client_task.id))

  return rows.map(ownerClientTaskDetail)
}

// ---------------------------------------------------------------------------
// Office writes — task CRUD
// ---------------------------------------------------------------------------

export type ClientTaskWriteInput = {
  readonly title: string
  readonly description?: string | null
  /** ISO date (`YYYY-MM-DD`). */
  readonly dueDate: string
  readonly linkKind?: BetaClientTaskLinkKind
  /**
   * The source system's own id (migration 0011) — the agent ingestion API's
   * upsert match key. Office-typed tasks leave it NULL and are never
   * overwritten by an agent run.
   */
  readonly externalRef?: string | null
}

/** The task an agent's `externalRef` names. Real tasks only, never templates. */
export async function clientTaskIdByExternalRef(
  owner: OwnerScope,
  externalRef: string,
  executor: BetaExecutor = betaDb(),
): Promise<string | null> {
  const [row] = await executor
    .select({ id: client_task.id })
    .from(client_task)
    .where(
      and(
        eq(client_task.organization_id, owner.organizationId),
        eq(client_task.is_template, false),
        eq(client_task.external_ref, externalRef),
      ),
    )
    .limit(1)

  return row?.id ?? null
}

type ClientTaskRefusal = "invalid_title" | "invalid_date" | "not_found"

export type ClientTaskResult =
  { ok: true; id: string } | { ok: false; reason: ClientTaskRefusal }

function validateTaskInput(input: {
  title: string
  dueDate: string
}): ClientTaskRefusal | null {
  if (normalizeText(input.title) === null) return "invalid_title"
  if (!ISO_DATE.test(input.dueDate)) return "invalid_date"
  return null
}

/**
 * Resolve recipients and org identity, then send — the part of the spec
 * §2.11 event-2 notification that needs the database.
 */
async function dispatchClientTaskNotification(
  owner: OwnerScope,
  title: string,
  dueDate: string,
): Promise<void> {
  const [recipients, org] = await Promise.all([
    notifiableOrgMembers(owner.organizationId),
    organizationForScope(owner),
  ])
  await notifyClientTaskCreated(recipients, {
    orgSlug: owner.organizationSlug,
    organizationName: org.legalName,
    title,
    dueDateLabel: formatBetaDate(dueDate),
  })
}

/** Create a real task (`is_template = false`). */
export async function createClientTask(
  owner: OwnerScope,
  input: ClientTaskWriteInput,
  executor: BetaExecutor = betaDb(),
): Promise<ClientTaskResult> {
  const refusal = validateTaskInput(input)
  if (refusal) return { ok: false, reason: refusal }

  const title = normalizeText(input.title)!

  const [row] = await executor
    .insert(client_task)
    .values({
      organization_id: owner.organizationId,
      is_template: false,
      title,
      description: normalizeText(input.description ?? null),
      due_date: input.dueDate,
      link_kind: input.linkKind ?? "none",
      external_ref: input.externalRef ?? null,
      created_by: owner.userId,
    })
    .returning({ id: client_task.id })

  if (!row) throw new Error("client_task insert returned no row")

  // Post-commit notification (spec §2.11 event 2). The INSERT above is a
  // single Postgres statement, so it has already committed by the time
  // `.returning()` resolves. NOT fired from `createMonthlyTaskSet` below —
  // see that function's own note.
  void dispatchClientTaskNotification(owner, title, input.dueDate).catch(
    (error: unknown) => {
      console.error(
        "[beta:notifications] client-task-created dispatch failed",
        error,
      )
    },
  )

  return { ok: true, id: row.id }
}

export type ClientTaskPatch = Partial<{
  title: string
  description: string | null
  dueDate: string
  linkKind: BetaClientTaskLinkKind
}>

/**
 * Edit a real task's own fields. Never touches `status` / `done_at` (see
 * `setClientTaskDone`) or the `source*` / `isTemplate` bookkeeping — those are
 * not user-editable facts about a row, they are how it came to exist.
 */
export async function updateClientTask(
  owner: OwnerScope,
  taskId: string,
  patch: ClientTaskPatch,
  executor: BetaExecutor = betaDb(),
): Promise<ClientTaskResult> {
  if (!UUID.test(taskId)) return { ok: false, reason: "not_found" }
  if (patch.title !== undefined && normalizeText(patch.title) === null) {
    return { ok: false, reason: "invalid_title" }
  }
  if (patch.dueDate !== undefined && !ISO_DATE.test(patch.dueDate)) {
    return { ok: false, reason: "invalid_date" }
  }

  const values = {
    ...(patch.title !== undefined
      ? { title: normalizeText(patch.title)! }
      : {}),
    ...("description" in patch
      ? { description: normalizeText(patch.description ?? null) }
      : {}),
    ...(patch.dueDate !== undefined ? { due_date: patch.dueDate } : {}),
    ...(patch.linkKind !== undefined ? { link_kind: patch.linkKind } : {}),
  }
  if (Object.keys(values).length === 0) return { ok: true, id: taskId }

  const [row] = await executor
    .update(client_task)
    .set(values)
    .where(
      and(
        eq(client_task.id, taskId),
        eq(client_task.organization_id, owner.organizationId),
        eq(client_task.is_template, false),
      ),
    )
    .returning({ id: client_task.id })

  return row ? { ok: true, id: row.id } : { ok: false, reason: "not_found" }
}

/**
 * Mark a task done or reopen it. The one write that touches BOTH `status` and
 * `done_at` together, so the two can never fall out of coherence with each
 * other the way `client_task_status_done_at_coherence` (the DB CHECK) also
 * guarantees at the floor.
 */
export async function setClientTaskDone(
  owner: OwnerScope,
  taskId: string,
  done: boolean,
  executor: BetaExecutor = betaDb(),
): Promise<boolean> {
  if (!UUID.test(taskId)) return false

  const updated = await executor
    .update(client_task)
    .set({
      status: done ? "done" : "open",
      done_at: done ? new Date() : null,
    })
    .where(
      and(
        eq(client_task.id, taskId),
        eq(client_task.organization_id, owner.organizationId),
        eq(client_task.is_template, false),
      ),
    )
    .returning({ id: client_task.id })

  return updated.length > 0
}

/** Deletes either a task or a template — the row's own `is_template` decides
 * which, the caller does not need to know. */
export async function deleteClientTask(
  owner: OwnerScope,
  taskId: string,
): Promise<boolean> {
  if (!UUID.test(taskId)) return false

  const deleted = await betaDb()
    .delete(client_task)
    .where(
      and(
        eq(client_task.id, taskId),
        eq(client_task.organization_id, owner.organizationId),
      ),
    )
    .returning({ id: client_task.id })

  return deleted.length > 0
}

// ---------------------------------------------------------------------------
// Office writes — template CRUD
// ---------------------------------------------------------------------------

export type ClientTaskTemplateWriteInput = {
  readonly title: string
  readonly description?: string | null
  /** 1-31; clamped to the target month's real last day at generation time. */
  readonly templateDueDay: number
  readonly linkKind?: BetaClientTaskLinkKind
}

function validateTemplateInput(input: {
  title: string
  templateDueDay: number
}): ClientTaskRefusal | "invalid_due_day" | null {
  if (normalizeText(input.title) === null) return "invalid_title"
  if (
    !Number.isInteger(input.templateDueDay) ||
    input.templateDueDay < 1 ||
    input.templateDueDay > 31
  ) {
    return "invalid_due_day"
  }
  return null
}

type ClientTaskTemplateRefusal = ClientTaskRefusal | "invalid_due_day"

export type ClientTaskTemplateResult =
  { ok: true; id: string } | { ok: false; reason: ClientTaskTemplateRefusal }

/** Create a template (`is_template = true`). */
export async function createClientTaskTemplate(
  owner: OwnerScope,
  input: ClientTaskTemplateWriteInput,
): Promise<ClientTaskTemplateResult> {
  const refusal = validateTemplateInput(input)
  if (refusal) return { ok: false, reason: refusal }

  const [row] = await betaDb()
    .insert(client_task)
    .values({
      organization_id: owner.organizationId,
      is_template: true,
      title: normalizeText(input.title)!,
      description: normalizeText(input.description ?? null),
      template_due_day: input.templateDueDay,
      link_kind: input.linkKind ?? "none",
      created_by: owner.userId,
    })
    .returning({ id: client_task.id })

  if (!row) throw new Error("client_task template insert returned no row")
  return { ok: true, id: row.id }
}

export type ClientTaskTemplatePatch = Partial<{
  title: string
  description: string | null
  templateDueDay: number
  linkKind: BetaClientTaskLinkKind
}>

export async function updateClientTaskTemplate(
  owner: OwnerScope,
  templateId: string,
  patch: ClientTaskTemplatePatch,
): Promise<ClientTaskTemplateResult> {
  if (!UUID.test(templateId)) return { ok: false, reason: "not_found" }
  if (patch.title !== undefined && normalizeText(patch.title) === null) {
    return { ok: false, reason: "invalid_title" }
  }
  if (
    patch.templateDueDay !== undefined &&
    (!Number.isInteger(patch.templateDueDay) ||
      patch.templateDueDay < 1 ||
      patch.templateDueDay > 31)
  ) {
    return { ok: false, reason: "invalid_due_day" }
  }

  const values = {
    ...(patch.title !== undefined
      ? { title: normalizeText(patch.title)! }
      : {}),
    ...("description" in patch
      ? { description: normalizeText(patch.description ?? null) }
      : {}),
    ...(patch.templateDueDay !== undefined
      ? { template_due_day: patch.templateDueDay }
      : {}),
    ...(patch.linkKind !== undefined ? { link_kind: patch.linkKind } : {}),
  }
  if (Object.keys(values).length === 0) return { ok: true, id: templateId }

  const [row] = await betaDb()
    .update(client_task)
    .set(values)
    .where(
      and(
        eq(client_task.id, templateId),
        eq(client_task.organization_id, owner.organizationId),
        eq(client_task.is_template, true),
      ),
    )
    .returning({ id: client_task.id })

  return row ? { ok: true, id: row.id } : { ok: false, reason: "not_found" }
}

// ---------------------------------------------------------------------------
// "Vytvořit měsíční sadu úkolů" (spec §3.4) — the monthly-set button
// ---------------------------------------------------------------------------

export type MonthlySetInput = {
  readonly year: number
  readonly month: number
}

type MonthlySetResult = {
  readonly periodId: string
  readonly created: number
  readonly alreadyExisted: number
}

type MonthlySetRefusal = "invalid_period"

export type MonthlySetOutcome =
  | { ok: true; result: MonthlySetResult }
  | { ok: false; reason: MonthlySetRefusal }

/**
 * Instantiate every active template into a dated task for the chosen month —
 * spec §3.4: "instantiates all template tasks for chosen month ... 30
 * seconds instead of 10×2 min". Scoped to THIS organization (one Pro účetní
 * section = one book, same as every other write in this app); the "across
 * active orgs" time saving spec §3.4 describes is the office running this
 * once per client rather than typing each client's tasks by hand, not a
 * single click that reaches into other organizations' books.
 *
 * IDEMPOTENCY MECHANISM. One statement: `INSERT ... SELECT <every active
 * template> ... ON CONFLICT (organization_id, source_template_id,
 * source_period_id) WHERE source_template_id IS NOT NULL DO NOTHING`. The
 * conflict target is `client_task_source_unique` (migration 0009), a partial
 * UNIQUE index on exactly that triple. Running this twice for the same
 * (org, year, month):
 *   - 1st run  — the period does not exist yet (`ensureReportingPeriod`
 *     creates it) and no `client_task` row carries this
 *     (source_template_id, source_period_id) pair yet, so every active
 *     template's row inserts.
 *   - 2nd run  — `ensureReportingPeriod` returns the SAME period id (its own
 *     identity UNIQUE), and every candidate row now conflicts against the
 *     row the 1st run already inserted, so `DO NOTHING` skips all of them.
 * The database enforces this, not an application-side "does a row already
 * exist" check — two clicks racing each other resolve the same way a single
 * click followed by a second one does.
 *
 * A template deleted between the two runs simply stops being a candidate —
 * this reads active templates fresh, every time, off `client_task` itself
 * rather than off a value captured earlier.
 *
 * NO spec §2.11 EVENT-2 NOTIFICATION FIRES HERE, DELIBERATELY. `createClientTask`
 * above fires one per ad-hoc task — "a new client_task" in the singular the
 * spec names. This function can mint one row per active template in the SAME
 * click ("30 seconds instead of 10×2 min" is the whole point), so notifying
 * per generated row would turn one office click into a mail blast at the
 * client, which is a worse notification experience than the feature this
 * button replaces. A single "your monthly tasks are ready" digest is a
 * plausible future addition; it is not spec §2.11's literal 3rd item and is
 * out of this PR's scope.
 */
export async function createMonthlyTaskSet(
  owner: OwnerScope,
  input: MonthlySetInput,
): Promise<MonthlySetOutcome> {
  if (
    !Number.isInteger(input.year) ||
    input.year < 2000 ||
    input.year > 2100 ||
    !Number.isInteger(input.month) ||
    input.month < 1 ||
    input.month > 12
  ) {
    return { ok: false, reason: "invalid_period" }
  }

  const period = await ensureReportingPeriod(owner, {
    kind: "month",
    year: input.year,
    month: input.month,
  })

  const totalRows = await betaDb().execute<{ total: number }>(sql`
    SELECT count(*)::int AS total
      FROM client_task
     WHERE organization_id = ${owner.organizationId}
       AND is_template = true
  `)
  const totalTemplates =
    (totalRows as unknown as { total: number }[])[0]?.total ?? 0

  const inserted = await betaDb().execute<{ id: string }>(sql`
    WITH month_end AS (
      SELECT EXTRACT(
        DAY FROM (
          make_date(${input.year}::int, ${input.month}::int, 1)
          + interval '1 month - 1 day'
        )
      )::int AS last_day
    )
    INSERT INTO client_task (
      organization_id, is_template, title, description, due_date, link_kind,
      source_template_id, source_period_id, created_by
    )
    SELECT
      t.organization_id,
      false,
      t.title,
      t.description,
      make_date(
        ${input.year}::int,
        ${input.month}::int,
        LEAST(t.template_due_day::int, month_end.last_day)
      ),
      t.link_kind,
      t.id,
      ${period.id}::uuid,
      ${owner.userId}::uuid
    FROM client_task t, month_end
    WHERE t.organization_id = ${owner.organizationId}
      AND t.is_template = true
    ON CONFLICT (organization_id, source_template_id, source_period_id)
      WHERE source_template_id IS NOT NULL
    DO NOTHING
    RETURNING id
  `)

  const created = (inserted as unknown as { id: string }[]).length
  return {
    ok: true,
    result: {
      periodId: period.id,
      created,
      alreadyExisted: totalTemplates - created,
    },
  }
}
