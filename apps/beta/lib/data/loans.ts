import "server-only"

import { and, asc, eq, sql } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import {
  loan,
  type BetaLoanInstallmentPeriod,
  type BetaLoanKind,
} from "@/db/schema"

import { loanView, type LoanView } from "./projections"
import type { OrgScope, OwnerScope } from "./scope"

/**
 * Úvěry a leasingy — the loan register (spec §2.4, Finance's fifth sidebar
 * leaf).
 *
 * SHALLOW BY DESIGN (spec depth map: "Úvěry ... table + stamp suffices"). One
 * list read, two writes, no detail read: there is no Karta for a loan the way
 * there is for an asset, because §2.4 gives this leaf a single flat table of
 * eight columns and nothing underneath it.
 *
 * READS ARE FOR EVERY ROLE, same as `assets.ts` (spec §5: guest is an external
 * VIEWER of client-visible data, not a blinded one) — the read below takes a
 * plain `OrgScope`.
 *
 * WRITES ARE OWNER-ONLY (spec §3.3: client pages are read-only for every role).
 * Both writes take an `OwnerScope`, so a caller cannot reach one with a
 * member's or a guest's handle even by mistake; the caller mints it with
 * `requireOwner(await requireScope(orgSlug))` as its first statement — see
 * `app/(portal)/[orgSlug]/finance/uvery/_actions/loans.ts`.
 *
 * THE ONE ARITHMETIC, AND THE ONE THIS FILE REFUSES TO DO. The footer sums
 * `principal` and `balance` in SQL, which spec §0.2 allows (a sum over rows the
 * office already provided). It does NOT sum `installment`: those figures are
 * denominated in different frequencies — a monthly leasing splátka and a
 * quarterly úvěr splátka do not add up to anything a person could name — and
 * normalizing them to a monthly equivalent would be this product inventing a
 * number, which §0.2 forbids outright. The per-row splátka is printed next to
 * its frequency and never aggregated.
 */

/** The Úvěry footer SUMs, over exactly the rows the WHERE clause kept. */
const TOTAL_PRINCIPAL = sql<string>`SUM(${loan.principal}) OVER ()`
/**
 * NULL when no row carries a stated zůstatek — `SUM` skips NULLs, so a total
 * over a partly-filled book would read as the whole book's debt. The page
 * pairs this with `balanceStatedCount` below and only prints it when the two
 * agree, the same guard `assetResidualSummaryForScope` documents at length.
 */
const TOTAL_BALANCE = sql<string | null>`SUM(${loan.balance}) OVER ()`
const BALANCE_STATED_COUNT = sql<number>`
  count(${loan.balance}) OVER ()
`
const ROW_COUNT = sql<number>`count(*) OVER ()`

const LOAN_COLUMNS = {
  id: loan.id,
  institution: loan.institution,
  loan_kind: loan.loan_kind,
  principal: loan.principal,
  balance: loan.balance,
  balance_as_of: loan.balance_as_of,
  installment: loan.installment,
  installment_period: loan.installment_period,
  interest_rate_pct: loan.interest_rate_pct,
  ends_on: loan.ends_on,
  note_client: loan.note_client,
  updated_at: loan.updated_at,
}

const ZERO = "0.00"

export type LoanListResult = {
  loans: LoanView[]
  totals: {
    /** SQL sum over every listed row (spec §0.2), as a string. */
    principal: string
    /**
     * SQL sum of the STATED zůstatky only, or null when none is stated.
     * Meaningless on its own — read it with the two counts below.
     */
    balance: string | null
    /** How many listed rows carry a stated zůstatek. */
    balanceStatedCount: number
    /** How many rows were listed at all. */
    loanCount: number
  }
}

/**
 * The Úvěry a leasingy table, alphabetical by instituce (spec §2.4 states no
 * other order).
 */
export async function loansForScope(scope: OrgScope): Promise<LoanListResult> {
  const rows = await betaDb()
    .select({
      ...LOAN_COLUMNS,
      totalPrincipal: TOTAL_PRINCIPAL,
      totalBalance: TOTAL_BALANCE,
      balanceStatedCount: BALANCE_STATED_COUNT,
      loanCount: ROW_COUNT,
    })
    .from(loan)
    .where(eq(loan.organization_id, scope.organizationId))
    .orderBy(asc(loan.institution), asc(loan.id))

  const first = rows[0]

  return {
    loans: rows.map(loanView),
    totals: {
      // No row means no rows matched, and there is no window aggregate to read
      // off an empty result — an empty book totals to zero, not to nothing.
      principal: first?.totalPrincipal ?? ZERO,
      balance: first?.totalBalance ?? null,
      balanceStatedCount: Number(first?.balanceStatedCount ?? 0),
      loanCount: Number(first?.loanCount ?? 0),
    },
  }
}

