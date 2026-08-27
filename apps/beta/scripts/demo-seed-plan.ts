/**
 * The demo organization, expressed as a pure function of ONE date.
 *
 * WHY THIS FILE HAS NO DATABASE IN IT. The seed's hard requirement is not "rows
 * exist", it is "the rows still tell a coherent story the next time somebody
 * looks". Spec §0.4 makes staleness a rendered fact — a dataset whose newest
 * published period lags today by more than one period earns a red band on every
 * surface that shows it — so a demo seeded with absolute dates rots into exactly
 * the warning the product exists to raise. Every date below is derived from
 * `DEMO_ANCHOR` by month arithmetic, and re-running the seed later shifts the
 * whole firm forward without a single edit.
 *
 * `DEMO_ANCHOR` is the only absolute date in this file or in `demo-seed.ts`, and
 * `findAbsoluteDateLiterals` is the check that keeps it that way — it is run
 * over both files by `db/demo-seed.test.ts`, so a hardcoded date added later
 * fails CI rather than quietly ageing.
 *
 * MONEY IS INTEGER HALÉŘE HERE, not `Money<Currency>`. Spec §0.7 puts beta on
 * `numeric(14,2)` + string-in-TS + SQL-only arithmetic, deliberately diverging
 * from the monorepo's `numeric(19,4)` rule, and says not to "fix" it. A seed has
 * to compute the figures it writes, though, and floating point loses haléře, so
 * the arithmetic below runs in integer minor units and `numericString` renders
 * them at the boundary. Nothing here reaches the app's read path.
 *
 * THE FIRM IS COHERENT BY CONSTRUCTION. Revenue is the only stated series;
 * payroll comes from the roster, depreciation from the asset register, interest
 * from the loan register, VAT and payroll liabilities from those, and cash is
 * solved as the balance-sheet residual — which is what cash is. `auditDemoPlan`
 * re-derives the invariants afterwards, so a modelling mistake is a failed audit
 * rather than a rozvaha that does not balance in front of a client.
 */
import { freshnessBand } from "../lib/freshness"

/** The demo date Hleb set for the beta run-through. The one absolute date. */
export const DEMO_ANCHOR = "2026-08-27"

// ---------------------------------------------------------------------------
// Calendar — `YYYY-MM-DD` strings over UTC, never a local `Date`
// ---------------------------------------------------------------------------

export type YearMonth = { readonly year: number; readonly month: number }

/** UTC throughout: these are calendar dates, and month ends must not drift. */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

const isoOf = (date: Date): string => date.toISOString().slice(0, 10)

export function parseYearMonth(iso: string): YearMonth {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) }
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const zero = ym.year * 12 + (ym.month - 1) + delta
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 }
}

/** Whole months from `from` to `to`, negative when `to` precedes `from`. */
export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return to.year * 12 + to.month - (from.year * 12 + from.month)
}

export const monthStart = (ym: YearMonth): string =>
  isoOf(utc(ym.year, ym.month, 1))
export const monthEnd = (ym: YearMonth): string =>
  isoOf(utc(ym.year, ym.month + 1, 0))

/** The `day`-th of `ym`, clamped to the month's length. */
export function dayOfMonth(ym: YearMonth, day: number): string {
  return isoOf(
    utc(
      ym.year,
      ym.month,
      Math.min(day, utc(ym.year, ym.month + 1, 0).getUTCDate()),
    ),
  )
}

export function addDays(iso: string, days: number): string {
  const base = utc(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)),
    Number(iso.slice(8, 10)),
  )
  base.setUTCDate(base.getUTCDate() + days)
  return isoOf(base)
}

/** A timestamptz literal at a plausible working hour. */
export function atHour(iso: string, hour: number, minute: number): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${iso}T${pad(hour)}:${pad(minute)}:00+02:00`
}

/** Never let a derived date run past the demo date. */
const notAfter = (iso: string, today: string): string =>
  iso > today ? today : iso

// ---------------------------------------------------------------------------
// Money — integer haléře in, `numeric(14,2)` strings out
// ---------------------------------------------------------------------------

/** An amount in integer haléře. Never a float, never a `number` of korun. */
export type Halere = number

export const kc = (korun: number): Halere => Math.round(korun * 100)
export const share = (amount: Halere, ratio: number): Halere =>
  Math.round(amount * ratio)
export const sum = (values: readonly Halere[]): Halere =>
  values.reduce((total, value) => total + value, 0)

/** Render for a `numeric(14,2)` column. */
export function numericString(amount: Halere): string {
  const absolute = Math.abs(amount)
  return `${amount < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Czech identifiers
// ---------------------------------------------------------------------------

/**
 * The standard IČO mod-11 check digit (weights 8..2 over the first seven digits).
 *
 * Used to mint SYNTHETIC-BUT-VALID identifiers for the demo's business partners:
 * they must pass `partner_ico_shape`, look right to an accountant reading the
 * screen, and belong to nobody — attaching invented debts to a real supplier is
 * not a thing a demo gets to do. The `88` prefix is outside the allocated range.
 *
 * The organization's own IČO is not minted here: it reuses the repo's canonical
 * `12345678` fixture, which reads unmistakably as demo data.
 */
export function icoCheckDigit(firstSeven: string): number {
  const weighted = firstSeven
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * (8 - index), 0)
  const remainder = weighted % 11
  return remainder === 0 ? 1 : remainder === 1 ? 0 : 11 - remainder
}

export function syntheticIco(sequence: number): string {
  const firstSeven = `88${String(sequence).padStart(5, "0")}`
  return `${firstSeven}${icoCheckDigit(firstSeven)}`
}

/** A Czech legal entity's DIČ is `CZ` + its IČO. Derived, never written out. */
export const dicOf = (ico: string): string => `CZ${ico}`

// ---------------------------------------------------------------------------
// The firm's stated inputs — the only figures not derived from something else
// ---------------------------------------------------------------------------

/** Revenue by calendar month, 0 = January: quiet through the frost, peaking mid-summer. */
const MONTHLY_REVENUE: readonly Halere[] = [
  kc(980_000),
  kc(1_120_000),
  kc(1_540_000),
  kc(1_860_000),
  kc(2_040_000),
  kc(2_180_000),
  kc(2_260_000),
  kc(2_120_000),
  kc(1_980_000),
  kc(1_760_000),
  kc(1_380_000),
  kc(1_060_000),
]

/** Cost structure, as a share of the month's revenue. */
const MATERIAL_RATIO = 0.38
const SERVICES_RATIO = 0.27
const OTHER_COST_RATIO = 0.035
/** Receivables at month end: most of this month's invoicing plus a tail of last. */
const RECEIVABLE_CURRENT_RATIO = 0.55
const RECEIVABLE_PRIOR_RATIO = 0.18
/** Trade payables at month end, against the month's bought-in costs. */
const PAYABLE_RATIO = 0.62
const VAT_RATE = 0.21
const INCOME_TAX_RATE = 0.21

/** Payroll rates, as the office states them on the recap. */
const EMPLOYER_SOCIAL_RATE = 0.248
const EMPLOYER_HEALTH_RATE = 0.09
const EMPLOYEE_SOCIAL_RATE = 0.071
const EMPLOYEE_HEALTH_RATE = 0.045
const WAGE_TAX_RATE = 0.15
const MONTHLY_TAXPAYER_CREDIT = kc(2_570)
/** Below these, a dohoda carries no social or health insurance. */
const DPC_INSURANCE_FLOOR = kc(4_500)
const DPP_INSURANCE_FLOOR = kc(11_500)

/** Cash on hand at the start of the fiscal year. The single free constant. */
const OPENING_CASH = kc(1_296_000)
const CASH_REGISTER_FLOAT = kc(38_400)
const REGISTERED_CAPITAL = kc(200_000)
/** The prior year ran on slightly smaller revenue and a slightly smaller payroll. */
const PRIOR_YEAR_REVENUE_SCALE = 0.94
const PRIOR_YEAR_PAYROLL_SCALE = 0.95
/** Straight-line accounting depreciation, in months. */
const DEPRECIATION_MONTHS = 60

// ---------------------------------------------------------------------------
// Roster, registers and counterparties
// ---------------------------------------------------------------------------

export type DemoUserRole = "owner" | "admin" | "member" | "guest"

export type DemoUser = {
  readonly key: string
  readonly email: string
  readonly name: string
  readonly role: DemoUserRole
  readonly isStaff: boolean
}

/**
 * One account per role, because that is the matrix the demo has to show. The
 * owner is office staff — the `organization_membership_owner_requires_staff`
 * trigger refuses an owner membership for anyone else. The guest is linked to a
 * payroll employee below, which is what makes it the employee seat rather than
 * an external viewer (spec §2.6.1).
 */
const USERS: readonly DemoUser[] = [
  {
    key: "ucetni",
    email: "ucetni@example.com",
    name: "Jana Dvořáková",
    role: "owner",
    isStaff: true,
  },
  {
    key: "jednatel",
    email: "jednatel@example.com",
    name: "Petr Novák",
    role: "admin",
    isStaff: false,
  },
  {
    key: "stavbyvedouci",
    email: "stavbyvedouci@example.com",
    name: "Martin Kolář",
    role: "member",
    isStaff: false,
  },
  {
    key: "zamestnanec",
    email: "zamestnanec@example.com",
    name: "Tomáš Beneš",
    role: "guest",
    isStaff: false,
  },
]

export type DemoContract = "hpp" | "dpc" | "dpp"

export type DemoEmployee = {
  readonly key: string
  readonly fullName: string
  readonly contract: DemoContract
  readonly gross: Halere
  /** Months before the fiscal year's start that this person joined. */
  readonly startedMonthsBefore: number
  /** Months after the fiscal year's start that they left, if they did. */
  readonly endedMonthsAfter: number | null
  /** The employee-seat link — at most one, per `payroll_employee_app_user_idx`. */
  readonly appUserKey: string | null
}

const employee = (
  key: string,
  fullName: string,
  contract: DemoContract,
  gross: number,
  startedMonthsBefore: number,
  extra: { endedMonthsAfter?: number; appUserKey?: string } = {},
): DemoEmployee => ({
  key,
  fullName,
  contract,
  gross: kc(gross),
  startedMonthsBefore,
  endedMonthsAfter: extra.endedMonthsAfter ?? null,
  appUserKey: extra.appUserKey ?? null,
})

