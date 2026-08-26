import "server-only"

import { notFound } from "next/navigation"
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { chat, chat_message, chat_usage, organization } from "@/db/schema"
import {
  assistantSurfaceEnabled,
  pragueDay,
  pragueMonthStart,
  pragueNextMonthStart,
  type AssistantConfig,
} from "@/lib/assistant/config"
import {
  ASSISTANT_SYSTEM_PROMPT_VERSION,
  type AssistantOrgFacts,
} from "@/lib/assistant/system-prompt.cs"
import type { AssistantTurnMessage } from "@/lib/assistant/provider"

import {
  chatMessageView,
  chatSummary,
  type ChatMessageView,
  type ChatSummary,
} from "./projections"
import type { OrgScope } from "./scope"

/**
 * Asistent data — chats, transcripts, and the budget ledger (spec §2.8).
 *
 * The same three seam properties every org-scoped module in this app has (see
 * `organizations.ts`): the first parameter is an `OrgScope` the caller cannot
 * invent, the WHERE clause filters on `scope.organizationId`, and a projection
 * comes back rather than a row. This module adds a FOURTH filter that the
 * others do not need — `chat.user_id = scope.userId` on every read and every
 * write. A chat is private to the person who typed it; an admin and a member in
 * the same book must not see each other's questions, and that is a property of
 * these queries, not of the UI that calls them.
 *
 * THE ORG-FACTS FENCE. `assistantOrgFacts` selects exactly two columns and
 * returns exactly two fields. It is the ONLY function in this file that reads
 * `organization`, and no function here reads `document`, `filing`,
 * `trial_balance_line`, `payroll_*` or any other book table — spec §2.8's
 * "documents/figures never enter context" is enforced by there being no query
 * that could fetch them, not by a rule someone has to remember.
 */

/**
 * Who may reach Asistent at all (spec §5: "guest unlinked ... no Asistent",
 * "guest + employee link = employee seat ... no Asistent").
 *
 * Stated as the ALLOW list rather than as `role !== "guest"`, so a role added
 * to `beta_org_role` later is excluded by default rather than admitted by
 * default. The employee seat of §2.6.1 is a `guest` membership, so excluding
 * `guest` excludes both cases the spec names — and it keeps excluding them when
 * the seat's payroll link lands (PR 32/33) with no change here.
 */
const ASSISTANT_ROLES = new Set(["owner", "admin", "member"])

export function assistantVisibleTo(scope: OrgScope): boolean {
  return assistantSurfaceEnabled() && ASSISTANT_ROLES.has(scope.role)
}

/**
 * The module's door: 404 unless the surface is switched on AND the caller's
 * role may use it.
 *
 * BOTH REFUSALS ARE 404, and identical. A 403 on the role case would confirm
 * the module exists to a guest, and a distinguishable "feature disabled"
 * response would let anyone probe whether Hleb has flipped the exposure gate on
 * a given deployment. Same reasoning as `requireScope`'s uniform 404, applied
 * one level in.
 */
export function assertAssistantAvailable(scope: OrgScope): void {
  if (!assistantVisibleTo(scope)) notFound()
}

/**
 * The two facts — and only the two facts — the system prompt is ever told.
 *
 * The SELECT names two columns, so a column added to `organization` later
 * cannot arrive here by accident, and the returned object is built by explicit
 * pick, so nothing else can be smuggled in by spread.
 */
