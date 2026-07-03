import {
  decimalToMinor,
  firedHardClassSignals,
} from "@workspace/brain/confidence"
import { and, eq, inArray, type OrganizationBoundDb } from "@workspace/db"
import { account } from "@workspace/db/schema"

/**
 * The SERVER-side confidence veto (closes the confident-wrong hole in #462's
 * gate, which trusted the CLIENT's `confidence` scalar at face value).
 *
 * A client can claim `confidence: 1.0` on a wrong booking; these checks derive
 * the dangerous hard-class / VAT signals from the payload the SERVER can verify
 * and force a HOLD when one fires, regardless of the claimed confidence. The
 * claimed confidence stays NECESSARY (>= threshold) but is no longer SUFFICIENT.
 *
 * Deliberately SCOPED (advisor-gated): only signals the payload actually betrays
 * and that the domain does NOT already reject. `balance_mismatch` is OUT — the
 * DB enforces double-entry balance. The full evidence-contract (client submits
 * structured signals, server re-verifies bank/KB/extraction) is the documented
 * follow-up; this veto covers the two payload-derivable vectors.
 */
export interface VetoResult {
  /** True => force HOLD even if the client claimed an auto-apply confidence. */
  readonly held: boolean
  /** The infra signals that fired (persisted to the audit trail). */
  readonly signals: readonly string[]
}

const NO_VETO: VetoResult = { held: false, signals: [] }

/** Absolute value of a bigint (a storno/negative amount still counts toward the DHM threshold). */
const abs = (v: bigint): bigint => (v < 0n ? -v : v)

/**
 * Capitalization-plausible expense accounts — the classic prior error is a fixed
 * asset (042 -> 022) expensed to consumption/services. Explicitly EXCLUDES 52x
 * payroll, 54x/55x, 56x financial (never capitalization candidates) so the veto
 * does not flood the queue with legitimate salary/rent/service postings.
 */
const CAPITALIZATION_EXPENSE_SYNTHETICS: ReadonlySet<string> = new Set([
  "501", // spotřeba materiálu
  "511", // opravy a udržování (can be a capitalizable technical improvement)
  "518", // ostatní služby
])

/** ±1 Kč (100 haléř): absorbs legitimate per-invoice VAT rounding, catches gross errors. */
const VAT_TOLERANCE_MINOR = 100n

/**
 * Posting veto — fires `asset_vs_expense` when a DEBIT to a capitalization-
 * plausible expense account (aggregated per account within the posting) reaches
 * the DHM 40 000 Kč threshold. ONLY double-entry postings carry accounts/sides;
 * monetary (cash-book) postings pass through untouched.
 */
export async function derivePostingVeto(
  db: OrganizationBoundDb,
  organizationId: string,
  kind: unknown,
  entry: unknown,
): Promise<VetoResult> {
  if (kind !== "double") return NO_VETO
  const lines =
    (entry as { lines?: ReadonlyArray<Record<string, unknown>> }).lines ?? []

  // Aggregate DEBIT amounts (haléř) per accountId — a single asset split across
  // several lines to the same account still crosses the threshold as one sum.
  const debitByAccount = new Map<string, bigint>()
  for (const line of lines) {
    if (line["side"] !== "DEBIT") continue
    const accountId = line["accountId"]
    const amount = line["amount"]
    if (typeof accountId !== "string" || typeof amount !== "string") continue
    debitByAccount.set(
      accountId,
      (debitByAccount.get(accountId) ?? 0n) + abs(decimalToMinor(amount)),
    )
  }
  if (debitByAccount.size === 0) return NO_VETO

  // Resolve accountId -> account.number inside the RLS-scoped tx (the payload
  // carries UUIDs, not codes). Only the caller's org is visible (FORCE RLS).
  const rows = await db
    .select({ id: account.id, number: account.number })
    .from(account)
    .where(
      and(
        eq(account.organization_id, organizationId),
        inArray(account.id, [...debitByAccount.keys()]),
      ),
    )

  // Aggregate per SYNTHETIC (3-digit) account, not per analytic accountId — a
  // 50k asset split across analytics 518.001 + 518.002 must still cross the DHM
  // threshold as one 518 sum (advisor-flagged split-evasion).
  const debitBySynthetic = new Map<string, bigint>()
  for (const row of rows) {
    const synthetic = row.number.replace(".", "").slice(0, 3)
    if (!CAPITALIZATION_EXPENSE_SYNTHETICS.has(synthetic)) continue
    debitBySynthetic.set(
      synthetic,
      (debitBySynthetic.get(synthetic) ?? 0n) +
        (debitByAccount.get(row.id) ?? 0n),
    )
  }

  const signals = new Set<string>()
  for (const agg of debitBySynthetic.values()) {
    const fired = firedHardClassSignals(["asset_vs_expense"], {
      amountMinor: agg,
    })
    for (const s of fired) signals.add(s)
  }
  return signals.size > 0 ? { held: true, signals: [...signals] } : NO_VETO
}

/**
 * Capture veto — fires `vat_mismatch` when a STANDARD-rate partial's declared
 * `vatAmount` diverges from `base * rate / 100` by more than the tolerance. The
 * domain stores `vatAmount` as given (it never re-derives it), so this is the
 * only server check of VAT arithmetic. Non-STANDARD modes (REVERSE_CHARGE /
 * EXEMPT / OUTSIDE_VAT / IMPORT) and partials without a declared vatAmount pass
 * through — their VAT lives on the recipient / is zero, not `base * rate`.
 */
export function deriveCaptureVeto(
  lines: ReadonlyArray<Record<string, unknown>>,
): VetoResult {
  for (const line of lines ?? []) {
    const partials =
      (line["partials"] as ReadonlyArray<Record<string, unknown>>) ?? []
    for (const p of partials) {
      if (p["vatMode"] !== "STANDARD") continue
      const vatAmount = p["vatAmount"]
      const vatRate = p["vatRate"]
      const baseAmount = p["baseAmount"]
      if (
        typeof vatAmount !== "string" ||
        typeof vatRate !== "string" ||
        typeof baseAmount !== "string"
      ) {
        continue
      }
      const baseMinor = abs(decimalToMinor(baseAmount))
      // rate "21.00" -> 2100 hundredths-of-a-percent; expected = base * rate/100.
      const rateScaled = decimalToMinor(vatRate)
      const expected = (baseMinor * rateScaled + 5000n) / 10000n
      const actual = abs(decimalToMinor(vatAmount))
      const diff = actual > expected ? actual - expected : expected - actual
      if (diff > VAT_TOLERANCE_MINOR) {
        return { held: true, signals: ["vat_mismatch"] }
      }
    }
  }
  return NO_VETO
}