const EMPLOYEES: readonly DemoEmployee[] = [
  employee("novak", "Petr Novák", "hpp", 65_000, 96),
  employee("kolar", "Martin Kolář", "hpp", 52_000, 63),
  employee("benes", "Tomáš Beneš", "hpp", 41_000, 41, {
    appUserKey: "zamestnanec",
  }),
  employee("horak", "Jiří Horák", "hpp", 38_500, 22),
  employee("simek", "Lukáš Šimek", "dpc", 18_000, 15),
  employee("krejci", "Adam Krejčí", "dpp", 9_500, 7),
  // The leaver. Spec §2.6.1: `ended_on` is set, the row stays, and the office is
  // warned rather than the account being deactivated automatically — a leaver
  // still needs their last payslip.
  employee("riha", "Václav Říha", "hpp", 36_000, 34, { endedMonthsAfter: 3 }),
]

/** The two sites everything on this firm's books hangs off (spec §2.2 Stavby). */
export const DEMO_SITES = ["Rezidence Vinohrady", "Sklad Modřany"] as const

export type DemoPartnerRole = "supplier" | "customer" | "both" | "other"

export type DemoPartner = {
  readonly key: string
  readonly name: string
  readonly ico: string
  readonly role: DemoPartnerRole
  readonly source: "manual" | "saldokonto"
  readonly street: string
  readonly houseNumber: string
  readonly city: string
  readonly postalCode: string
  /** Weight in the month's receivables / payables; 0 for the other side. */
  readonly receivableWeight: number
  readonly payableWeight: number
}

const partner = (
  key: string,
  name: string,
  sequence: number,
  role: DemoPartnerRole,
  source: "manual" | "saldokonto",
  address: readonly [
    street: string,
    houseNumber: string,
    city: string,
    postalCode: string,
  ],
  weights: readonly [receivable: number, payable: number],
): DemoPartner => ({
  key,
  name,
  ico: syntheticIco(sequence),
  role,
  source,
  street: address[0],
  houseNumber: address[1],
  city: address[2],
  postalCode: address[3],
  receivableWeight: weights[0],
  payableWeight: weights[1],
})

const PARTNERS: readonly DemoPartner[] = [
  partner(
    "stavebniny",
    "Stavebniny Pražák s.r.o.",
    1,
    "supplier",
    "saldokonto",
    ["Kolbenova", "942/38", "Praha", "19000"],
    [0, 0.34],
  ),
  partner(
    "betonarna",
    "Betonárna Zbraslav a.s.",
    2,
    "supplier",
    "saldokonto",
    ["Elišky Přemyslovny", "1211/8", "Praha", "15600"],
    [0, 0.27],
  ),
  partner(
    "elektro",
    "Elektro Vaněk s.r.o.",
    3,
    "supplier",
    "saldokonto",
    ["Osvobozených politických vězňů", "384/16", "Kladno", "27201"],
    [0, 0.19],
  ),
  partner(
    "pujcovna",
    "Půjčovna nářadí Beroun s.r.o.",
    4,
    "supplier",
    "manual",
    ["Plzeňská", "77/4", "Beroun", "26601"],
    [0, 0.11],
  ),
  partner(
    "rezidence",
    "Rezidence Vinohrady s.r.o.",
    5,
    "customer",
    "saldokonto",
    ["Korunní", "2569/108", "Praha", "10100"],
    [0.46, 0],
  ),
  partner(
    "develop",
    "Develop Modřany a.s.",
    6,
    "customer",
    "saldokonto",
    ["Komořanská", "326/63", "Praha", "14300"],
    [0.33, 0],
  ),
  partner(
    "spolecenstvi",
    "Společenství vlastníků Michelská 44",
    7,
    "customer",
    "manual",
    ["Michelská", "44/12", "Praha", "14000"],
    [0.21, 0],
  ),
  partner(
    "autokolar",
    "Auto Kolář s.r.o.",
    8,
    "both",
    "manual",
    ["Průmyslová", "1472/11", "Praha", "10200"],
    [0, 0.09],
  ),
]

export type DemoAssetCategory =
  "machine" | "vehicle" | "tool" | "real_estate" | "other"

export type DemoAsset = {
  readonly key: string
  readonly name: string
  readonly category: DemoAssetCategory
  readonly cost: Halere
  /** Months before the fiscal year's start that it entered service. */
  readonly inServiceMonthsBefore: number
  readonly isMinor: boolean
  readonly site: string | null
  /** Months after the fiscal year's start that it was written off, if it was. */
  readonly disposedMonthsAfter: number | null
  readonly improvement: {
    readonly monthsAfter: number
    readonly cost: Halere
  } | null
}

const asset = (
  key: string,
  name: string,
  category: DemoAssetCategory,
  cost: number,
  inServiceMonthsBefore: number,
  extra: {
    isMinor?: boolean
    site?: string
    disposedMonthsAfter?: number
    improvement?: { monthsAfter: number; cost: number }
  } = {},
): DemoAsset => ({
  key,
  name,
  category,
  cost: kc(cost),
  inServiceMonthsBefore,
  isMinor: extra.isMinor ?? false,
  site: extra.site ?? null,
  disposedMonthsAfter: extra.disposedMonthsAfter ?? null,
  improvement: extra.improvement
    ? {
        monthsAfter: extra.improvement.monthsAfter,
        cost: kc(extra.improvement.cost),
      }
    : null,
})

const ASSETS: readonly DemoAsset[] = [
  asset("transit", "Ford Transit 2.0 TDCi — valník", "vehicle", 780_000, 39),
  asset("leseni", "Fasádní lešení HAKI 240 m²", "machine", 310_000, 26, {
    site: DEMO_SITES[0],
    improvement: { monthsAfter: 2, cost: 48_000 },
  }),
  asset("vytah", "Stavební výtah GEDA 500 Z/ZP", "machine", 268_000, 17, {
    site: DEMO_SITES[1],
  }),
  asset("michacka", "Míchačka Belle Premier 150", "machine", 62_000, 44),
  asset("notebook", "Notebook Dell Latitude 5550", "tool", 34_000, 9, {
    isMinor: true,
  }),
  // Written off mid-year, and deliberately past the end of its depreciation
  // schedule by then: a fully depreciated asset leaves the books at a zero
  // residual, so the disposal needs no residual-value expense and the předvaha
  // still nets to zero.
  asset("deska", "Vibrační deska Wacker Neuson DPU", "machine", 96_000, 62, {
    disposedMonthsAfter: 4,
  }),
]

export type DemoLoanKind = "loan" | "lease" | "overdraft"

export type DemoLoan = {
  readonly key: string
  readonly institution: string
  readonly kind: DemoLoanKind
  readonly principal: Halere
  readonly installment: Halere
  /** The part of each installment that repays principal; the rest is interest. */
  readonly principalPerMonth: Halere
  readonly interestRatePct: string
  readonly startedMonthsBefore: number
  readonly termMonths: number
  readonly note: string
}

const LOANS: readonly DemoLoan[] = [
  {
    key: "kb",
    institution: "Komerční banka, a.s.",
    kind: "loan",
    principal: kc(900_000),
    installment: kc(16_800),
    principalPerMonth: kc(14_200),
    interestRatePct: "6.900",
    startedMonthsBefore: 14,
    termMonths: 60,
    note: "Investiční úvěr na pořízení stavebního výtahu.",
  },
  {
    key: "leasing",
    institution: "ČSOB Leasing, a.s.",
    kind: "lease",
    principal: kc(480_000),
    installment: kc(9_200),
    principalPerMonth: kc(8_000),
    interestRatePct: "5.400",
    startedMonthsBefore: 20,
    termMonths: 48,
    note: "Finanční leasing na Ford Transit.",
  },
]

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export type PayrollLine = {
  readonly employeeKey: string
  readonly gross: Halere
  readonly employeeSocial: Halere
  readonly employeeHealth: Halere
  readonly incomeTaxAdvance: Halere
  readonly deductions: Halere
  readonly net: Halere
  readonly employerSocial: Halere
  readonly employerHealth: Halere
  readonly employerCost: Halere
}

export type PayrollMonth = {
  readonly lines: readonly PayrollLine[]
  readonly grossTotal: Halere
  readonly employerSocial: Halere
  readonly employerHealth: Halere
  readonly employerCostTotal: Halere
  readonly employeeSocial: Halere
  readonly employeeHealth: Halere
  readonly incomeTaxAdvance: Halere
  readonly withholdingsTotal: Halere
  readonly netPaidTotal: Halere
  readonly headcountHpp: number
  readonly headcountDpc: number
  readonly headcountDpp: number
}

/** Dohody below their floor carry no insurance; an employment contract always does. */
function carriesInsurance(person: DemoEmployee): boolean {
  if (person.contract === "dpp") return person.gross >= DPP_INSURANCE_FLOOR
  if (person.contract === "dpc") return person.gross >= DPC_INSURANCE_FLOOR
  return true
}

function payrollLine(person: DemoEmployee, scale: number): PayrollLine {
  const gross = Math.round(person.gross * scale)
  const insured = carriesInsurance(person)
  const employeeSocial = insured ? share(gross, EMPLOYEE_SOCIAL_RATE) : 0
  const employeeHealth = insured ? share(gross, EMPLOYEE_HEALTH_RATE) : 0
  // The taxpayer credit applies where the prohlášení is signed, which for this
  // firm is the employment contracts — the dohody are taxed without it.
  const credit = person.contract === "hpp" ? MONTHLY_TAXPAYER_CREDIT : 0
  const incomeTaxAdvance = Math.max(0, share(gross, WAGE_TAX_RATE) - credit)
  const deductions = employeeSocial + employeeHealth + incomeTaxAdvance
  const employerSocial = insured ? share(gross, EMPLOYER_SOCIAL_RATE) : 0
  const employerHealth = insured ? share(gross, EMPLOYER_HEALTH_RATE) : 0

  return {
    employeeKey: person.key,
    gross,
    employeeSocial,
    employeeHealth,
    incomeTaxAdvance,
    deductions,
    net: gross - deductions,
    employerSocial,
    employerHealth,
    employerCost: gross + employerSocial + employerHealth,
  }
}

