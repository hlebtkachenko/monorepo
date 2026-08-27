/**
 * The demo seed, and the freshness audit that keeps it from rotting.
 *
 * WHY THIS FILE LIVES IN THE `db` PROJECT rather than beside the script. Most of
 * what is worth asserting here needs a real Postgres: the seed's whole job is to
 * satisfy twenty tables' worth of CHECK constraints and BEFORE-INSERT triggers,
 * and a suite that mocked those would be asserting against its own idea of the
 * schema. `scripts/**` is in neither vitest project's `include`, so the file
 * belongs to the project that already boots the database it needs.
 *
 * THE SOURCE SCAN RIDES ALONG. It is pure — it reads two files and greps them —
 * but splitting it into the `pure` project would mean a second file and a second
 * entry in the vitest config for a check that costs a millisecond next to a
 * container that is already running.
 */
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  auditDemoPlan,
  buildDemoPlan,
  DEMO_ANCHOR,
  findAbsoluteDateLiterals,
  icoCheckDigit,
  syntheticIco,
} from "../scripts/demo-seed-plan"
import { seedDemo, wipeDemo } from "../scripts/demo-seed"

// Better Auth's instance is built at import time from these; set before the
// dynamic import below, exactly as `tests/fixtures.ts` does.
process.env["BETTER_AUTH_SECRET"] ??= `beta-test-secret-${"x".repeat(40)}`
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3200"

const SCRIPTS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../scripts",
)
const PASSWORD = "Afframe-Demo-Test-Heslo"

let sql: postgres.Sql

beforeAll(() => {
  const url = process.env["DATABASE_URL"]
  if (!url)
    throw new Error(
      "DATABASE_URL is not set — tests/global-setup.ts did not run",
    )
  sql = postgres(url, { max: 4, onnotice: () => {} })
})

afterAll(async () => {
  const plan = buildDemoPlan()
  await wipeDemo(sql, plan)
  await sql.end({ timeout: 5 })
})

describe("the seed carries no absolute dates but the anchor", () => {
  it.each(["demo-seed-plan.ts", "demo-seed.ts"])(
    "%s has no hardcoded date, year or literal Date",
    async (file) => {
      const source = await readFile(resolve(SCRIPTS_DIR, file), "utf8")
      const hits = findAbsoluteDateLiterals(source)

      // Reported with the offending line so a failure names what to fix rather
      // than only that something is wrong.
      expect(
        hits.map((hit) => `${file}:${hit.line} "${hit.match}" — ${hit.text}`),
      ).toEqual([])
    },
  )

  it("would catch a date that a later edit hardcoded", () => {
    const hits = findAbsoluteDateLiterals(
      ['const dueOn = "2026-09-25"', "const year = 2026"].join("\n"),
    )
    expect(hits).toHaveLength(3)
  })

  it("exempts only the anchor's own declaration", () => {
    expect(
      findAbsoluteDateLiterals('export const DEMO_ANCHOR = "2026-08-27"'),
    ).toEqual([])
  })
})

describe("the plan stays coherent wherever the anchor is moved", () => {
  // A spread that covers the shapes the month arithmetic can land on: the demo
  // date itself, a January (where the year on show is the previous one), a
  // month with one published period, a leap day, and years further out.
  const anchors = [
    DEMO_ANCHOR,
    "2026-01-04",
    "2026-02-28",
    "2026-03-01",
    "2027-12-31",
    "2028-02-29",
    "2029-06-15",
    "2031-11-30",
  ]

  it.each(anchors)("%s produces no audit finding", (anchor) => {
    expect(auditDemoPlan(buildDemoPlan(anchor))).toEqual([])
  })

  it.each(anchors)(
    "%s publishes through the month that just ended, never further back",
    (anchor) => {
      const plan = buildDemoPlan(anchor)
      const newest = plan.months[plan.months.length - 1]!.close.ym

      expect(plan.months.length).toBeGreaterThan(0)
      expect(newest).toEqual(plan.lastClosed)
      // §0.4's band is "current" up to one period of lag; the seed always sits
      // at exactly one, which is the office publishing last month during this one.
      expect(newest.year * 12 + newest.month).toBe(
        plan.currentMonth.year * 12 + plan.currentMonth.month - 1,
      )
    },
  )

  it("nothing is dated after the demo date", () => {
    for (const anchor of anchors) {
      const plan = buildDemoPlan(anchor)
      for (const month of plan.months) {
        expect(month.publishedOn <= plan.today).toBe(true)
      }
      for (const document of plan.documents) {
        expect(document.createdAt.slice(0, 10) <= plan.today).toBe(true)
      }
      for (const filing of plan.filings) {
        if (filing.filedOn) expect(filing.filedOn <= plan.today).toBe(true)
      }
    }
  })
})