// ---------------------------------------------------------------------------
// Office writes — owner-only, spec §3.3
// ---------------------------------------------------------------------------

/**
 * WHAT THE PORTAL IS ALLOWED TO WRITE. Every money value arrives as a STRING
 * and is stored verbatim (spec §0.7) — this file never parses, adds or rounds
 * one, and `interestRatePct` (a percent, not money) travels the same way.
 *
 * The two both-or-neither pairs the database enforces
 * (`loan_balance_stamp_coherence`, `loan_installment_coherence`) are mirrored
 * in this type's field pairs rather than left to the caller to discover through
 * a constraint violation.
 */
export type LoanWriteInput = {
  readonly institution: string
  readonly loanKind: BetaLoanKind
  readonly principal: string
  readonly balance?: string | null
  readonly balanceAsOf?: string | null
  readonly installment?: string | null
  readonly installmentPeriod?: BetaLoanInstallmentPeriod | null
  readonly interestRatePct?: string | null
  readonly endsOn?: string | null
  readonly noteClient?: string | null
  readonly noteInternal?: string | null
}

export async function createLoan(
  scope: OwnerScope,
  input: LoanWriteInput,
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string }> {
  const [row] = await executor
    .insert(loan)
    .values({
      organization_id: scope.organizationId,
      institution: input.institution,
      loan_kind: input.loanKind,
      principal: input.principal,
      balance: input.balance ?? null,
      balance_as_of: input.balanceAsOf ?? null,
      installment: input.installment ?? null,
      installment_period: input.installmentPeriod ?? null,
      interest_rate_pct: input.interestRatePct ?? null,
      ends_on: input.endsOn ?? null,
      note_client: input.noteClient ?? null,
      note_internal: input.noteInternal ?? null,
    })
    .returning({ id: loan.id })

  if (!row) throw new Error("loan insert returned no row")
  return row
}

export type LoanPatch = Partial<LoanWriteInput>

/**
 * Edit a loan.
 *
 * The WHERE clause carries `organization_id` even though `id` is a primary
 * key — without it, an id leaked or guessed from anywhere would let a holder of
 * ANY scope edit ANY loan; this database has no RLS behind the seam to catch
 * it. Returns whether a row matched, so the caller can report "not found"
 * rather than a successful save of nothing.
 */
export async function updateLoan(
  scope: OwnerScope,
  loanId: string,
  patch: LoanPatch,
  executor: BetaExecutor = betaDb(),
): Promise<boolean> {
  const values = {
    ...("institution" in patch ? { institution: patch.institution } : {}),
    ...("loanKind" in patch ? { loan_kind: patch.loanKind } : {}),
    ...("principal" in patch ? { principal: patch.principal } : {}),
    ...("balance" in patch ? { balance: patch.balance ?? null } : {}),
    ...("balanceAsOf" in patch
      ? { balance_as_of: patch.balanceAsOf ?? null }
      : {}),
    ...("installment" in patch
      ? { installment: patch.installment ?? null }
      : {}),
    ...("installmentPeriod" in patch
      ? { installment_period: patch.installmentPeriod ?? null }
      : {}),
    ...("interestRatePct" in patch
      ? { interest_rate_pct: patch.interestRatePct ?? null }
      : {}),
    ...("endsOn" in patch ? { ends_on: patch.endsOn ?? null } : {}),
    ...("noteClient" in patch ? { note_client: patch.noteClient ?? null } : {}),
    ...("noteInternal" in patch
      ? { note_internal: patch.noteInternal ?? null }
      : {}),
  }

  if (Object.keys(values).length === 0) return true

  const updated = await executor
    .update(loan)
    .set(values)
    .where(
      and(eq(loan.id, loanId), eq(loan.organization_id, scope.organizationId)),
    )
    .returning({ id: loan.id })

  return updated.length > 0
}
