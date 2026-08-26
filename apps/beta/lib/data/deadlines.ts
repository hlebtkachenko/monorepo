import "server-only"

import { sql } from "drizzle-orm"

import { betaDb } from "@/db/client"
import type {
  BetaClientTaskLinkKind,
  BetaFilingFamily,
  BetaFilingKind,
} from "@/db/schema"

import { obligationUnionSql } from "./obligations"
import type { OrgScope } from "./scope"

/**
 * Přehled › Nejbližší termíny — the ONE unified deadline list (spec §2.1 item 2,
 * Advisor F25).
 *
 * §2.1 states it as a set union: "filings ∪ obligations ∪ due client_tasks,
 * origin chips (Úřad / Platba / Od účetní), next 5 by due date". The three
 * origins are three DIFFERENT ACTS, not three tables that happen to hold dates,
 * and reading them that way is what makes the union honest:
 *
 *   urad    — a form that has not been FILED yet. The act is "podat".
 *   platba  — money that has not been PAID yet. The act is "zaplatit".
 *   ucetni  — something the office asked the client for. The act is "poslat".
 *
 * A FILING CAN LEGITIMATELY APPEAR TWICE, once as `urad` and once as `platba`,
 * and that is deliberate rather than a missing dedup. An unfiled DPH přiznání
 * with an amount owed is two outstanding acts on the same day: file the form,
 * pay the money. Filing it clears the `urad` row and leaves the `platba` row
 * standing, which is exactly the client's real position — collapsing the two
 * would make one of the two acts silently disappear the moment the other was
 * done, and the one that would disappear is the payment.
 *
 * THE MONEY ARM IS NOT RE-DERIVED HERE. It is `obligationUnionSql` — §2.4's own
 * union, imported whole — so the rules that decide what counts as a debt (a
 * nadměrný odpočet is not one; a manual liability cannot name a filing) have
 * exactly one definition, and PR 28's partner_saldo arm reaches this list by
 * being added there. This module contributes no opinion about money at all.
 *
 * OVERDUE ROWS ARE IN, AND SORT FIRST. `ORDER BY due_on ASC` puts a missed
 * deadline above every upcoming one, so `LIMIT 5` can legitimately return five
 * overdue rows and no upcoming ones. That is the right answer: a client with
 * five missed deadlines does not have a "next" problem. `overdue` is derived in
 * SQL against `CURRENT_DATE`, never stored (§2.4).
 *
 * SHIPS NO DISPLAY STRINGS, like every other module in `lib/data`. A filing
 * arrives as its `kind` and the UI maps it through `FILING_KIND_LABEL_KEY`; a
 * liability and a task arrive as the office's own words, which are never
 * translated.
 */

/** Which act is outstanding — spec §2.1's three origin chips. */
export type DeadlineOrigin = "urad" | "platba" | "ucetni"

/** One row of Nejbližší termíny. */
export type UpcomingDeadline = {
  /**
   * `${origin}:${sourceId}`. The origin has to be part of the key: one filing
   * can produce both a `urad` and a `platba` row (see the header), so a bare id
   * would collide as a React key on exactly the rows that matter most.
   */
  key: string
  origin: DeadlineOrigin
  /**
   * The filing kind behind this row, for `urad` and for a filing-sourced
   * `platba`; null for a manual liability and for a task. The UI turns it into a
   * Czech form name.
   */
  filingKind: BetaFilingKind | null
  /**
   * The §2.3 family, on `urad` rows only — it is what the row's link
   * deep-links to. Null on every other origin: a payment links to Dluhy a
   * platby and a task links through its own `linkKind`.
   */
  family: BetaFilingFamily | null
  /** The office's own words: a liability's titul, a task's title. Never translated. */
  label: string | null
  /** `numeric(14,2)` as a string, on `platba` rows only. Null elsewhere. */
  amount: string | null
  /** The module a task points at, on `ucetni` rows only (spec §3.4). */
  linkKind: BetaClientTaskLinkKind | null
  /** Splatnost / termín podání / termín úkolu, whichever this row is. */
  dueOn: string
  /** Derived in SQL against `CURRENT_DATE` — never a stored column. */
  overdue: boolean
  daysOverdue: number
}

/**
 * How many rows §2.1 asks for ("next 5 by due date"), and the ceiling a caller
 * may raise it to.
 *
 * The cap is not decoration: `limit` reaches a `LIMIT` clause, and an
 * unclamped one from a caller that took it off a query string would be an
 * unbounded read of a client book. Clamped at the boundary, once, here.
 */
export const DEADLINE_LIMIT_DEFAULT = 5
const DEADLINE_LIMIT_MAX = 20