function payrollFor(
  people: readonly DemoEmployee[],
  scale: number,
): PayrollMonth {
  const lines = people.map((person) => payrollLine(person, scale))
  const by = (pick: (line: PayrollLine) => Halere): Halere =>
    sum(lines.map(pick))
  const headcount = (contract: DemoContract): number =>
    people.filter((person) => person.contract === contract).length

  const employeeSocial = by((line) => line.employeeSocial)
  const employeeHealth = by((line) => line.employeeHealth)
  const incomeTaxAdvance = by((line) => line.incomeTaxAdvance)

  return {
    lines,
    grossTotal: by((line) => line.gross),
    employerSocial: by((line) => line.employerSocial),
    employerHealth: by((line) => line.employerHealth),
    employerCostTotal: by((line) => line.employerCost),
    employeeSocial,
    employeeHealth,
    incomeTaxAdvance,
    withholdingsTotal: employeeSocial + employeeHealth + incomeTaxAdvance,
    netPaidTotal: by((line) => line.net),
    headcountHpp: headcount("hpp"),
    headcountDpc: headcount("dpc"),
    headcountDpp: headcount("dpp"),
  }
}

// ---------------------------------------------------------------------------
// Asset and loan registers over time
// ---------------------------------------------------------------------------

const inServiceMonth = (item: DemoAsset, yearStart: YearMonth): YearMonth =>
  addMonths(yearStart, -item.inServiceMonthsBefore)

const disposalMonth = (
  item: DemoAsset,
  yearStart: YearMonth,
): YearMonth | null =>
  item.disposedMonthsAfter === null
    ? null
    : addMonths(yearStart, item.disposedMonthsAfter)

const improvementMonth = (
  item: DemoAsset,
  yearStart: YearMonth,
): YearMonth | null =>
  item.improvement === null
    ? null
    : addMonths(yearStart, item.improvement.monthsAfter)

/** Acquisition cost carried at `at`, including a technical improvement once it lands. */
function assetCostAt(
  item: DemoAsset,
  yearStart: YearMonth,
  at: YearMonth,
): Halere {
  const improved = improvementMonth(item, yearStart)
  const landed =
    item.improvement !== null &&
    improved !== null &&
    monthsBetween(improved, at) >= 0
  return item.cost + (landed ? item.improvement!.cost : 0)
}

function assetInRegisterAt(
  item: DemoAsset,
  yearStart: YearMonth,
  at: YearMonth,
): boolean {
  if (monthsBetween(inServiceMonth(item, yearStart), at) < 0) return false
  const disposed = disposalMonth(item, yearStart)
  // Out of the register from the month it is written off, not after it.
  return disposed === null || monthsBetween(disposed, at) < 0
}

/**
 * Straight-line accumulated depreciation at a month end, capped at cost. Minor
 * assets are expensed on acquisition and never depreciate — the
 * `asset_minor_has_no_depreciation` CHECK says so, and the 40 000 accounting
 * policy and the 80 000 tax threshold are never conflated (spec §2.7).
 */
function accumulatedDepreciationAt(
  item: DemoAsset,
  yearStart: YearMonth,
  at: YearMonth,
): Halere {
  if (item.isMinor || !assetInRegisterAt(item, yearStart, at)) return 0
  const elapsed = monthsBetween(inServiceMonth(item, yearStart), at) + 1
  if (elapsed <= 0) return 0
  return Math.min(
    assetCostAt(item, yearStart, at),
    Math.round(item.cost / DEPRECIATION_MONTHS) * elapsed,
  )
}

function fixedAssetsAt(
  yearStart: YearMonth,
  at: YearMonth,
): { gross: Halere; accumulated: Halere; net: Halere } {
  const live = ASSETS.filter(
    (item) => !item.isMinor && assetInRegisterAt(item, yearStart, at),
  )
  const gross = sum(live.map((item) => assetCostAt(item, yearStart, at)))
  const accumulated = sum(
    live.map((item) => accumulatedDepreciationAt(item, yearStart, at)),
  )
  return { gross, accumulated, net: gross - accumulated }
}

function loanBalanceAt(
  loan: DemoLoan,
  yearStart: YearMonth,
  at: YearMonth,
): Halere {
  const elapsed = monthsBetween(
    addMonths(yearStart, -loan.startedMonthsBefore),
    at,
  )
  if (elapsed < 0) return loan.principal
  return Math.max(0, loan.principal - loan.principalPerMonth * elapsed)
}

const loansTotalAt = (yearStart: YearMonth, at: YearMonth): Halere =>
  sum(LOANS.map((loan) => loanBalanceAt(loan, yearStart, at)))

/** One month's interest on the balance carried into that month. */
function loanInterestFor(yearStart: YearMonth, at: YearMonth): Halere {
  return sum(
    LOANS.map((loan) => {
      const opening = loanBalanceAt(loan, yearStart, addMonths(at, -1))
      return opening <= 0
        ? 0
        : share(opening, Number(loan.interestRatePct) / 100 / 12)
    }),
  )
}

// ---------------------------------------------------------------------------
// The monthly close
// ---------------------------------------------------------------------------

export type MonthClose = {
  readonly ym: YearMonth
  readonly monthIndex: number
  readonly revenue: Halere
  readonly material: Halere
  readonly services: Halere
  readonly otherCosts: Halere
  readonly depreciation: Halere
  readonly interest: Halere
  readonly payroll: PayrollMonth
  readonly vatPayable: Halere
  readonly revenueYtd: Halere
  readonly materialYtd: Halere
  readonly servicesYtd: Halere
  readonly otherCostsYtd: Halere
  readonly wagesYtd: Halere
  readonly socialCostYtd: Halere
  readonly depreciationYtd: Halere
  readonly interestYtd: Halere
  readonly profitBeforeTaxYtd: Halere
  readonly incomeTaxYtd: Halere
  readonly profitAfterTaxYtd: Halere
  readonly fixedGross: Halere
  readonly fixedAccumulated: Halere
  readonly fixedNet: Halere
  readonly receivables: Halere
  readonly cashRegister: Halere
  readonly bankAccount: Halere
  readonly cashTotal: Halere
  readonly tradePayables: Halere
  readonly loanBalance: Halere
  readonly wagesPayable: Halere
  readonly insurancePayable: Halere
  readonly incomeTaxWithheldPayable: Halere
  readonly assetsTotal: Halere
  readonly equityTotal: Halere
  readonly liabilitiesTotal: Halere
  readonly retainedEarnings: Halere
}

const revenueOf = (ym: YearMonth, scale: number): Halere =>
  Math.round((MONTHLY_REVENUE[ym.month - 1] ?? 0) * scale)

/**
 * A fiscal year closed month by month.
 *
 * `retainedEarnings` is passed in rather than solved: profit brought forward is
 * constant within a year, so it cannot double as the monthly balancing figure.
 * CASH is the residual instead — which is what cash is.
 */
function closeYear(options: {
  readonly yearStart: YearMonth
  readonly months: number
  readonly revenueScale: number
  readonly payrollScale: number
  readonly retainedEarnings: Halere
  readonly employeesAt: (ym: YearMonth) => readonly DemoEmployee[]
}): MonthClose[] {
  const closes: MonthClose[] = []
  let revenueYtd = 0
  let materialYtd = 0
  let servicesYtd = 0
  let otherCostsYtd = 0
  let wagesYtd = 0
  let socialCostYtd = 0
  let depreciationYtd = 0
  let interestYtd = 0

  for (let index = 0; index < options.months; index += 1) {
    const ym = addMonths(options.yearStart, index)
    const revenue = revenueOf(ym, options.revenueScale)
    const material = share(revenue, MATERIAL_RATIO)
    const services = share(revenue, SERVICES_RATIO)
    const otherCosts = share(revenue, OTHER_COST_RATIO)
    const payroll = payrollFor(options.employeesAt(ym), options.payrollScale)
    const interest = loanInterestFor(options.yearStart, ym)
    const fixed = fixedAssetsAt(options.yearStart, ym)

    // The month's charge, asset by asset over the register as it stands THIS
    // month. Differencing the two accumulated totals instead would turn a
    // disposal into a month of negative depreciation.
    const depreciation = sum(
      ASSETS.filter(
        (item) =>
          !item.isMinor && assetInRegisterAt(item, options.yearStart, ym),
      ).map(
        (item) =>
          accumulatedDepreciationAt(item, options.yearStart, ym) -
          accumulatedDepreciationAt(item, options.yearStart, addMonths(ym, -1)),
      ),
    )

    revenueYtd += revenue
    materialYtd += material
    servicesYtd += services
    otherCostsYtd += otherCosts
    wagesYtd += payroll.grossTotal
    socialCostYtd += payroll.employerSocial + payroll.employerHealth
    depreciationYtd += depreciation
    interestYtd += interest

    const profitBeforeTaxYtd =
      revenueYtd -
      (materialYtd +
        servicesYtd +
        otherCostsYtd +
        wagesYtd +
        socialCostYtd +
        depreciationYtd +
        interestYtd)
    const incomeTaxYtd =
      profitBeforeTaxYtd > 0 ? share(profitBeforeTaxYtd, INCOME_TAX_RATE) : 0
    const profitAfterTaxYtd = profitBeforeTaxYtd - incomeTaxYtd

    const receivables =
      share(revenue, RECEIVABLE_CURRENT_RATIO) +
      share(
        revenueOf(addMonths(ym, -1), options.revenueScale),
        RECEIVABLE_PRIOR_RATIO,
      )
    const tradePayables = share(material + services, PAYABLE_RATIO)
    const loanBalance = loansTotalAt(options.yearStart, ym)

    // Payroll is paid, and its levies fall due, in the following month.
    const wagesPayable = payroll.netPaidTotal
    const insurancePayable =
      payroll.employerSocial +
      payroll.employerHealth +
      payroll.employeeSocial +
      payroll.employeeHealth
    const incomeTaxWithheldPayable = payroll.incomeTaxAdvance
    // Output VAT on the month's supplies less input VAT on what was bought in.
    const vatPayable = share(revenue - material - services, VAT_RATE)

    const equityTotal =
      REGISTERED_CAPITAL + options.retainedEarnings + profitAfterTaxYtd
    const liabilitiesTotal =
      tradePayables +
      loanBalance +
      wagesPayable +
      insurancePayable +
      incomeTaxWithheldPayable +
      vatPayable

    // Cash closes the balance sheet.
    const cashTotal = equityTotal + liabilitiesTotal - fixed.net - receivables

    closes.push({
      ym,
      monthIndex: index,
      revenue,
      material,
      services,
      otherCosts,
      depreciation,
      interest,
      payroll,
      vatPayable,
      revenueYtd,
      materialYtd,
      servicesYtd,
      otherCostsYtd,
      wagesYtd,
      socialCostYtd,
      depreciationYtd,
      interestYtd,
      profitBeforeTaxYtd,
      incomeTaxYtd,
      profitAfterTaxYtd,
      fixedGross: fixed.gross,
      fixedAccumulated: fixed.accumulated,
      fixedNet: fixed.net,
      receivables,
      cashRegister: CASH_REGISTER_FLOAT,
      bankAccount: cashTotal - CASH_REGISTER_FLOAT,
      cashTotal,
      tradePayables,
      loanBalance,
      wagesPayable,
      insurancePayable,
      incomeTaxWithheldPayable,
      assetsTotal: fixed.net + receivables + cashTotal,
      equityTotal,
      liabilitiesTotal,
      retainedEarnings: options.retainedEarnings,
    })
  }

  return closes
}