export async function assistantOrgFacts(
  scope: OrgScope,
): Promise<AssistantOrgFacts> {
  const [row] = await betaDb()
    .select({
      legalName: organization.legal_name,
      vatRegime: organization.vat_regime,
    })
    .from(organization)
    .where(eq(organization.id, scope.organizationId))
    .limit(1)

  if (!row) notFound()
  return { legalName: row.legalName, vatRegime: row.vatRegime }
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------

export async function chatsForScope(
  scope: OrgScope,
): Promise<readonly ChatSummary[]> {
  const rows = await betaDb()
    .select({
      id: chat.id,
      title: chat.title,
      updated_at: chat.updated_at,
    })
    .from(chat)
    .where(
      and(
        eq(chat.organization_id, scope.organizationId),
        eq(chat.user_id, scope.userId),
      ),
    )
    .orderBy(desc(chat.updated_at))
    // The sidebar is a list, not an archive. 200 is far past what a beta client
    // will produce in the 12 months retention keeps, and it bounds the query.
    .limit(200)

  return rows.map(chatSummary)
}

export type ChatDetail = {
  readonly chat: ChatSummary
  readonly messages: readonly ChatMessageView[]
}

/**
 * One chat and its full transcript, or `null`.
 *
 * `null` rather than 404 so the caller decides: a page answers 404, the chat
 * route answers a JSON error. The three ways to get `null` — no such id, a
 * chat in another book, a chat belonging to another person — are one query and
 * one outcome, for the reason `resolveOrgScope` gives about two statements
 * having two observable failure modes.
 */
export async function chatForScope(
  scope: OrgScope,
  chatId: string,
): Promise<ChatDetail | null> {
  const [row] = await betaDb()
    .select({ id: chat.id, title: chat.title, updated_at: chat.updated_at })
    .from(chat)
    .where(
      and(
        eq(chat.id, chatId),
        eq(chat.organization_id, scope.organizationId),
        eq(chat.user_id, scope.userId),
      ),
    )
    .limit(1)

  if (!row) return null

  const messages = await betaDb()
    .select({
      id: chat_message.id,
      role: chat_message.role,
      content: chat_message.content,
      created_at: chat_message.created_at,
    })
    .from(chat_message)
    .where(
      and(
        eq(chat_message.chat_id, chatId),
        eq(chat_message.organization_id, scope.organizationId),
      ),
    )
    .orderBy(asc(chat_message.id))

  return { chat: chatSummary(row), messages: messages.map(chatMessageView) }
}

/**
 * Does this chat exist, in this book, for this person?
 *
 * Exists so the chat route can refuse an unknown or foreign chat BEFORE it
 * consumes the caller's daily allowance. `chatForScope` would answer the same
 * question, but it also reads the whole transcript, which is a lot of rows to
 * fetch in order to throw them away.
 */
export async function chatOwnedByScope(
  scope: OrgScope,
  chatId: string,
): Promise<boolean> {
  const [row] = await betaDb()
    .select({ id: chat.id })
    .from(chat)
    .where(
      and(
        eq(chat.id, chatId),
        eq(chat.organization_id, scope.organizationId),
        eq(chat.user_id, scope.userId),
      ),
    )
    .limit(1)

  return row !== undefined
}

export async function createChat(scope: OrgScope): Promise<ChatSummary> {
  const [row] = await betaDb()
    .insert(chat)
    .values({
      organization_id: scope.organizationId,
      user_id: scope.userId,
      // Stamped at creation, never updated: a chat's transcript was produced by
      // the prompt in force when it started, even if the file changes later.
      prompt_version: ASSISTANT_SYSTEM_PROMPT_VERSION,
    })
    .returning({ id: chat.id, title: chat.title, updated_at: chat.updated_at })

  if (!row) throw new Error("chat insert returned no row")
  return chatSummary(row)
}

/**
 * Rename a chat. `false` when the chat is not this person's, in this book.
 *
 * A blank title clears the name back to NULL rather than storing whitespace —
 * `chat_title_shape` refuses a blank string outright, and "clear the name" is a
 * thing a rename form's empty field obviously means.
 */
export async function renameChat(
  scope: OrgScope,
  chatId: string,
  title: string,
): Promise<boolean> {
  const trimmed = title.trim()
  if (trimmed.length > 120) return false

  const rows = await betaDb()
    .update(chat)
    .set({ title: trimmed === "" ? null : trimmed })
    .where(
      and(
        eq(chat.id, chatId),
        eq(chat.organization_id, scope.organizationId),
        eq(chat.user_id, scope.userId),
      ),
    )
    .returning({ id: chat.id })

  return rows.length === 1
}

/** Delete a chat and, by `chat_message_chat_fk` CASCADE, its transcript. */
export async function deleteChat(
  scope: OrgScope,
  chatId: string,
): Promise<boolean> {
  const rows = await betaDb()
    .delete(chat)
    .where(
      and(
        eq(chat.id, chatId),
        eq(chat.organization_id, scope.organizationId),
        eq(chat.user_id, scope.userId),
      ),
    )
    .returning({ id: chat.id })

  return rows.length === 1
}

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

/**
 * Append one message and bump the chat's `updated_at` in the SAME transaction.
 *
 * The bump is what makes `updated_at` the retention key (spec §2.8: chats older
 * than 12 months are purged): a conversation still in use must not be swept
 * because it was created 13 months ago. Doing it in one transaction is what
 * stops a message from existing under a chat the purge has already decided is
 * stale.
 *
 * `false` when the chat is not this person's, in this book — the ownership
 * check is the UPDATE's own WHERE clause, so there is no read-then-write window
 * for the chat to change hands in (it cannot: `chat_freeze_identity`).
 */
export async function appendChatMessage(
  scope: OrgScope,
  chatId: string,
  message: { role: "user" | "assistant"; content: string },
): Promise<boolean> {
  const content = message.content.trim()
  if (content === "") return false

  return betaDb().transaction(async (tx) => {
    // The `set` is nominal — `chat_touch_updated_at` writes `now()` on every
    // UPDATE regardless, which is exactly why `updated_at` is a trustworthy
    // retention key. What this statement is really for is the OWNERSHIP CHECK
    // in its WHERE clause plus the row lock it takes, both inside the same
    // transaction as the insert below.
    const touched = await tx
      .update(chat)
      .set({ updated_at: new Date() })
      .where(
        and(
          eq(chat.id, chatId),
          eq(chat.organization_id, scope.organizationId),
          eq(chat.user_id, scope.userId),
        ),
      )
      .returning({ id: chat.id })

    if (touched.length !== 1) return false

    await tx.insert(chat_message).values({
      organization_id: scope.organizationId,
      chat_id: chatId,
      role: message.role,
      content,
    })
    return true
  })
}

/**
 * The last `historyMessages` turns of a chat, oldest first — budget control 5
 * (spec §2.8: "history truncation `BETA_ASSISTANT_HISTORY_MESSAGES` (20)").
 *
 * Truncation happens IN THE QUERY, not in the caller: a route that forgot to
 * slice would otherwise send an unbounded transcript to a per-token API. The
 * select takes the NEWEST rows (`id` is uuidv7, so the primary key IS the
 * chronological order) and they are put back into reading order here.
 *
 * A TRUNCATED WINDOW CAN START ON THE WRONG SPEAKER, and that is a 400 from the
 * Messages API rather than a cosmetic wart: the first message it accepts must be
 * a `user` turn, and a window that happens to cut between a question and its
 * answer begins on the answer. Any leading assistant turns are therefore
 * dropped — they are the tail of an exchange whose question has already fallen
 * out of the window, so they carry no context the model can use anyway.
 */
export async function chatHistoryForTurn(
  scope: OrgScope,
  chatId: string,
  historyMessages: number,
): Promise<readonly AssistantTurnMessage[]> {
  const rows = await betaDb()
    .select({
      id: chat_message.id,
      role: chat_message.role,
      content: chat_message.content,
    })
    .from(chat_message)
    .where(
      and(
        eq(chat_message.chat_id, chatId),
        eq(chat_message.organization_id, scope.organizationId),
      ),
    )
    .orderBy(desc(chat_message.id))
    .limit(historyMessages)

  const oldestFirst = rows.reverse()
  const firstUser = oldestFirst.findIndex((row) => row.role === "user")
  if (firstUser === -1) return []

  return oldestFirst
    .slice(firstUser)
    .map((row) => ({ role: row.role, content: row.content }))
}

// ---------------------------------------------------------------------------
// Budget (spec §2.8's five controls; 1, 2 and 3 live here)
// ---------------------------------------------------------------------------

export type AssistantBudgetRefusal = "daily_limit" | "monthly_budget"

export type AssistantReservation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: AssistantBudgetRefusal }