type DeadlineRow = {
  origin: DeadlineOrigin
  source_id: string
  filing_kind: BetaFilingKind | null
  family: BetaFilingFamily | null
  label: string | null
  amount: string | null
  link_kind: BetaClientTaskLinkKind | null
  due_on: string
  overdue: boolean
  days_overdue: number
}

function deadlineRowsQuery(organizationId: string, limit: number) {
  return sql<DeadlineRow>`
    WITH obligation AS (${obligationUnionSql(organizationId)}),
    deadline AS (
      -- ORIGIN 1/3 — Úřad: a form still to be filed.
      --
      -- filed_on IS NULL rather than a status test. status carries the
      -- workflow (planned / filed / confirmed / corrective) and a corrective
      -- filing is one that WAS filed; filed_on is the fact itself, and it is
      -- the column Souhrn's own upcoming strip already filters on. Two surfaces
      -- answering "has this been filed" two different ways is how they start
      -- disagreeing.
      --
      -- Deliberately NOT filtered on paid/unpaid: filing a form and paying the
      -- money it declares are the two acts this list keeps apart.
      SELECT
        'urad'::text                                AS origin,
        f.id                                        AS source_id,
        f.kind::text                                AS filing_kind,
        beta_filing_family(f.kind)::text            AS family,
        NULL::text                                  AS label,
        NULL::numeric                               AS amount,
        NULL::text                                  AS link_kind,
        f.due_on                                    AS due_on
      FROM filing f
      WHERE f.organization_id = ${organizationId}
        AND f.filed_on IS NULL

      UNION ALL

      -- ORIGIN 2/3 — Platba: §2.4's obligation union, whole. Every arm it
      -- grows (PR 28's partner_saldo) appears here without this file changing.
      SELECT
        'platba'::text                              AS origin,
        o.source_id                                 AS source_id,
        o.filing_kind                               AS filing_kind,
        NULL::text                                  AS family,
        o.label                                     AS label,
        o.amount                                    AS amount,
        NULL::text                                  AS link_kind,
        o.due_on                                    AS due_on
      FROM obligation o

      UNION ALL

      -- ORIGIN 3/3 — Od účetní: the open, non-template tasks of §3.4, the same
      -- rows "Co od vás potřebujeme" renders above this list. They are here
      -- BECAUSE they are the same rows: a client reading a deadline list has to
      -- see the office's own ask next to the state's, or the list is not the
      -- one place to look that §2.1 designs it to be.
      SELECT
        'ucetni'::text                              AS origin,
        c.id                                        AS source_id,
        NULL::text                                  AS filing_kind,
        NULL::text                                  AS family,
        c.title                                     AS label,
        NULL::numeric                               AS amount,
        c.link_kind::text                           AS link_kind,
        c.due_date                                  AS due_on
      FROM client_task c
      WHERE c.organization_id = ${organizationId}
        AND c.is_template = false
        AND c.status = 'open'
    )
    SELECT
      d.origin, d.source_id, d.filing_kind, d.family, d.label, d.link_kind,
      d.amount::text                                   AS amount,
      d.due_on::text                                   AS due_on,
      (d.due_on < CURRENT_DATE)                        AS overdue,
      GREATEST(CURRENT_DATE - d.due_on, 0)             AS days_overdue
    FROM deadline d
    -- origin then source_id break a same-day tie deterministically, so two
    -- renders of an unchanged book never reorder the list under the reader.
    ORDER BY d.due_on ASC, d.origin ASC, d.source_id ASC
    LIMIT ${limit}
  `
}

/**
 * The next `limit` outstanding deadlines of `scope`'s organization, soonest
 * first.
 *
 * Every role may call this: §5 makes guest an external viewer of the same
 * client-visible data, and all three sources are client-visible on their own
 * pages already. There is no write here and no role branch — what a guest may
 * not do is CHANGE any of the three, and none of them is writable from this
 * module.
 */
export async function upcomingDeadlinesForScope(
  scope: OrgScope,
  options: { readonly limit?: number } = {},
): Promise<UpcomingDeadline[]> {
  const requested = options.limit ?? DEADLINE_LIMIT_DEFAULT
  const limit = Math.min(
    Math.max(
      Number.isInteger(requested) ? requested : DEADLINE_LIMIT_DEFAULT,
      1,
    ),
    DEADLINE_LIMIT_MAX,
  )

  const rows = await betaDb().execute(
    deadlineRowsQuery(scope.organizationId, limit),
  )

  return (rows as unknown as DeadlineRow[]).map((row) => ({
    key: `${row.origin}:${row.source_id}`,
    origin: row.origin,
    filingKind: row.filing_kind,
    family: row.family,
    label: row.label,
    amount: row.amount,
    linkKind: row.link_kind,
    dueOn: row.due_on,
    overdue: row.overdue,
    daysOverdue: Number(row.days_overdue),
  }))
}