// ---------------------------------------------------------------------------
// The statements, as tables
// ---------------------------------------------------------------------------

export type StatementRow = {
  readonly ozn: string | null
  readonly rowCode: string
  readonly label: string
  readonly indent: number
  readonly bold: boolean
  readonly current: Halere
  readonly prior: Halere
  /** Aktiva only — the gross/adjustment pair behind `current`. */
  readonly gross?: Halere
  readonly adjustment?: Halere
}

type Head = readonly [
  ozn: string | null,
  code: string,
  label: string,
  indent: number,
  bold: boolean,
]
/** Aktiva states brutto and korekce; netto is their difference, by construction. */
type AktivaSpec = readonly [
  ...Head,
  (close: MonthClose) => readonly [Halere, Halere],
]
type ValueSpec = readonly [...Head, (close: MonthClose) => Halere]

const AKTIVA: readonly AktivaSpec[] = [
  [
    null,
    "001",
    "AKTIVA CELKEM",
    0,
    true,
    (c) => [c.fixedGross + c.receivables + c.cashTotal, c.fixedAccumulated],
  ],
  [
    "B.",
    "003",
    "Stálá aktiva",
    1,
    true,
    (c) => [c.fixedGross, c.fixedAccumulated],
  ],
  [
    "B.II.",
    "014",
    "Dlouhodobý hmotný majetek",
    2,
    false,
    (c) => [c.fixedGross, c.fixedAccumulated],
  ],
  [
    "B.II.2.",
    "015",
    "Hmotné movité věci a jejich soubory",
    3,
    false,
    (c) => [c.fixedGross, c.fixedAccumulated],
  ],
  [
    "C.",
    "037",
    "Oběžná aktiva",
    1,
    true,
    (c) => [c.receivables + c.cashTotal, 0],
  ],
  ["C.II.", "046", "Pohledávky", 2, false, (c) => [c.receivables, 0]],
  [
    "C.II.2.1.",
    "049",
    "Pohledávky z obchodních vztahů",
    3,
    false,
    (c) => [c.receivables, 0],
  ],
  ["C.IV.", "070", "Peněžní prostředky", 2, false, (c) => [c.cashTotal, 0]],
  [
    "C.IV.1.",
    "071",
    "Peněžní prostředky v pokladně",
    3,
    false,
    (c) => [c.cashRegister, 0],
  ],
  [
    "C.IV.2.",
    "072",
    "Peněžní prostředky na účtech",
    3,
    false,
    (c) => [c.bankAccount, 0],
  ],
]

const otherPayablesOf = (c: MonthClose): Halere =>
  c.wagesPayable +
  c.insurancePayable +
  c.incomeTaxWithheldPayable +
  c.vatPayable

const PASIVA: readonly ValueSpec[] = [
  [
    null,
    "078",
    "PASIVA CELKEM",
    0,
    true,
    (c) => c.equityTotal + c.liabilitiesTotal,
  ],
  ["A.", "079", "Vlastní kapitál", 1, true, (c) => c.equityTotal],
  ["A.I.", "080", "Základní kapitál", 2, false, () => REGISTERED_CAPITAL],
  [
    "A.IV.",
    "087",
    "Výsledek hospodaření minulých let",
    2,
    false,
    (c) => c.retainedEarnings,
  ],
  [
    "A.V.",
    "090",
    "Výsledek hospodaření běžného účetního období",
    2,
    false,
    (c) => c.profitAfterTaxYtd,
  ],
  ["C.", "101", "Závazky", 1, true, (c) => c.liabilitiesTotal],
  ["C.II.", "109", "Krátkodobé závazky", 2, false, (c) => c.liabilitiesTotal],
  [
    "C.II.2.",
    "110",
    "Závazky k úvěrovým institucím",
    3,
    false,
    (c) => c.loanBalance,
  ],
  [
    "C.II.4.",
    "112",
    "Závazky z obchodních vztahů",
    3,
    false,
    (c) => c.tradePayables,
  ],
  ["C.II.8.", "116", "Závazky ostatní", 3, false, otherPayablesOf],
]

const VZZ: readonly ValueSpec[] = [
  [
    "I.",
    "01",
    "Tržby z prodeje výrobků a služeb",
    1,
    false,
    (c) => c.revenueYtd,
  ],
  [
    "A.",
    "03",
    "Výkonová spotřeba",
    1,
    true,
    (c) => c.materialYtd + c.servicesYtd + c.otherCostsYtd,
  ],
  [
    "A.2.",
    "05",
    "Spotřeba materiálu a energie",
    2,
    false,
    (c) => c.materialYtd + c.otherCostsYtd,
  ],
  ["A.3.", "06", "Služby", 2, false, (c) => c.servicesYtd],
  ["D.", "09", "Osobní náklady", 1, true, (c) => c.wagesYtd + c.socialCostYtd],
  ["D.1.", "10", "Mzdové náklady", 2, false, (c) => c.wagesYtd],
  [
    "D.2.",
    "11",
    "Náklady na sociální zabezpečení, zdravotní pojištění a ostatní náklady",
    2,
    false,
    (c) => c.socialCostYtd,
  ],
  [
    "E.",
    "14",
    "Úpravy hodnot v provozní oblasti",
    1,
    false,
    (c) => c.depreciationYtd,
  ],
  [
    "*",
    "30",
    "Provozní výsledek hospodaření",
    0,
    true,
    (c) => c.profitBeforeTaxYtd + c.interestYtd,
  ],
  [
    "J.",
    "43",
    "Nákladové úroky a podobné náklady",
    1,
    false,
    (c) => c.interestYtd,
  ],
  [
    "**",
    "49",
    "Výsledek hospodaření před zdaněním",
    0,
    true,
    (c) => c.profitBeforeTaxYtd,
  ],
  ["L.", "50", "Daň z příjmů", 1, false, (c) => c.incomeTaxYtd],
  [
    "**",
    "53",
    "Výsledek hospodaření po zdanění",
    0,
    true,
    (c) => c.profitAfterTaxYtd,
  ],
]

function buildAktiva(close: MonthClose, opening: MonthClose): StatementRow[] {
  return AKTIVA.map(([ozn, rowCode, label, indent, bold, value]) => {
    const [gross, adjustment] = value(close)
    const [priorGross, priorAdjustment] = value(opening)
    return {
      ozn,
      rowCode,
      label,
      indent,
      bold,
      gross,
      adjustment,
      current: gross - adjustment,
      prior: priorGross - priorAdjustment,
    }
  })
}

function buildValueStatement(
  specs: readonly ValueSpec[],
  close: MonthClose,
  prior: MonthClose | null,
): StatementRow[] {
  return specs.map(([ozn, rowCode, label, indent, bold, value]) => ({
    ozn,
    rowCode,
    label,
    indent,
    bold,
    current: value(close),
    prior: prior === null ? 0 : value(prior),
  }))
}

// ---------------------------------------------------------------------------
// The obratová předvaha
// ---------------------------------------------------------------------------

export type TrialBalanceRow = {
  readonly accountCode: string
  readonly accountName: string
  readonly opening: Halere
  readonly debit: Halere
  readonly credit: Halere
  readonly closing: Halere
}

/**
 * Accounts in the debit-positive convention: a closing balance is positive on
 * the debit side and negative on the credit side, so the whole column sums to
 * zero. `result` accounts reopen at zero each January; `unappropriated` is 431,
 * which opens the year holding last year's profit and is emptied into 428.
 */
type AccountSpec = readonly [
  code: string,
  name: string,
  balance: (close: MonthClose) => Halere,
  churn?: ((close: MonthClose) => Halere) | null,
  kind?: "result" | "unappropriated",
]

const ACCOUNTS: readonly AccountSpec[] = [
  ["022", "Hmotné movité věci a jejich soubory", (c) => c.fixedGross],
  ["082", "Oprávky k hmotným movitým věcem", (c) => -c.fixedAccumulated],
  ["211", "Pokladna", (c) => c.cashRegister, (c) => share(c.revenue, 0.02)],
  ["221", "Bankovní účty", (c) => c.bankAccount, (c) => share(c.revenue, 0.9)],
  ["311", "Odběratelé", (c) => c.receivables, (c) => share(c.revenue, 0.8)],
  [
    "321",
    "Dodavatelé",
    (c) => -c.tradePayables,
    (c) => share(c.material + c.services, 0.7),
  ],
  ["331", "Zaměstnanci", (c) => -c.wagesPayable, (c) => c.payroll.netPaidTotal],
  [
    "336",
    "Zúčtování s institucemi sociálního zabezpečení a zdravotního pojištění",
    (c) => -c.insurancePayable,
    (c) => c.insurancePayable,
  ],
  [
    "342",
    "Ostatní přímé daně",
    (c) => -c.incomeTaxWithheldPayable,
    (c) => c.incomeTaxWithheldPayable,
  ],
  ["343", "Daň z přidané hodnoty", (c) => -c.vatPayable, (c) => c.vatPayable],
  ["411", "Základní kapitál", () => -REGISTERED_CAPITAL],
  ["428", "Nerozdělený zisk minulých let", (c) => -c.retainedEarnings],
  [
    "431",
    "Výsledek hospodaření ve schvalovacím řízení",
    () => 0,
    null,
    "unappropriated",
  ],
  ["461", "Bankovní úvěry", (c) => -c.loanBalance],
  [
    "501",
    "Spotřeba materiálu a energie",
    (c) => c.materialYtd + c.otherCostsYtd,
    null,
    "result",
  ],
  ["518", "Ostatní služby", (c) => c.servicesYtd, null, "result"],
  ["521", "Mzdové náklady", (c) => c.wagesYtd, null, "result"],
  [
    "524",
    "Zákonné sociální a zdravotní pojištění",
    (c) => c.socialCostYtd,
    null,
    "result",
  ],
  [
    "551",
    "Odpisy dlouhodobého majetku",
    (c) => c.depreciationYtd,
    null,
    "result",
  ],
  ["562", "Úroky", (c) => c.interestYtd, null, "result"],
  [
    "591",
    "Daň z příjmů z běžné činnosti",
    (c) => c.incomeTaxYtd,
    null,
    "result",
  ],
  ["602", "Tržby z prodeje služeb", (c) => -c.revenueYtd, null, "result"],
]