/**
 * Control 1 + control 3, PREFLIGHT — before any provider call.
 *
 * ORDER MATTERS. The install-wide monthly budget is checked FIRST, as a plain
 * read: a month that is already spent must refuse without consuming anyone's
 * daily allowance, because the refusal is not the client's fault. Only then is
 * the daily slot taken.
 *
 * THE DAILY SLOT IS TAKEN BY THE CHECK ITSELF. `INSERT ... ON CONFLICT DO
 * UPDATE ... RETURNING message_count` increments and reads in ONE statement, so
 * fifty concurrent requests get fifty distinct numbers and exactly one of them
 * is the fifty-first. A read-then-write would let a burst walk straight past the
 * allowance, which is the failure mode a rate limit exists to prevent.
 *
 * A REFUSED TURN STILL BURNED ITS SLOT. Deliberate: the increment cannot be
 * rolled back without re-opening the race above, and someone already at the
 * ceiling is refused either way. It costs nothing — a refusal makes no provider
 * call, so `input_tokens` / `output_tokens` stay untouched and the two counters
 * remain independently readable.
 *
 * THE MONTHLY CHECK CAN OVERSHOOT BY A FEW CONCURRENT TURNS, since it is a read
 * and not a lock. The overshoot is bounded by `max_tokens` per in-flight turn,
 * which is itself control 4. Serializing every send behind one lock to close a
 * bounded overshoot would make the assistant single-threaded across every
 * client.
 */
