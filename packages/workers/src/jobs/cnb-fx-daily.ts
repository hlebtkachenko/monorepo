/**
 * cnb-fx-daily job — fetch the Czech National Bank daily FX fix and upsert one
 * `fx_rate` row per registered foreign currency (to CZK, kind DAILY, source CNB).
 *
 * Ported from the lac archive, adapted to our schema + tenancy:
 *   - RAW storage: we store the ČNB `rate` (kurz) and `amount` (množství, ∈
 *     {1,100,1000}) VERBATIM into `fx_rate.rate` / `fx_rate.unit_amount` (0072).
 *     The archive pre-divided to a per-unit rate; we do NOT — the resolver
 *     (`@workspace/accounting` `convertAmount`/`effectiveRate`) divides by
 *     unit_amount in SQL, so the ingest does zero money arithmetic and no
 *     rounding-mode question arises (the whole pipeline rounds half-away in SQL,
 *     matching capture.ts). The raw ČNB kurz stays auditable.
 *   - Registry = the `currency` table. `fx_rate.from_code REFERENCES currency`,
 *     so an unseeded ČNB code would FK-violate and roll back the whole batch;
 *     filtering is a correctness requirement, not tidiness.
 *   - Writes run under `withAdminBypass`: `fx_rate` is a no-RLS catalog and
 *     `app_user` holds SELECT only (0072).
 *   - Idempotent via the `(from_code,to_code,rate_date,rate_kind,source)` natural
 *     unique: a rerun for the same date refreshes the row.
 */

import { sql } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { logger } from "@workspace/observability"

const CNB_BASE_URL = "https://api.cnb.cz/cnbapi/exrates/daily"
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** One row of `https://api.cnb.cz/cnbapi/exrates/daily`. */
export interface CnbRateRow {
  /** YYYY-MM-DD the rate is valid for. */
  validFor: string
  /** ISO 4217 code of the foreign currency. */
  currencyCode: string
  /** množství — the unit count the rate is quoted per (1 | 100 | 1000). */
  amount: number
  /** kurz — CZK per `amount` units of the foreign currency. */
  rate: number
}

/**
 * Validate one wire row by hand (workers carries no zod). The ČNB JSON wire
 * format is the only place a money value arrives as a JS `number`; we do NO
 * arithmetic on it — `rate`/`amount` are stringified straight into the numeric
 * INSERT, and for the 3-dp ČNB kurz the shortest round-trip string is exact.
 */
function parseRow(x: unknown): CnbRateRow | null {
  if (typeof x !== "object" || x === null) return null
  const r = x as Record<string, unknown>
  const { validFor, currencyCode, amount, rate } = r
  if (typeof validFor !== "string" || !DATE_RE.test(validFor)) return null
  if (typeof currencyCode !== "string" || currencyCode.length === 0) return null
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)
    return null
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0)
    return null
  return { validFor, currencyCode, amount, rate }
}

/** Today in Europe/Prague as YYYY-MM-DD (the ČNB fix's timezone). */
function todayInPrague(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** Fetch + parse the ČNB rates for an ISO date. Split out so a backfill/test can inject a fixture. */
async function fetchCnbRates(dateIso: string): Promise<CnbRateRow[]> {
  const url = `${CNB_BASE_URL}?date=${encodeURIComponent(dateIso)}&lang=EN`
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    throw new Error(
      `cnb-fx-daily: HTTP ${res.status} ${res.statusText} for ${url}`,
    )
  }
  const body = (await res.json()) as { rates?: unknown }
  if (!Array.isArray(body.rates)) {
    throw new Error("cnb-fx-daily: response has no rates array")
  }
  return body.rates
    .map(parseRow)
    .filter((row): row is CnbRateRow => row !== null)
}

export interface CnbFxDailyPayload {
  /** YYYY-MM-DD; defaults to today in Europe/Prague (also the manual-backfill hook). */
  date?: string
}

export interface CnbFxDailyDeps {
  /** Test/backfill hook: inject a fixture fetcher instead of the live HTTP call. */
  fetchRates?: (dateIso: string) => Promise<CnbRateRow[]>
}

export interface CnbFxDailyResult {
  upserted: number
  skippedSelf: number
  skippedNotInRegistry: number
  received: number
}

/**
 * Fetch the ČNB fix for `date` (default today Prague) and upsert one `fx_rate`
 * row per registered foreign currency. Stores the ČNB `rate` + `amount` verbatim;
 * skips CZK (self-rate) and any code not present in the `currency` table.
 */
export async function handleCnbFxDaily(
  payload: CnbFxDailyPayload = {},
  deps: CnbFxDailyDeps = {},
): Promise<CnbFxDailyResult> {
  const dateIso = payload.date ?? todayInPrague()
  const log = logger.child({ task: "cnb-fx-daily", date: dateIso })
  log.info("task.start")

  const rows = await (deps.fetchRates ?? fetchCnbRates)(dateIso)
  const result: CnbFxDailyResult = {
    upserted: 0,
    skippedSelf: 0,
    skippedNotInRegistry: 0,
    received: rows.length,
  }

  if (rows.length === 0) {
    log.warn("task.empty")
    return result
  }

  await withAdminBypass(async (db) => {
    // Registry = currencies we actually carry; an unseeded code FK-violates and
    // would roll back every upsert in this one transaction.
    const known = (await db.execute(
      sql`SELECT code FROM currency`,
    )) as unknown as Array<{ code: string }>
    const registry = new Set(known.map((r) => r.code.trim()))

    for (const row of rows) {
      if (row.currencyCode === "CZK") {
        result.skippedSelf += 1
        continue
      }
      if (!registry.has(row.currencyCode)) {
        result.skippedNotInRegistry += 1
        continue
      }
      await db.execute(sql`
        INSERT INTO fx_rate
          (from_code, to_code, rate_date, rate_kind, unit_amount, rate, source)
        VALUES
          (${row.currencyCode}, 'CZK', ${row.validFor}::date, 'DAILY',
           ${row.amount}, ${String(row.rate)}::numeric, 'CNB')
        ON CONFLICT (from_code, to_code, rate_date, rate_kind, source)
        DO UPDATE SET rate = EXCLUDED.rate,
                      unit_amount = EXCLUDED.unit_amount,
                      updated_at = now()
      `)
      result.upserted += 1
    }
  })

  log.info({ ...result }, "task.ok")
  return result
}