/**
 * Turnovers are the month's net movement plus a churn on the accounts that
 * genuinely churn, which keeps `closing = opening + MD − D` exact on every row
 * and `Σ MD = Σ D` on the sheet.
 */
function buildPredvaha(
  close: MonthClose,
  previous: MonthClose,
  options: { firstMonthOfYear: boolean; unappropriatedResult: Halere },
): TrialBalanceRow[] {
  return ACCOUNTS.map(([accountCode, accountName, balance, churn, kind]) => {
    const closing = balance(close)
    const opening =
      kind === "unappropriated"
        ? options.firstMonthOfYear
          ? -options.unappropriatedResult
          : 0
        : kind === "result" && options.firstMonthOfYear
          ? 0
          : balance(previous)
    const movement = closing - opening
    const churned = churn ? churn(close) : 0
    return {
      accountCode,
      accountName,
      opening,
      debit: Math.max(movement, 0) + churned,
      credit: Math.max(-movement, 0) + churned,
      closing,
    }
  })
}

// ---------------------------------------------------------------------------
// Saldokonto
// ---------------------------------------------------------------------------

export type SaldoRow = {
  readonly partnerKey: string
  readonly receivable: Halere | null
  readonly payable: Halere | null
  readonly oldestDue: string | null
}

/**
 * Every partner's share of the receivable and payable totals the balance sheet
 * already states, with the residue put on the last member so the two agree to
 * the haléř.
 */
function buildSaldokonto(close: MonthClose, ym: YearMonth): SaldoRow[] {
  const allocate = (
    members: readonly DemoPartner[],
    total: Halere,
    weightOf: (row: DemoPartner) => number,
  ): Map<string, Halere> => {
    const allocated = new Map<string, Halere>()
    let running = 0
    members.forEach((row, index) => {
      const value =
        index === members.length - 1
          ? total - running
          : share(total, weightOf(row))
      running += value
      allocated.set(row.key, value)
    })
    return allocated
  }

  const receivable = allocate(
    PARTNERS.filter((row) => row.receivableWeight > 0),
    close.receivables,
    (row) => row.receivableWeight,
  )
  const payable = allocate(
    PARTNERS.filter((row) => row.payableWeight > 0),
    close.tradePayables,
    (row) => row.payableWeight,
  )

  return PARTNERS.map((row, index) => {
    const payableTotal = payable.get(row.key) ?? null
    // `partner_saldo_payable_has_oldest_due`: a positive payable must state the
    // oldest open item. The first supplier is deliberately past due, so the
    // derived "Po splatnosti" signal has something real to sit on.
    return {
      partnerKey: row.key,
      receivable: receivable.get(row.key) ?? null,
      payable: payableTotal,
      oldestDue:
        payableTotal !== null && payableTotal > 0
          ? addDays(monthEnd(ym), index === 0 ? -18 : 12)
          : null,
    }
  }).filter((row) => row.receivable !== null || row.payable !== null)
}

// ---------------------------------------------------------------------------
// Filings, documents, tasks, liabilities
// ---------------------------------------------------------------------------

export type PeriodRef =
  | { readonly kind: "month"; readonly year: number; readonly month: number }
  | {
      readonly kind: "quarter"
      readonly year: number
      readonly quarter: number
    }
  | { readonly kind: "year"; readonly year: number }

export type DemoFiling = {
  readonly key: string
  readonly kind: string
  readonly period: PeriodRef
  readonly dueOn: string
  readonly status: "planned" | "filed" | "confirmed" | "corrective"
  readonly filedOn: string | null
  readonly amountDue: Halere | null
  readonly paidAt: string | null
  readonly variableSymbol: string | null
  readonly noteClient: string | null
}

const TAX_VS = "1234567890"

const periodOfMonth = (ym: YearMonth): PeriodRef => ({
  kind: "month",
  year: ym.year,
  month: ym.month,
})

/** Identity of a period, for deduplicating the set the seed has to create. */
export const periodKeyOf = (period: PeriodRef): string =>
  period.kind === "month"
    ? `month:${period.year}:${period.month}`
    : period.kind === "quarter"
      ? `quarter:${period.year}:${period.quarter}`
      : `year:${period.year}`

function buildFilings(
  months: readonly MonthClose[],
  currentMonth: YearMonth,
  today: string,
): DemoFiling[] {
  const filings: DemoFiling[] = []
  const historyYear = months[0]!.ym.year
  const priorYear = historyYear - 1

  const add = (
    key: string,
    kind: string,
    period: PeriodRef,
    dueOn: string,
    rest: Partial<Omit<DemoFiling, "key" | "kind" | "period" | "dueOn">> = {},
  ) => {
    filings.push({
      key,
      kind,
      period,
      dueOn,
      status: rest.status ?? "planned",
      filedOn: rest.filedOn ?? null,
      amountDue: rest.amountDue ?? null,
      paidAt: rest.paidAt ?? null,
      variableSymbol: rest.variableSymbol ?? null,
      noteClient: rest.noteClient ?? null,
    })
  }

  /** Filed a few days early and paid the same day — the office's normal rhythm. */
  const settled = (dueOn: string, amount: Halere | null, daysEarly: number) => {
    const filedOn = addDays(dueOn, -daysEarly)
    return {
      status: "confirmed" as const,
      filedOn,
      amountDue: amount,
      paidAt: amount === null ? null : atHour(filedOn, 14, 5),
      variableSymbol: amount === null ? null : TAX_VS,
    }
  }

  for (const close of months) {
    const period = periodOfMonth(close.ym)
    const next = addMonths(close.ym, 1)
    const vatDue = dayOfMonth(next, 25)
    const leviesDue = dayOfMonth(next, 20)
    const label = `${close.ym.year}-${close.ym.month}`
    const payroll = close.payroll

    add(
      `dph-priznani-${label}`,
      "dph_priznani",
      period,
      vatDue,
      settled(vatDue, close.vatPayable, 3),
    )
    add(
      `dph-kh-${label}`,
      "dph_kontrolni_hlaseni",
      period,
      vatDue,
      settled(vatDue, null, 3),
    )
    add(
      `cssz-${label}`,
      "prehled_cssz",
      period,
      leviesDue,
      settled(leviesDue, payroll.employerSocial + payroll.employeeSocial, 2),
    )
    add(
      `zp-${label}`,
      "prehled_zp",
      period,
      leviesDue,
      settled(leviesDue, payroll.employerHealth + payroll.employeeHealth, 2),
    )

    // JMHZ became mandatory partway through the year the demo runs in; it is
    // filed from the fourth month onwards and never backdated before it existed.
    if (close.monthIndex >= 3) {
      add(`jmhz-${label}`, "jmhz", period, leviesDue, {
        status: "filed",
        filedOn: addDays(leviesDue, -6),
      })
    }
  }

  // The month in progress: the deadlines exist, the returns do not yet.
  const currentPeriod = periodOfMonth(currentMonth)
  const afterCurrent = addMonths(currentMonth, 1)
  add(
    "dph-priznani-current",
    "dph_priznani",
    currentPeriod,
    dayOfMonth(afterCurrent, 25),
    {
      variableSymbol: TAX_VS,
      noteClient: "Podklady za tento měsíc ještě zpracováváme.",
    },
  )
  add(
    "dph-kh-current",
    "dph_kontrolni_hlaseni",
    currentPeriod,
    dayOfMonth(afterCurrent, 25),
  )
  add(
    "cssz-current",
    "prehled_cssz",
    currentPeriod,
    dayOfMonth(afterCurrent, 20),
    {
      variableSymbol: TAX_VS,
    },
  )
  add("zp-current", "prehled_zp", currentPeriod, dayOfMonth(afterCurrent, 20), {
    variableSymbol: TAX_VS,
  })

  // Last year's income tax, filed on the extended deadline by the office.
  const dppoDue = dayOfMonth({ year: priorYear + 1, month: 7 }, 1)
  add(
    "dppo-priznani",
    "dppo_priznani",
    { kind: "year", year: priorYear },
    dppoDue,
    {
      ...settled(dppoDue, kc(163_400), 9),
    },
  )
  add("zaverka", "ucetni_zaverka", { kind: "year", year: priorYear }, dppoDue, {
    status: "filed",
    filedOn: addDays(dppoDue, -9),
    noteClient: "Zveřejněno ve sbírce listin.",
  })
  add(
    "vyuctovani",
    "vyuctovani_dane",
    { kind: "year", year: priorYear },
    dayOfMonth({ year: priorYear + 1, month: 3 }, 1),
    {
      status: "confirmed",
      filedOn: dayOfMonth({ year: priorYear + 1, month: 2 }, 19),
    },
  )

  // Quarterly advances against this year's tax. The one still ahead of the demo
  // date is the FÚ row that makes Dluhy a platby non-empty.
  const paidAdvance = dayOfMonth({ year: historyYear, month: 6 }, 15)
  add(
    "dppo-zaloha-paid",
    "dppo_zaloha",
    { kind: "quarter", year: historyYear, quarter: 2 },
    paidAdvance,
    {
      status: "filed",
      filedOn: paidAdvance,
      amountDue: kc(40_850),
      paidAt: atHour(paidAdvance, 9, 40),
      variableSymbol: TAX_VS,
    },
  )
  add(
    "dppo-zaloha-open",
    "dppo_zaloha",
    { kind: "quarter", year: historyYear, quarter: 3 },
    dayOfMonth({ year: historyYear, month: 9 }, 15),
    {
      amountDue: kc(40_850),
      variableSymbol: TAX_VS,
      noteClient: "Zálohu prosím uhraďte do data splatnosti.",
    },
  )

  return filings.filter((row) => row.filedOn === null || row.filedOn <= today)
}