export async function reserveAssistantTurn(
  scope: OrgScope,
  config: Pick<AssistantConfig, "userDailyMessages" | "monthlyTokenBudget">,
  now: Date = new Date(),
): Promise<AssistantReservation> {
  const usageDate = pragueDay(now)

  // BOTH ENDS of the month, never a bare `>= monthStart`: an unbounded upper
  // end sums every later-dated row into this month's total, and a turn started
  // just before Prague midnight is already recorded under tomorrow's date.
  const [spent] = await betaDb()
    .select({
      total: sql<string>`coalesce(sum(${chat_usage.input_tokens} + ${chat_usage.output_tokens}), 0)`,
    })
    .from(chat_usage)
    .where(
      and(
        gte(chat_usage.usage_date, pragueMonthStart(usageDate)),
        lt(chat_usage.usage_date, pragueNextMonthStart(usageDate)),
      ),
    )

  if (Number(spent?.total ?? 0) >= config.monthlyTokenBudget) {
    return { ok: false, reason: "monthly_budget" }
  }

  const [reserved] = await betaDb()
    .insert(chat_usage)
    .values({
      organization_id: scope.organizationId,
      user_id: scope.userId,
      usage_date: usageDate,
      message_count: 1,
    })
    .onConflictDoUpdate({
      target: [
        chat_usage.organization_id,
        chat_usage.user_id,
        chat_usage.usage_date,
      ],
      set: { message_count: sql`${chat_usage.message_count} + 1` },
    })
    .returning({ messageCount: chat_usage.message_count })

  if ((reserved?.messageCount ?? 0) > config.userDailyMessages) {
    return { ok: false, reason: "daily_limit" }
  }

  return { ok: true }
}

/**
 * Control 2, POSTFLIGHT — the atomic upsert of what the provider reported.
 *
 * Called with whatever the provider said, including for a turn that failed
 * mid-stream: those tokens were spent and the budget must know. The row already
 * exists (the reservation created it), so the INSERT arm is only reached if the
 * Prague day rolled over between reservation and response — in which case
 * charging the new day is the right answer, not an error.
 */
export async function recordAssistantUsage(
  scope: OrgScope,
  usage: { inputTokens: number; outputTokens: number },
  now: Date = new Date(),
): Promise<void> {
  const inputTokens = Math.max(0, Math.trunc(usage.inputTokens))
  const outputTokens = Math.max(0, Math.trunc(usage.outputTokens))
  if (inputTokens === 0 && outputTokens === 0) return

  await betaDb()
    .insert(chat_usage)
    .values({
      organization_id: scope.organizationId,
      user_id: scope.userId,
      usage_date: pragueDay(now),
      message_count: 0,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    })
    .onConflictDoUpdate({
      target: [
        chat_usage.organization_id,
        chat_usage.user_id,
        chat_usage.usage_date,
      ],
      set: {
        input_tokens: sql`${chat_usage.input_tokens} + ${inputTokens}`,
        output_tokens: sql`${chat_usage.output_tokens} + ${outputTokens}`,
      },
    })
}

// ---------------------------------------------------------------------------
// Retention (spec §2.8: "chats >12 months purged (scheduled job)")
// ---------------------------------------------------------------------------

/** Twelve months, as the spec states it. */
export const CHAT_RETENTION_MONTHS = 12

export function chatRetentionCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - CHAT_RETENTION_MONTHS)
  return cutoff
}

/**
 * Delete every chat untouched for longer than the retention window, across all
 * books, and report how many went.
 *
 * NOT SCOPE-GATED, ON PURPOSE, AND THAT IS WHY IT TAKES NO SCOPE AT ALL: a
 * retention sweep is a maintenance act over the whole database, not one
 * tenant's read, so giving it an `OrgScope` parameter would be a lie about what
 * it touches. It is reachable only from a job — nothing in `app/` imports it —
 * and it deletes purely by age, never by a caller-supplied identifier.
 *
 * The scheduling half belongs to the hardening PR (spec §6 item 37, "retention
 * jobs"); this is the operation it will call, shipped with its own test so the
 * scheduler has nothing to get wrong except the cron expression.
 */
export async function purgeExpiredChats(
  now: Date = new Date(),
): Promise<number> {
  const rows = await betaDb()
    .delete(chat)
    .where(lt(chat.updated_at, chatRetentionCutoff(now)))
    .returning({ id: chat.id })

  return rows.length
}