describe("scripts stay operator tooling", () => {
  /**
   * `scripts/` is exempt from the SF-3 `app_user` write fence
   * (`lib/auth/app-user-writes.boundary.test.ts`) because nothing there is
   * reachable from a request — the seed writes `app_user` in raw SQL exactly as
   * a migration does. That exemption is only sound while the "nothing reachable"
   * half stays true, so it is asserted rather than assumed: the day a route or a
   * data module imports a script, this fails and the exemption gets revisited.
   */
  it("are imported by nothing that ships", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs")
    const { join, relative } = await import("node:path")
    const root = resolve(SCRIPTS_DIR, "..")
    const skip = new Set([
      "node_modules",
      ".next",
      "scripts",
      "tests",
      "public",
      "fonts",
    ])

    const offenders: string[] = []
    const walk = (current: string): void => {
      for (const entry of readdirSync(current)) {
        if (skip.has(entry)) continue
        const full = join(current, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        // Suites may import a script — this one does. What must not is code
        // that ships.
        if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue
        const source = readFileSync(full, "utf8")
        // Any module specifier that resolves into `scripts/`, under any of the
        // spellings — static import, re-export, dynamic import, require.
        if (/["'`][^"'`]*(?:^|\/|\.\.\/)scripts\//.test(source)) {
          offenders.push(relative(root, full))
        }
      }
    }
    walk(root)

    expect(offenders).toEqual([])
  })
})

describe("synthetic IČO", () => {
  it("computes the standard mod-11 check digit", () => {
    // A real, published IČO — Městská část Praha 12 — as the reference the
    // algorithm has to reproduce.
    expect(icoCheckDigit("0023115")).toBe(1)
  })

  it("mints identifiers that validate and are outside the allocated range", () => {
    for (let sequence = 1; sequence <= 20; sequence += 1) {
      const ico = syntheticIco(sequence)
      expect(ico).toMatch(/^88\d{6}$/)
      expect(icoCheckDigit(ico.slice(0, 7))).toBe(Number(ico.slice(7)))
    }
  })
})

describe("seeding the demo organization", () => {
  /**
   * Every assertion below is scoped to the demo organization.
   *
   * The `db` project shares one database across every file in the suite, and
   * the other suites seed their own organizations into it. A query that read
   * `import_batch` or `trial_balance_line` whole would therefore assert about
   * whatever else happened to be in the database, and would pass or fail on
   * file ordering rather than on this seed.
   */
  const demoOrgId = async (): Promise<string> => {
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM organization WHERE slug = ${buildDemoPlan().organization.slug}
    `
    if (!row) throw new Error("the demo organization is not seeded")
    return row.id
  }

  beforeAll(async () => {
    const { problems } = await seedDemo(sql, { password: PASSWORD })
    expect(problems).toEqual([])
  })

  it("writes the whole firm, and re-running rebuilds it exactly", async () => {
    const countsOf = async (): Promise<Record<string, number>> => {
      const organizationId = await demoOrgId()
      const tables = [
        "organization_membership",
        "reporting_period",
        "import_batch",
        "statement_line",
        "trial_balance_line",
        "partner",
        "partner_saldo",
        "payroll_employee",
        "payroll_summary",
        "payroll_employee_line",
        "document",
        "filing",
        "liability",
        "client_task",
        "asset",
        "asset_event",
        "loan",
        "account_balance_map",
      ]
      const entries = await Promise.all(
        tables.map(async (table) => {
          const [row] = await sql<{ n: string }[]>`
            SELECT count(*)::text AS n FROM ${sql(table)}
             WHERE organization_id = ${organizationId}
          `
          return [table, Number(row!.n)] as const
        }),
      )
      return { organization: 1, ...Object.fromEntries(entries) }
    }

    const after = await countsOf()

    // The shape of the demo, asserted rather than described: a change to the
    // story is a deliberate edit to these numbers, not a silent drift.
    expect(after).toEqual({
      organization: 1,
      organization_membership: 4,
      reporting_period: 11,
      import_batch: 35,
      statement_line: 231,
      trial_balance_line: 154,
      partner: 8,
      partner_saldo: 56,
      payroll_employee: 7,
      payroll_summary: 7,
      payroll_employee_line: 46,
      document: 35,
      filing: 41,
      liability: 3,
      client_task: 7,
      asset: 6,
      asset_event: 8,
      loan: 2,
      account_balance_map: 2,
    })

    // Wipe-and-reseed, not upsert: the second run must leave the same state,
    // not twice as much of it.
    const second = await seedDemo(sql, { password: PASSWORD })
    expect(second.problems).toEqual([])
    expect(await countsOf()).toEqual(after)
  })

  it("publishes every dataset, and every batch reached `published`", async () => {
    const rows = await sql<{ dataset: string; status: string }[]>`
      SELECT dataset, status FROM import_batch
       WHERE organization_id = ${await demoOrgId()}
    `
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.status === "published")).toBe(true)
    expect(new Set(rows.map((row) => row.dataset))).toEqual(
      new Set(["predvaha", "rozvaha", "vzz", "saldokonto", "payroll"]),
    )
  })

  it("balances the rozvaha and ties it to the VZZ, in the database", async () => {
    const [row] = await sql<
      {
        months: string
        balanced: string
        netto_ok: string
        result_ok: string
      }[]
    >`
      WITH batch AS (
        SELECT id, period_id FROM import_batch
         WHERE organization_id = ${await demoOrgId()}
      ), aktiva AS (
        SELECT b.period_id, sl.value_netto AS netto, sl.value_brutto AS brutto,
               sl.value_korekce AS korekce
          FROM statement_line sl JOIN batch b ON b.id = sl.import_batch_id
         WHERE sl.statement_kind = 'rozvaha_aktiva' AND sl.row_code = '001'
      ), pasiva AS (
        SELECT b.period_id, sl.value_bezne AS total
          FROM statement_line sl JOIN batch b ON b.id = sl.import_batch_id
         WHERE sl.statement_kind = 'rozvaha_pasiva' AND sl.row_code = '078'
      ), result AS (
        SELECT b.period_id, sl.value_bezne AS v
          FROM statement_line sl JOIN batch b ON b.id = sl.import_batch_id
         WHERE sl.statement_kind = 'rozvaha_pasiva' AND sl.row_code = '090'
      ), vzz AS (
        SELECT b.period_id, sl.value_bezne AS v
          FROM statement_line sl JOIN batch b ON b.id = sl.import_batch_id
         WHERE sl.statement_kind = 'vzz' AND sl.row_code = '53'
      )
      SELECT count(*)::text AS months,
             count(*) FILTER (WHERE a.netto = p.total)::text AS balanced,
             count(*) FILTER (WHERE a.netto = a.brutto - a.korekce)::text AS netto_ok,
             count(*) FILTER (WHERE r.v = v.v)::text AS result_ok
        FROM aktiva a
        JOIN pasiva p USING (period_id)
        JOIN result r USING (period_id)
        JOIN vzz v USING (period_id)
    `
    expect(Number(row!.months)).toBeGreaterThan(0)
    expect(row!.balanced).toBe(row!.months)
    expect(row!.netto_ok).toBe(row!.months)
    expect(row!.result_ok).toBe(row!.months)
  })

  it("keeps the předvaha in double entry", async () => {
    const organizationId = await demoOrgId()

    const broken = await sql<{ id: string }[]>`
      SELECT import_batch_id AS id
        FROM trial_balance_line
       WHERE organization_id = ${organizationId}
       GROUP BY 1
      HAVING sum(turnover_debit) <> sum(turnover_credit)
          OR sum(closing_balance) <> 0
    `
    expect(broken).toHaveLength(0)

    const [row] = await sql<{ bad: string; total: string }[]>`
      SELECT count(*) FILTER (
               WHERE closing_balance
                     <> opening_balance + turnover_debit - turnover_credit
             )::text AS bad,
             count(*)::text AS total
        FROM trial_balance_line WHERE organization_id = ${organizationId}
    `
    expect(Number(row!.total)).toBeGreaterThan(0)
    expect(row!.bad).toBe("0")
  })

  it("ties saldokonto to the rozvaha's receivables and payables", async () => {
    const [row] = await sql<{ months: string; recv: string; pay: string }[]>`
      WITH batch AS (
        SELECT id, period_id, dataset FROM import_batch
         WHERE organization_id = ${await demoOrgId()}
      ), saldo AS (
        SELECT b.period_id,
               sum(coalesce(ps.receivable_total, 0)) AS recv,
               sum(coalesce(ps.payable_total, 0)) AS pay
          FROM partner_saldo ps JOIN batch b ON b.id = ps.import_batch_id
         GROUP BY 1
      ), rozvaha AS (
        SELECT b.period_id,
               max(a.value_netto) FILTER (WHERE a.row_code = '049') AS pohledavky,
               max(p.value_bezne) FILTER (WHERE p.row_code = '112') AS zavazky
          FROM batch b
          LEFT JOIN statement_line a
                 ON a.import_batch_id = b.id AND a.statement_kind = 'rozvaha_aktiva'
          LEFT JOIN statement_line p
                 ON p.import_batch_id = b.id AND p.statement_kind = 'rozvaha_pasiva'
         WHERE b.dataset = 'rozvaha'
         GROUP BY 1
      )
      SELECT count(*)::text AS months,
             count(*) FILTER (WHERE s.recv = r.pohledavky)::text AS recv,
             count(*) FILTER (WHERE s.pay = r.zavazky)::text AS pay
        FROM saldo s JOIN rozvaha r USING (period_id)
    `
    expect(Number(row!.months)).toBeGreaterThan(0)
    expect(row!.recv).toBe(row!.months)
    expect(row!.pay).toBe(row!.months)
  })

  it("keeps the payroll recap and its lines in agreement", async () => {
    const [row] = await sql<
      {
        recaps: string
        cost: string
        net: string
        lines: string
        heads: string
      }[]
    >`
      SELECT count(*)::text AS recaps,
             count(*) FILTER (
               WHERE s.employer_cost_total
                     = s.gross_total + s.employer_social + s.employer_health
             )::text AS cost,
             count(*) FILTER (
               WHERE s.net_paid_total = s.gross_total - s.employee_withholdings_total
             )::text AS net,
             count(*) FILTER (
               WHERE l.gross = s.gross_total AND l.net = s.net_paid_total
             )::text AS lines,
             count(*) FILTER (
               WHERE l.n = s.headcount_hpp + s.headcount_dpc + s.headcount_dpp
             )::text AS heads
        FROM payroll_summary s
        JOIN (
          SELECT import_batch_id, sum(gross) AS gross, sum(net) AS net, count(*) AS n
            FROM payroll_employee_line GROUP BY 1
        ) l USING (import_batch_id)
       WHERE s.organization_id = ${await demoOrgId()}
    `
    expect(Number(row!.recaps)).toBeGreaterThan(0)
    expect(row!.cost).toBe(row!.recaps)
    expect(row!.net).toBe(row!.recaps)
    expect(row!.lines).toBe(row!.recaps)
    expect(row!.heads).toBe(row!.recaps)
  })

  it("gives Účty a hotovost the same cash the rozvaha states", async () => {
    const [row] = await sql<{ months: string; matching: string }[]>`
      WITH batch AS (
        SELECT id, period_id FROM import_batch
         WHERE organization_id = ${await demoOrgId()}
      ), mapped AS (
        SELECT b.period_id, sum(t.closing_balance) AS cash
          FROM trial_balance_line t
          JOIN batch b ON b.id = t.import_batch_id
          JOIN account_balance_map m
            ON m.organization_id = t.organization_id
           AND m.account_code = t.account_code
         GROUP BY 1
      ), rozvaha AS (
        SELECT b.period_id, sl.value_netto AS cash
          FROM statement_line sl JOIN batch b ON b.id = sl.import_batch_id
         WHERE sl.statement_kind = 'rozvaha_aktiva' AND sl.row_code = '070'
      )
      SELECT count(*)::text AS months,
             count(*) FILTER (WHERE m.cash = r.cash)::text AS matching
        FROM mapped m JOIN rozvaha r USING (period_id)
    `
    expect(Number(row!.months)).toBeGreaterThan(0)
    expect(row!.matching).toBe(row!.months)
  })

  it("leaves something unpaid, so Dluhy a platby is not empty", async () => {
    const organizationId = await demoOrgId()
    const [filings] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM filing
       WHERE organization_id = ${organizationId}
         AND amount_due IS NOT NULL AND paid_at IS NULL
    `
    const [liabilities] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM liability
       WHERE organization_id = ${organizationId} AND paid_at IS NULL
    `
    expect(Number(filings!.n) + Number(liabilities!.n)).toBeGreaterThan(0)
  })

  it("hides payslips from Dokumenty and links exactly one employee seat", async () => {
    const organizationId = await demoOrgId()

    const [documents] = await sql<{ payslips: string; returned: string }[]>`
      SELECT count(*) FILTER (WHERE doc_type = 'payslip')::text AS payslips,
             count(*) FILTER (
               WHERE status = 'returned' AND coalesce(btrim(office_message), '') <> ''
             )::text AS returned
        FROM document WHERE organization_id = ${organizationId}
    `
    expect(Number(documents!.payslips)).toBeGreaterThan(0)
    expect(Number(documents!.returned)).toBeGreaterThan(0)

    // Every payslip states whose it is and for which period — that pair is what
    // `payrollScope` filters the Výplatnice list on.
    const [unbound] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM document
       WHERE organization_id = ${organizationId} AND doc_type = 'payslip'
         AND (payslip_employee_id IS NULL OR payslip_period_id IS NULL)
    `
    expect(unbound!.n).toBe("0")

    const [seats] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM payroll_employee
       WHERE organization_id = ${organizationId} AND app_user_id IS NOT NULL
    `
    expect(seats!.n).toBe("1")
  })

  it("signs the seeded accounts in through Better Auth's own credential path", async () => {
    const { betaAuth } = await import("@/lib/auth/server")
    const { BETA_SESSION_COOKIE_NAME } = await import("@/lib/auth/policy")
    const plan = buildDemoPlan()

    for (const user of plan.users) {
      const response = await betaAuth().api.signInEmail({
        body: { email: user.email, password: PASSWORD },
        asResponse: true,
      })
      const cookie = response.headers
        .getSetCookie()
        .find((value) => value.startsWith(BETA_SESSION_COOKIE_NAME))

      // The hash this seed writes has to be the one Better Auth verifies —
      // otherwise every demo account is locked out of the demo.
      expect(cookie, `no session cookie for ${user.email}`).toBeDefined()
    }
  })
})