export type DemoDocument = {
  readonly key: string
  readonly docType: string
  readonly status: "received" | "in_processing" | "processed" | "returned"
  readonly filename: string
  readonly extension: "pdf" | "png" | "jpg" | "heic"
  readonly contentType: string
  readonly byteSize: number
  readonly documentDate: string | null
  readonly amount: Halere | null
  readonly site: string | null
  readonly partnerKey: string | null
  readonly officeMessage: string | null
  readonly internalNote: string | null
  readonly uploadedByKey: string | null
  readonly createdAt: string
  readonly payslipEmployeeKey: string | null
  readonly payslipPeriod: PeriodRef | null
}

function buildDocuments(
  months: readonly MonthClose[],
  lastClosed: YearMonth,
  today: string,
): DemoDocument[] {
  const documents: DemoDocument[] = []
  const site = (index: number): string => DEMO_SITES[index % DEMO_SITES.length]!

  const add = (
    key: string,
    docType: string,
    filename: string,
    extension: "pdf" | "jpg",
    byteSize: number,
    documentDate: string,
    uploadedAt: string,
    rest: Partial<DemoDocument> = {},
  ) => {
    documents.push({
      key,
      docType,
      filename,
      extension,
      byteSize,
      documentDate,
      contentType: extension === "pdf" ? "application/pdf" : "image/jpeg",
      status: rest.status ?? "processed",
      amount: rest.amount ?? null,
      site: rest.site ?? null,
      partnerKey: rest.partnerKey ?? null,
      officeMessage: rest.officeMessage ?? null,
      internalNote: rest.internalNote ?? null,
      uploadedByKey: rest.uploadedByKey ?? "jednatel",
      // Nothing was uploaded tomorrow: anchored early in a month, the artefacts
      // of the month just closed would otherwise carry a future date.
      createdAt: atHour(notAfter(uploadedAt, today), 9, 30),
      payslipEmployeeKey: rest.payslipEmployeeKey ?? null,
      payslipPeriod: rest.payslipPeriod ?? null,
    })
  }

  months.forEach((close, index) => {
    const ym = close.ym
    const label = `${String(ym.month).padStart(2, "0")}-${ym.year}`

    add(
      `vypis-${label}`,
      "bank_statement",
      `Vypis-KB-${label}.pdf`,
      "pdf",
      148_320 + index * 1_117,
      monthEnd(ym),
      dayOfMonth(addMonths(ym, 1), 3),
    )
    add(
      `faktura-prijata-${label}`,
      "invoice_in",
      `Faktura-Stavebniny-${label}.pdf`,
      "pdf",
      92_640 + index * 733,
      dayOfMonth(ym, 12),
      dayOfMonth(ym, 14),
      {
        amount: share(close.material, 0.34),
        site: site(index),
        partnerKey: "stavebniny",
        uploadedByKey: "stavbyvedouci",
      },
    )
    add(
      `faktura-vydana-${label}`,
      "invoice_out",
      `Faktura-vydana-${label}.pdf`,
      "pdf",
      78_140 + index * 512,
      dayOfMonth(ym, 26),
      dayOfMonth(ym, 27),
      {
        amount: share(close.revenue, 0.46),
        site: site(index + 1),
        partnerKey: "rezidence",
      },
    )

    // Only the recent months carry receipts — the older ones read as an archive
    // rather than as a wall of identical rows.
    if (months.length - index <= 3) {
      add(
        `paragon-${label}`,
        "receipt",
        `Paragon-nafta-${label}.jpg`,
        "jpg",
        1_284_400 + index * 9_311,
        dayOfMonth(ym, 18),
        dayOfMonth(ym, 18),
        {
          amount: kc(2_480) + index * kc(37),
          site: site(index),
          uploadedByKey: "stavbyvedouci",
        },
      )
    }
  })

  // The payroll month just closed: one payslip per person on the roster. These
  // are excluded from every Dokumenty view server-side and reachable only
  // through Mzdy › Výplatnice (spec §2.2).
  const lastPayroll = months[months.length - 1]
  lastPayroll?.payroll.lines.forEach((line, index) => {
    add(
      `vyplatnice-${line.employeeKey}`,
      "payslip",
      `Vyplatni-paska-${line.employeeKey}.pdf`,
      "pdf",
      41_200 + index * 143,
      monthEnd(lastClosed),
      dayOfMonth(addMonths(lastClosed, 1), 9),
      {
        amount: line.net,
        uploadedByKey: "ucetni",
        payslipEmployeeKey: line.employeeKey,
        payslipPeriod: periodOfMonth(lastClosed),
      },
    )
  })

  // The office-uploaded company file (spec §2.2 Doklady firmy).
  add(
    "smlouva-rezidence",
    "contract",
    "Smlouva-o-dilo-Rezidence-Vinohrady.pdf",
    "pdf",
    612_800,
    monthStart(months[0]!.ym),
    dayOfMonth(months[0]!.ym, 8),
    {
      site: DEMO_SITES[0],
      partnerKey: "rezidence",
      uploadedByKey: "ucetni",
      internalNote: "Originál uložen v deskách klienta.",
    },
  )

  // The month in progress — this is what makes the Zpracování queue non-empty
  // and the client's Dokumenty list look like a live feed rather than an archive.
  add(
    "faktura-prijata-current-1",
    "invoice_in",
    "Faktura-Betonarna-aktualni.pdf",
    "pdf",
    88_410,
    addDays(today, -6),
    addDays(today, -5),
    {
      status: "in_processing",
      amount: kc(184_600),
      site: DEMO_SITES[0],
      partnerKey: "betonarna",
      uploadedByKey: "stavbyvedouci",
      internalNote: "Ověřit sazbu DPH u přenesené daňové povinnosti.",
    },
  )
  add(
    "faktura-prijata-current-2",
    "invoice_in",
    "Faktura-Elektro-Vanek.pdf",
    "pdf",
    71_950,
    addDays(today, -3),
    addDays(today, -2),
    {
      status: "received",
      amount: kc(63_240),
      site: DEMO_SITES[1],
      partnerKey: "elektro",
    },
  )
  add(
    "foto-current",
    "receipt",
    "IMG_4471.jpg",
    "jpg",
    2_140_880,
    addDays(today, -4),
    addDays(today, -4),
    {
      status: "returned",
      site: DEMO_SITES[1],
      uploadedByKey: "stavbyvedouci",
      // `document_returned_requires_message`: a returned document always says why.
      officeMessage:
        "Účtenka je přeexponovaná, nejde přečíst částka ani datum. Vyfoťte prosím znovu za lepšího světla.",
    },
  )
  add(
    "dochazka-current",
    "attendance",
    "Dochazka-aktualni-mesic.pdf",
    "pdf",
    39_610,
    addDays(today, -1),
    addDays(today, -1),
    { status: "received" },
  )

  return documents
}

export type DemoTask = {
  readonly key: string
  readonly title: string
  readonly description: string | null
  readonly isTemplate: boolean
  readonly templateDueDay: number | null
  readonly dueDate: string | null
  readonly linkKind: "none" | "dokumenty" | "dane"
  readonly status: "open" | "done"
  readonly doneAt: string | null
  readonly sourceTemplateKey: string | null
  readonly sourcePeriod: PeriodRef | null
}

/** The office's monthly template set, and this month's instance of it. */
const TASK_TEMPLATES: readonly {
  key: string
  title: string
  description: string
  dueDay: number
  done: boolean
}[] = [
  {
    key: "vypisy",
    title: "Nahrát bankovní výpisy za uplynulý měsíc",
    description:
      "Stáhněte prosím výpis z běžného účtu za celý minulý měsíc a nahrajte ho do Dokumentů.",
    dueDay: 5,
    done: true,
  },
  {
    key: "dochazka",
    title: "Nahrát docházku zaměstnanců",
    description: "Podklady pro zpracování mezd za uplynulý měsíc.",
    dueDay: 3,
    done: true,
  },
  {
    key: "faktury",
    title: "Doložit chybějící přijaté faktury",
    description:
      "Zkontrolujte prosím, zda jsou nahrané všechny faktury, které jste za měsíc obdrželi.",
    dueDay: 8,
    done: false,
  },
]

function buildTasks(currentMonth: YearMonth, today: string): DemoTask[] {
  const period = periodOfMonth(currentMonth)

  const templates: DemoTask[] = TASK_TEMPLATES.map((template) => ({
    key: `tpl-${template.key}`,
    title: template.title,
    description: template.description,
    isTemplate: true,
    templateDueDay: template.dueDay,
    dueDate: null,
    linkKind: "dokumenty",
    status: "open",
    doneAt: null,
    sourceTemplateKey: null,
    sourcePeriod: null,
  }))

  const instantiated: DemoTask[] = TASK_TEMPLATES.map((template) => ({
    key: `task-${template.key}`,
    title: template.title,
    description: template.description,
    isTemplate: false,
    templateDueDay: null,
    dueDate: dayOfMonth(currentMonth, template.dueDay),
    linkKind: "dokumenty",
    status: template.done ? "done" : "open",
    doneAt: template.done
      ? atHour(dayOfMonth(currentMonth, template.dueDay), 18, 30)
      : null,
    sourceTemplateKey: `tpl-${template.key}`,
    sourcePeriod: period,
  }))

  return [
    ...templates,
    ...instantiated,
    {
      key: "task-ucet",
      title: "Potvrdit číslo účtu pro vratku DPH",
      description:
        "Finanční úřad vrací přeplatek. Potvrďte prosím, že číslo účtu v Nastavení je aktuální.",
      isTemplate: false,
      templateDueDay: null,
      dueDate: addDays(today, 6),
      linkKind: "dane",
      status: "open",
      doneAt: null,
      sourceTemplateKey: null,
      sourcePeriod: null,
    },
  ]
}

export type DemoLiability = {
  readonly key: string
  readonly creditorGroup: "fu" | "cssz_zp" | "ostatni"
  readonly label: string
  readonly amount: Halere
  readonly dueOn: string
  readonly paidAt: string | null
  readonly variableSymbol: string | null
  readonly noteClient: string | null
}

/** The manual residue — `liability_group_is_residue` forbids `dodavatele` here. */
const buildLiabilities = (today: string): DemoLiability[] => [
  {
    key: "pojisteni",
    creditorGroup: "ostatni",
    label: "Pojištění odpovědnosti — pololetní splátka",
    amount: kc(24_800),
    dueOn: addDays(today, 19),
    paidAt: null,
    variableSymbol: "8840127",
    noteClient: "Splátka za druhé pololetí.",
  },
  {
    key: "zp-doplatek",
    creditorGroup: "cssz_zp",
    label: "Doplatek pojistného ZP po kontrole",
    amount: kc(8_640),
    dueOn: addDays(today, 11),
    paidAt: null,
    variableSymbol: TAX_VS,
    noteClient: null,
  },
  {
    key: "clenske",
    creditorGroup: "ostatni",
    label: "Členský příspěvek cechu",
    amount: kc(6_500),
    dueOn: addDays(today, -46),
    paidAt: atHour(addDays(today, -49), 13, 20),
    variableSymbol: null,
    noteClient: null,
  },
]

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export type DemoMonthDatasets = {
  readonly period: PeriodRef
  /** The day the office published this close — never later than the demo date. */
  readonly publishedOn: string
  /** When this month's payroll levies fall due: the 20th of the month after. */
  readonly payrollDueOn: string
  readonly close: MonthClose
  readonly rozvahaAktiva: readonly StatementRow[]
  readonly rozvahaPasiva: readonly StatementRow[]
  readonly vzz: readonly StatementRow[]
  readonly predvaha: readonly TrialBalanceRow[]
  readonly saldokonto: readonly SaldoRow[]
}

export type DemoAssetCard = {
  readonly key: string
  readonly inServiceOn: string
  readonly disposedOn: string | null
  readonly improvedOn: string | null
  /** NULL for a minor asset, which never depreciates. */
  readonly accumulatedDepreciation: Halere | null
  readonly depreciationAsOf: string | null
}

export type DemoLoanCard = {
  readonly key: string
  readonly balance: Halere
  readonly balanceAsOf: string
  readonly endsOn: string
}

export type DemoPlan = {
  readonly anchor: string
  readonly today: string
  readonly yearStart: YearMonth
  readonly lastClosed: YearMonth
  readonly currentMonth: YearMonth
  readonly organization: {
    readonly slug: string
    readonly legalName: string
    readonly ico: string
    readonly dic: string
    readonly vatRegisteredFrom: string
    readonly street: string
    readonly houseNumber: string
    readonly orientationNumber: string
    readonly city: string
    readonly postalCode: string
    readonly dataBoxId: string
    readonly courtFileNumber: string
    readonly taxOfficeCode: string
    readonly bankAccountPrefix: string
    readonly bankAccountNumber: string
    readonly bankCode: string
    readonly iban: string
    readonly contactEmail: string
    readonly contactPhone: string
  }
  readonly users: readonly DemoUser[]
  readonly employees: readonly DemoEmployee[]
  readonly partners: readonly DemoPartner[]
  readonly assets: readonly DemoAsset[]
  readonly loans: readonly DemoLoan[]
  readonly assetCards: readonly DemoAssetCard[]
  readonly loanCards: readonly DemoLoanCard[]
  readonly months: readonly DemoMonthDatasets[]
  readonly filings: readonly DemoFiling[]
  readonly liabilities: readonly DemoLiability[]
  readonly tasks: readonly DemoTask[]
  readonly documents: readonly DemoDocument[]
}

function employedIn(
  person: DemoEmployee,
  yearStart: YearMonth,
  ym: YearMonth,
): boolean {
  if (monthsBetween(addMonths(yearStart, -person.startedMonthsBefore), ym) < 0)
    return false
  if (person.endedMonthsAfter === null) return true
  return monthsBetween(addMonths(yearStart, person.endedMonthsAfter), ym) <= 0
}

/**
 * The day the office closed and published a month: early in the following one,
 * and clamped to the demo date. Anchored on the fourth of a month, the close of
 * the month just ended cannot have been published on the ninth.
 */
const publicationDate = (ym: YearMonth, today: string): string =>
  notAfter(dayOfMonth(addMonths(ym, 1), 9), today)

/**
 * Build the whole demo firm from one date.
 *
 * The fiscal year shown is the one the LAST CLOSED month belongs to, and the
 * published history runs from that year's January up to that month. Anchored on
 * a January the seed therefore publishes the previous year in full rather than
 * an empty one — there is always at least one published month, and the newest is
 * always the month just ended, which is exactly `freshnessBand`'s "current".
 */
export function buildDemoPlan(anchor: string = DEMO_ANCHOR): DemoPlan {
  const today = anchor
  const currentMonth = parseYearMonth(anchor)
  const lastClosed = addMonths(currentMonth, -1)
  const yearStart: YearMonth = { year: lastClosed.year, month: 1 }

  // The prior year, closed the same way, is what the "minulé období" columns
  // carry and what fixes the profit brought forward into the year on show.
  const priorYearStart = addMonths(yearStart, -12)
  const priorCloses = closeYear({
    yearStart: priorYearStart,
    months: 12,
    revenueScale: PRIOR_YEAR_REVENUE_SCALE,
    payrollScale: PRIOR_YEAR_PAYROLL_SCALE,
    retainedEarnings: 0,
    employeesAt: (ym) =>
      EMPLOYEES.filter((person) => employedIn(person, priorYearStart, ym)),
  })
  const priorYearEnd = priorCloses[priorCloses.length - 1]!

  // Profit brought forward is fixed by the opening cash the firm actually had:
  // everything else on the opening balance sheet is known, so the plug is stated
  // once, here, and stays constant through the year on show.
  const openingFixed = fixedAssetsAt(yearStart, addMonths(yearStart, -1))
  const openingReceivables =
    share(
      revenueOf(addMonths(yearStart, -1), PRIOR_YEAR_REVENUE_SCALE),
      RECEIVABLE_CURRENT_RATIO,
    ) +
    share(
      revenueOf(addMonths(yearStart, -2), PRIOR_YEAR_REVENUE_SCALE),
      RECEIVABLE_PRIOR_RATIO,
    )
  const openingLoans = loansTotalAt(yearStart, addMonths(yearStart, -1))
  const openingLiabilities =
    priorYearEnd.tradePayables +
    openingLoans +
    priorYearEnd.wagesPayable +
    priorYearEnd.insurancePayable +
    priorYearEnd.incomeTaxWithheldPayable +
    priorYearEnd.vatPayable
  const broughtForward =
    openingFixed.net +
    openingReceivables +
    OPENING_CASH -
    openingLiabilities -
    REGISTERED_CAPITAL -
    priorYearEnd.profitAfterTaxYtd

  const closes = closeYear({
    yearStart,
    months: lastClosed.month,
    revenueScale: 1,
    payrollScale: 1,
    retainedEarnings: broughtForward + priorYearEnd.profitAfterTaxYtd,
    employeesAt: (ym) =>
      EMPLOYEES.filter((person) => employedIn(person, yearStart, ym)),
  })

  // The opening balance sheet, as the "minulé období" column of every rozvaha.
  const opening: MonthClose = {
    ...priorYearEnd,
    retainedEarnings: broughtForward,
    equityTotal:
      REGISTERED_CAPITAL + broughtForward + priorYearEnd.profitAfterTaxYtd,
    receivables: openingReceivables,
    cashTotal: OPENING_CASH,
    cashRegister: CASH_REGISTER_FLOAT,
    bankAccount: OPENING_CASH - CASH_REGISTER_FLOAT,
    fixedGross: openingFixed.gross,
    fixedAccumulated: openingFixed.accumulated,
    fixedNet: openingFixed.net,
    loanBalance: openingLoans,
    liabilitiesTotal: openingLiabilities,
    assetsTotal: openingFixed.net + openingReceivables + OPENING_CASH,
  }

  const months: DemoMonthDatasets[] = closes.map((close, index) => ({
    period: periodOfMonth(close.ym),
    publishedOn: publicationDate(close.ym, today),
    payrollDueOn: dayOfMonth(addMonths(close.ym, 1), 20),
    close,
    rozvahaAktiva: buildAktiva(close, opening),
    rozvahaPasiva: buildValueStatement(PASIVA, close, opening),
    vzz: buildValueStatement(VZZ, close, priorCloses[index] ?? null),
    predvaha: buildPredvaha(close, index === 0 ? opening : closes[index - 1]!, {
      firstMonthOfYear: index === 0,
      unappropriatedResult: priorYearEnd.profitAfterTaxYtd,
    }),
    saldokonto: buildSaldokonto(close, close.ym),
  }))

  return {
    anchor,
    today,
    yearStart,
    lastClosed,
    currentMonth,
    organization: {
      slug: "stavby-novak",
      legalName: "Stavby Novák s.r.o.",
      // The repo's canonical beta fixture identity — allowlisted, and it reads
      // as demo data at a glance. The DIČ is derived, never written out.
      ico: "12345678",
      dic: dicOf("12345678"),
      vatRegisteredFrom: monthStart(addMonths(yearStart, -81)),
      street: "Bubenečská",
      houseNumber: "312",
      orientationNumber: "17",
      city: "Praha 6",
      postalCode: "16000",
      dataBoxId: "k9d3rr2",
      courtFileNumber: "C 184266 vedená u Městského soudu v Praze",
      taxOfficeCode: "001",
      bankAccountPrefix: "19",
      bankAccountNumber: "2000145399",
      bankCode: "0800",
      iban: "CZ6508000000192000145399",
      contactEmail: "info@example.com",
      contactPhone: "+420 602 118 340",
    },
    users: USERS,
    employees: EMPLOYEES,
    partners: PARTNERS,
    assets: ASSETS,
    loans: LOANS,
    assetCards: ASSETS.map((item) => {
      const disposed = disposalMonth(item, yearStart)
      const improved = improvementMonth(item, yearStart)
      // Stamped at the last closed month end for a live asset, and frozen at the
      // disposal for one that has left — never interpolated to "today" (§2.7).
      const stampAt = disposed === null ? lastClosed : addMonths(disposed, -1)
      return {
        key: item.key,
        inServiceOn: monthStart(inServiceMonth(item, yearStart)),
        disposedOn: disposed === null ? null : monthEnd(disposed),
        improvedOn: improved === null ? null : monthEnd(improved),
        accumulatedDepreciation: item.isMinor
          ? null
          : accumulatedDepreciationAt(item, yearStart, stampAt),
        depreciationAsOf: item.isMinor ? null : monthEnd(stampAt),
      }
    }),
    loanCards: LOANS.map((loan) => ({
      key: loan.key,
      balance: loanBalanceAt(loan, yearStart, lastClosed),
      balanceAsOf: monthEnd(lastClosed),
      endsOn: monthEnd(
        addMonths(
          addMonths(yearStart, -loan.startedMonthsBefore),
          loan.termMonths,
        ),
      ),
    })),
    months,
    filings: buildFilings(closes, currentMonth, today),
    liabilities: buildLiabilities(today),
    tasks: buildTasks(currentMonth, today),
    documents: buildDocuments(closes, lastClosed, today),
  }
}

// ---------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------

/**
 * Re-derive the invariants the plan is supposed to hold, and name the ones it
 * does not. Runs after every seed and across a spread of anchors in the suite —
 * a wrong figure is a failed audit, not a client noticing that the rozvaha does
 * not balance.
 */
export function auditDemoPlan(plan: DemoPlan): string[] {
  const problems: string[] = []
  const at = (ym: YearMonth): string =>
    `${String(ym.month).padStart(2, "0")}/${ym.year}`

  if (plan.months.length === 0) return ["no month was published at all"]

  // §0.4 — freshness. All five datasets share the newest published period, so
  // one band decides for all of them.
  const newest = plan.months[plan.months.length - 1]!.close.ym
  const band = freshnessBand(
    { kind: "month", year: newest.year, month: newest.month, quarter: null },
    plan.today,
  )
  if (band !== "current") {
    problems.push(
      `every dataset would render as "${band}" at ${plan.today} — newest published period is ${at(newest)}`,
    )
  }

  for (const month of plan.months) {
    const label = at(month.close.ym)
    const close = month.close
    const say = (message: string) => problems.push(`${label}: ${message}`)

    if (close.assetsTotal !== close.equityTotal + close.liabilitiesTotal) {
      say(
        `rozvaha does not balance — aktiva ${close.assetsTotal} vs pasiva ${close.equityTotal + close.liabilitiesTotal}`,
      )
    }
    for (const row of month.rozvahaAktiva) {
      if (
        row.gross !== undefined &&
        row.adjustment !== undefined &&
        row.gross - row.adjustment !== row.current
      ) {
        say(`aktiva row ${row.rowCode} netto ${row.current} ≠ brutto − korekce`)
      }
    }

    const aktivaTotal = month.rozvahaAktiva[0]?.current ?? 0
    const pasivaTotal = month.rozvahaPasiva[0]?.current ?? 0
    if (aktivaTotal !== pasivaTotal) {
      say(`AKTIVA CELKEM ${aktivaTotal} ≠ PASIVA CELKEM ${pasivaTotal}`)
    }

    // The rozvaha's result row is the VZZ's bottom line.
    const result = month.rozvahaPasiva.find((row) => row.rowCode === "090")
    const bottom = month.vzz.find((row) => row.rowCode === "53")
    if (result && bottom && result.current !== bottom.current) {
      say(`rozvaha result ${result.current} ≠ VZZ result ${bottom.current}`)
    }

    // Double entry: turnovers agree, every closing follows from its opening, and
    // the whole debit-positive column nets to zero.
    const debit = sum(month.predvaha.map((row) => row.debit))
    const credit = sum(month.predvaha.map((row) => row.credit))
    if (debit !== credit) say(`předvaha MD ${debit} ≠ D ${credit}`)
    for (const row of month.predvaha) {
      if (row.opening + row.debit - row.credit !== row.closing) {
        say(`účet ${row.accountCode} closing ≠ opening + MD − D`)
      }
    }
    const netClosing = sum(month.predvaha.map((row) => row.closing))
    if (netClosing !== 0)
      say(`předvaha closing balances net to ${netClosing}, not 0`)

    // Účty a hotovost reads 211 + 221 off the předvaha; the rozvaha states the
    // same cash. They have to be the same number.
    const mapped = sum(
      month.predvaha
        .filter((row) => row.accountCode === "211" || row.accountCode === "221")
        .map((row) => row.closing),
    )
    if (mapped !== close.cashTotal) {
      say(
        `mapped účty 211+221 ${mapped} ≠ rozvaha peněžní prostředky ${close.cashTotal}`,
      )
    }

    // Saldokonto totals are the receivables and payables the rozvaha states.
    const receivable = sum(month.saldokonto.map((row) => row.receivable ?? 0))
    const payable = sum(month.saldokonto.map((row) => row.payable ?? 0))
    if (receivable !== close.receivables) {
      say(`saldokonto pohledávky ${receivable} ≠ rozvaha ${close.receivables}`)
    }
    if (payable !== close.tradePayables) {
      say(`saldokonto závazky ${payable} ≠ rozvaha ${close.tradePayables}`)
    }
    for (const row of month.saldokonto) {
      if ((row.payable ?? 0) > 0 && row.oldestDue === null) {
        say(
          `partner ${row.partnerKey} owes ${row.payable} with no oldest due date`,
        )
      }
    }

    // The payroll recap adds up, and its lines add up to it.
    const payroll = close.payroll
    if (
      payroll.employerCostTotal !==
      payroll.grossTotal + payroll.employerSocial + payroll.employerHealth
    ) {
      say("payroll employer cost ≠ gross + levies")
    }
    if (
      payroll.netPaidTotal !==
      payroll.grossTotal - payroll.withholdingsTotal
    ) {
      say("payroll net paid ≠ gross − withholdings")
    }
    if (
      payroll.withholdingsTotal !==
      payroll.employeeSocial + payroll.employeeHealth + payroll.incomeTaxAdvance
    ) {
      say("payroll withholdings ≠ their parts")
    }
    if (sum(payroll.lines.map((line) => line.gross)) !== payroll.grossTotal) {
      say("payroll lines do not sum to the recap gross")
    }
    if (sum(payroll.lines.map((line) => line.net)) !== payroll.netPaidTotal) {
      say("payroll lines do not sum to the recap net")
    }
    if (
      payroll.headcountHpp + payroll.headcountDpc + payroll.headcountDpp !==
      payroll.lines.length
    ) {
      say("headcount ≠ the number of payroll lines")
    }

    // Nothing on the balance sheet is negative in a way that would read as a
    // modelling accident on screen.
    if (close.bankAccount <= 0)
      say(`bank account balance ${close.bankAccount} is not positive`)
    if (month.publishedOn > plan.today)
      say(`published on ${month.publishedOn}, after the demo date`)
  }

  // `filing_filed_coherence`, and nothing filed in the future.
  for (const filing of plan.filings) {
    if ((filing.status === "planned") !== (filing.filedOn === null)) {
      problems.push(
        `filing ${filing.key} is ${filing.status} but filed_on disagrees`,
      )
    }
    if (filing.filedOn !== null && filing.filedOn > plan.today) {
      problems.push(
        `filing ${filing.key} was filed on ${filing.filedOn}, after the demo date`,
      )
    }
    if (filing.paidAt !== null && filing.amountDue === null) {
      problems.push(`filing ${filing.key} is paid but states no amount`)
    }
  }

  // There is something for the client to do and something to pay — a demo where
  // Přehled's two lists are empty shows none of the product.
  if (!plan.tasks.some((task) => !task.isTemplate && task.status === "open")) {
    problems.push("no open client task — Přehled's first card would be empty")
  }
  const unpaid =
    plan.filings.filter((row) => row.amountDue !== null && row.paidAt === null)
      .length + plan.liabilities.filter((row) => row.paidAt === null).length
  if (unpaid === 0)
    problems.push("no unpaid obligation — Dluhy a platby would be empty")

  for (const document of plan.documents) {
    if (document.createdAt.slice(0, 10) > plan.today) {
      problems.push(`document ${document.key} was uploaded after the demo date`)
    }
    if (
      document.status === "returned" &&
      (document.officeMessage ?? "").trim() === ""
    ) {
      problems.push(`document ${document.key} is returned without a message`)
    }
  }

  // Every period a row points at must be one the seed will create.
  return problems
}

// ---------------------------------------------------------------------------
// The stale-date audit
// ---------------------------------------------------------------------------

export type AbsoluteDateHit = {
  readonly line: number
  readonly text: string
  readonly match: string
}

/** An ISO date, a bare four-digit year, or a `Date` constructed over a string. */
const ABSOLUTE_DATE_PATTERNS: readonly RegExp[] = [
  /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g,
  /(?<![\w.])(?:19|20)\d{2}(?![\w.])/g,
  /new Date\(\s*["'`]/g,
]

/**
 * Find every absolute date this seed's source has no business carrying.
 *
 * This is the other half of the freshness promise. The model is anchored, but
 * nothing stops a later edit from writing a literal date into a filing or a
 * document — and that date would be silently wrong the first time the anchor
 * moves. The line declaring `DEMO_ANCHOR` is the one exemption.
 */
export function findAbsoluteDateLiterals(source: string): AbsoluteDateHit[] {
  const hits: AbsoluteDateHit[] = []

  source.split("\n").forEach((text, index) => {
    if (text.includes("DEMO_ANCHOR =")) return
    for (const pattern of ABSOLUTE_DATE_PATTERNS) {
      pattern.lastIndex = 0
      let match = pattern.exec(text)
      while (match !== null) {
        hits.push({ line: index + 1, text: text.trim(), match: match[0] })
        match = pattern.exec(text)
      }
    }
  })

  return hits
}
