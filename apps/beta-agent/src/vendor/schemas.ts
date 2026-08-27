/**
 * The validation boundary of the agent ingestion API (spec §3.2: "Input schemas
 * validated (zod); NO org_id inference from payload beyond the key's scope").
 *
 * THREE RULES THIS FILE ENFORCES, AND WHY EACH ONE IS HERE RATHER THAN DEEPER:
 *
 * 1. NO TENANCY IN A BODY. `organizationId`, `userId`, `role` and their
 *    spellings are refused OUTRIGHT — not ignored — by `tenancyKeysIn` below.
 *    Ignoring an unknown field is the failure mode that lets an integration ship
 *    against a field the server silently drops, and then one day honours. The
 *    organization is named in the URL and authorized against the key's scope
 *    (`resolveAgentOwnerScope`); there is exactly one place a book can be named.
 *
 * 2. EVERY OBJECT IS STRICT. An unknown key is a 400. A typo'd `amountDue` that
 *    parsed as "absent" would publish a filing with no amount and look like the
 *    office forgot to state one — the exact confidently-wrong outcome §0.4 is
 *    written against.
 *
 * 3. MONEY IS A STRING, AND STAYS ONE. Beta never computes an accounting number
 *    (§0.2) and never parses one: `z.number()` on a money field would round-trip
 *    `1234567.89` through an IEEE double before Postgres ever sees it. The
 *    pattern below is `numeric(14,2)`'s own grammar, checked here so a malformed
 *    figure is a named 400 rather than a 22P02 at the bottom of a transaction.
 *
 * The DB CHECKs behind every one of these remain the floor: this file is the
 * ceiling, and the two disagreeing is a bug in this file, never a hole.
 */
import { z } from "zod"

// ---------------------------------------------------------------------------
// Tenancy keys — rule 1
// ---------------------------------------------------------------------------

/**
 * Names a payload may not contain at any depth, in any spelling.
 *
 * Compared on a normalized form (separators stripped, lowercased) exactly as
 * `CLIENT_FORBIDDEN_COLUMNS` is, so `organization_id`, `organizationId` and
 * `ORGANIZATIONID` are one name here. Word order is NOT normalized, so both
 * spellings of a two-word name are listed where both are plausible.
 */
const FORBIDDEN_PAYLOAD_KEYS = Object.freeze([
  "organizationid",
  "organization",
  "orgid",
  "orgslug",
  "workspaceid",
  "userid",
  "actinguserid",
  "agentkeyid",
  "role",
  "isstaff",
])

const normalize = (key: string): string =>
  key.replace(/[_-]/g, "").toLowerCase()

/** Every forbidden name reachable from `value`. Returns the keys, not a flag. */
export function tenancyKeysIn(value: unknown, depth = 0): string[] {
  if (depth > 8 || value === null || typeof value !== "object") return []
  if (Array.isArray(value)) {
    return value.flatMap((item) => tenancyKeysIn(item, depth + 1))
  }
  const found: string[] = []
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEYS.includes(normalize(key))) found.push(key)
    found.push(...tenancyKeysIn(nested, depth + 1))
  }
  return found
}

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

/** `numeric(14,2)`, as its own grammar. Never parsed, never re-formatted. */
const money = z
  .string()
  .regex(
    /^-?\d{1,12}(\.\d{1,2})?$/,
    "expected a numeric(14,2) value as a string",
  )

/**
 * The same grammar with no sign — for a column the database refuses a negative
 * on (`partner_saldo_totals_nonnegative`).
 *
 * Stated here rather than left to the CHECK because the two sides of a saldo
 * mean opposite things: a negative payable is a RECEIVABLE, and a caller that
 * sent one meant the other column. Naming the field in a 400 is the difference
 * between "fix your mapping" and a constraint name at the bottom of a
 * transaction.
 */
const unsignedMoney = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "expected a non-negative numeric(14,2) value as a string",
  )

/**
 * Whether a money string is strictly greater than zero — TEXTUALLY, never by
 * parsing.
 *
 * `Number("0.00") > 0` would be the obvious implementation and it is the one
 * thing this file forbids (rule 3 in the header): a money value never becomes an
 * IEEE double anywhere in this application. The grammar above guarantees digits
 * and at most one dot, so "is any digit non-zero" is the same question and
 * survives a figure no double could hold.
 */
function isPositiveMoney(value: string): boolean {
  return /[1-9]/.test(value)
}

/**
 * A REAL DAY, written `YYYY-MM-DD` — the shape a `date` column stores.
 *
 * THE SHAPE CHECK ALONE IS NOT ENOUGH, and the gap was a 500. `2026-02-30`,
 * `2026-13-01` and `2026-04-31` all match the regex; Postgres then rejects the
 * literal with 22008 (`date/time field value out of range`) at the bottom of the
 * transaction, which is not a `IngestRefused` and not a unique violation, so
 * `ingest` rethrows it and the caller receives a 500 for a payload the API is
 * supposed to name a 400 on. This file is the ceiling over the database's floor
 * (rule 3 in the header); a day the calendar does not have has to be refused
 * HERE, by field path.
 *
 * ROUND-TRIP RATHER THAN A CALENDAR REIMPLEMENTATION. `Date.UTC` normalises an
 * out-of-range day (31 April becomes 1 May), so re-rendering the parsed instant
 * and comparing it to the input is an exact "is this the day you wrote"
 * question, with the leap-year rule supplied by the platform instead of by a
 * hand-written February branch. UTC, never local: a local-midnight parse shifts
 * the day in half the world's time zones.
 *
 * Fixed at the SHARED reader, so every dataset that takes a date — dueOn,
 * filedOn, oldestDue, acquiredOn, disposedOn, asOf, … — gets it at once.
 */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number) as [
      number,
      number,
      number,
    ]
    const parsed = new Date(Date.UTC(year, month - 1, day))
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    )
  }, "expected a real calendar date")

/** An instant. `paid_at` is a timestamptz, unlike the date-only columns. */
const instant = z.iso.datetime({ offset: true })

const text = (max: number) => z.string().min(1).max(max)
const optionalText = (max: number) => z.string().max(max).nullish()

/**
 * The agent's own id for a row — the upsert match key (migration 0011).
 *
 * REQUIRED on every upserted item, not optional. An item without one could only
 * ever be an insert, so a retried run would duplicate the whole registry; making
 * it mandatory means "this endpoint is idempotent" is a property of the contract
 * rather than of how carefully the caller filled it in.
 */
const externalRef = text(200)

/**
 * A reporting period, as coordinates rather than as an id.
 *
 * An id would have to be looked up by the agent, which means an endpoint that
 * hands out period ids, which means an id from another book is a value the agent
 * can hold. Coordinates are resolved against the caller's own scope
 * (`ensureReportingPeriod`), so the id can only ever be this organization's.
 */
const periodSchema = z
  .object({
    kind: z.enum(["month", "quarter", "year"]),
    year: z.int().min(2000).max(2100),
    month: z.int().min(1).max(12).nullish(),
    quarter: z.int().min(1).max(4).nullish(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // The DB's `reporting_period_shape` CHECK says the same thing. Said here
    // too so a mismatched pair is a named field error instead of a 23514 the
    // caller has to guess at.
    if (value.kind === "month" && value.month == null) {
      ctx.addIssue({ code: "custom", path: ["month"], message: "required" })
    }
    if (value.kind === "quarter" && value.quarter == null) {
      ctx.addIssue({ code: "custom", path: ["quarter"], message: "required" })
    }
  })

// ---------------------------------------------------------------------------
// Batch datasets (spec §3.2 publish semantics)
// ---------------------------------------------------------------------------

/**
 * Caps on how much one call may carry.
 *
 * A statutory rozvaha is ~120 řádků and a full účtový rozvrh rarely passes 800
 * accounts, so these are generous by an order of magnitude and still bound the
 * memory one request can make this single-task service allocate.
 */
const MAX_STATEMENT_LINES = 2000
const MAX_TRIAL_BALANCE_LINES = 5000
// Registry upserts are capped far lower than the batch datasets: a year of one
// organization's filings is ~30 rows, and the whole payload of a call is echoed
// into its `activity_log` summary, which the office reads.
const MAX_ITEMS = 200

const statementLineSchema = z
  .object({
    statementKind: z.enum(["rozvaha_aktiva", "rozvaha_pasiva", "vzz"]),
    ozn: optionalText(16),
    rowCode: text(16),
    rowLabel: text(512),
    sortOrder: z.int().min(0).max(100_000),
    indent: z.int().min(0).max(8).optional(),
    isBold: z.boolean().optional(),
    brutto: money.nullish(),
    korekce: money.nullish(),
    netto: money.nullish(),
    bezne: money.nullish(),
    minule: money.nullish(),
  })
  .strict()

/**
 * Publish a rozvaha or a VZZ.
 *
 * The dataset↔kind pairing is checked HERE as well as by the database trigger
 * (`statement_line_matches_dataset`, migration 0007), because a `vzz` row inside
 * a `rozvaha` batch would otherwise satisfy every constraint on `import_batch`
 * and then surface under whichever period the reader queried. The type system
 * catches that for an in-process caller (`ImportBatchPayload` is a discriminated
 * union); JSON has no types, so this refinement is that union's boundary form.
 */
export const publishStatementsSchema = z
  .object({
    dataset: z.enum(["rozvaha", "vzz"]),
    period: periodSchema,
    lines: z.array(statementLineSchema).min(1).max(MAX_STATEMENT_LINES),
    noteInternal: optionalText(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [index, line] of value.lines.entries()) {
      const ok =
        value.dataset === "vzz"
          ? line.statementKind === "vzz"
          : line.statementKind !== "vzz"
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "statementKind"],
          message: `not a ${value.dataset} statement kind`,
        })
      }
    }
  })

export const publishTrialBalanceSchema = z
  .object({
    period: periodSchema,
    lines: z
      .array(
        z
          .object({
            accountCode: text(32),
            accountName: text(255),
            openingBalance: money.nullish(),
            turnoverDebit: money.nullish(),
            turnoverCredit: money.nullish(),
            closingBalance: money.nullish(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_TRIAL_BALANCE_LINES),
    noteInternal: optionalText(2000),
  })
  .strict()

/**
 * Publish a saldokonto (spec §3.2's "saldokonto (partner+saldo upsert)").
 *
 * ONE LINE PER PARTNER, and the partner's IDENTITY is nested inside it rather
 * than flattened alongside the two totals. The nesting is the contract made
 * visible: the `partner` block is UPSERTED into a registry that outlives every
 * period, and the three figures beside it are PUBLISHED as one period's
 * measurement and superseded wholesale next month. A flat line would read as one
 * fact with one lifetime, which is exactly the confusion that would make an
 * office edit disappear on the next import.
 *
 * THE PARTNER BLOCK IS THE WHOLE TRUTH ABOUT THE PARTNER. A field the payload
 * omits is set to NULL, not left alone — the same semantics `filings` and
 * `assets` already have, and the right ones for an import: the office's own
 * system is the authority on a supplier's name and address, so "absent" there
 * means "absent", never "keep whatever the portal had". The two fields it can
 * NOT reach are `noteClient` and `noteInternal`, which are the portal's own
 * layer (§3.3) and have no field here at all — an import must never erase an
 * accountant's note about a supplier.
 *
 * `externalRef` IS THE PARTNER'S ID, not the saldo row's. A saldo row's identity
 * is (batch, partner), which the batch itself supplies; the ref names the
 * counterparty across periods and across runs. See `lib/data/partners.ts` for
 * the match order it participates in.
 */
const saldoPartnerSchema = z
  .object({
    externalRef,
    name: text(255),
    // Eight digits, and the DB CHECK says the same. Stated here because it is a
    // MATCH KEY: a seven-digit IČO an export left unpadded would create a second
    // partner for a company that already has one, and the caller is better told
    // which field is wrong than handed `partner_ico_shape`.
    ico: z
      .string()
      .regex(/^\d{8}$/)
      .nullish(),
    dic: optionalText(14),
    // `partnerRole`, NOT `role`, and the name is load-bearing: `role` is on
    // `FORBIDDEN_PAYLOAD_KEYS` (rule 1) because a membership role must never be
    // stated in a body, and the check is on a NORMALIZED name at any depth. A
    // partner's commercial role is a different thing entirely, so it takes the
    // column's own name and the tenancy fence stays exactly as strict as it was.
    partnerRole: z.enum(["supplier", "customer", "both", "other"]).optional(),
    email: optionalText(255),
    phone: optionalText(32),
    street: optionalText(255),
    houseNumber: optionalText(16),
    orientationNumber: optionalText(16),
    city: optionalText(255),
    postalCode: optionalText(10),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict()

const MAX_SALDO_LINES = 2000

export const publishSaldokontoSchema = z
  .object({
    period: periodSchema,
    lines: z
      .array(
        z
          .object({
            partner: saldoPartnerSchema,
            /** "Dlužné nám" (§2.4). */
            receivableTotal: unsignedMoney.nullish(),
            /** "Dlužíme" — the figure the Dodavatelé obligations arm reads. */
            payableTotal: unsignedMoney.nullish(),
            oldestDue: isoDate.nullish(),
          })
          .strict()
          .superRefine((value, ctx) => {
            // Both mirror a DB CHECK, and both are worth naming rather than
            // letting the constraint speak.
            //
            // `partner_saldo_states_something`: a line with neither total is not
            // a fact about the partner, it is a row that would render as an
            // empty line under a supplier's name.
            if (value.receivableTotal == null && value.payableTotal == null) {
              ctx.addIssue({
                code: "custom",
                path: ["payableTotal"],
                message: "state receivableTotal, payableTotal, or both",
              })
            }
            // `partner_saldo_payable_has_oldest_due`: the obligations read model
            // lists a payable WITH its splatnost, and a dateless one would be
            // dropped from Dluhy a platby and from Nejbližší termíny without
            // anybody being told. Refusing it here turns a silently lost debt
            // into a 400 the office agent can fix.
            if (
              value.payableTotal != null &&
              isPositiveMoney(value.payableTotal) &&
              value.oldestDue == null
            ) {
              ctx.addIssue({
                code: "custom",
                path: ["oldestDue"],
                message: "a stated payable carries the date it is due",
              })
            }
          }),
      )
      .min(1)
      .max(MAX_SALDO_LINES),
    noteInternal: optionalText(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    // ONE LINE PER PARTNER. `partner_saldo_identity_unique` refuses the second
    // one at the bottom of the transaction, which the caller would receive as an
    // unexplained `conflict`; here it is the index of the offending line. A
    // duplicate is also the one shape that could DOUBLE a supplier's payable in
    // Dluhy a platby if the constraint were ever relaxed, so it is checked in
    // both places on purpose.
    const seen = new Map<string, number>()
    for (const [index, line] of value.lines.entries()) {
      const ref = line.partner.externalRef
      const first = seen.get(ref)
      if (first !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "partner", "externalRef"],
          message: `duplicate partner, first stated at line ${first}`,
        })
        continue
      }
      seen.set(ref, index)
    }
  })

/**
 * A headcount. An integer, and never a money string: it counts people.
 *
 * The cap mirrors `MAX_PAYROLL_EMPLOYEES` below rather than being open-ended —
 * a five-digit headcount in a payload aimed at a small s.r.o.'s book is a
 * mis-mapped column, and it is cheaper to say so here than to let the office
 * discover it on Přehled mezd.
 */
const headcount = z.int().min(0).max(10_000)

/**
 * How many employees one payroll publish may carry.
 *
 * The office's clients are small Czech s.r.o.s; 500 is an order of magnitude
 * above the largest realistic payroll here, and it bounds the per-employee
 * upsert list this call echoes into its `activity_log` summary — which the
 * office reads, and which is why this cap is nearer the registry cap than the
 * 5 000-row `predvaha` one.
 */
const MAX_PAYROLL_EMPLOYEES = 500

/**
 * Publish one period's payroll — the totals and the per-employee lines (spec
 * §3.2 "payroll summary + employee lines", §2.6).
 *
 * ONE CALL, TWO PAYLOAD TABLES, and the employee REGISTRY upserted alongside
 * them, because the office's source produces all three as one payroll run. A
 * separate "employees" endpoint would let the register and the lines be
 * published apart, and a line whose person the portal does not know yet is not a
 * state anything can render.
 *
 * `summary` IS REQUIRED, `employees` IS NOT. A payroll publish with lines and no
 * totals would leave Přehled mezd reading "zatím nebylo nahráno" while
 * Zaměstnanci showed a full month; the reverse — totals with no per-person
 * breakdown — is a real thing an office may send (spec §2.6 has the two as
 * separate surfaces) and is accepted as such. Every field INSIDE `summary` is
 * optional: an absent figure is absent, never zero (§0.4).
 *
 * `externalRef` IS THE ONLY MATCH KEY, and it is required on every employee.
 * Two employees can genuinely be called Jan Novák, and one employee's name
 * genuinely changes — so name matching would merge two people in the first case
 * and duplicate one in the second, and both end with a salary attributed to the
 * wrong person. The source payroll system's own id is the only key that means
 * anything here.
 *
 * THERE IS NO `appUserId` FIELD, AND THERE WILL NOT BE ONE. Binding a portal
 * account to an employee row is the employee seat's identity act (spec §2.6.1:
 * a pre-bound setup token consumed into account + guest membership + link, in
 * one transaction), not an accounting fact an office agent states. An agent that
 * could set it could hand any account someone else's payslips.
 */
export const publishPayrollSchema = z
  .object({
    period: periodSchema,
    summary: z
      .object({
        grossTotal: money.nullish(),
        employerSocial: money.nullish(),
        employerHealth: money.nullish(),
        /** "Celkové náklady na zaměstnance" (spec §2.6). Never "superhrubá". */
        employerCostTotal: money.nullish(),
        employeeWithholdingsTotal: money.nullish(),
        incomeTaxAdvance: money.nullish(),
        /** Čistá vyplacená celkem (Advisor F14). */
        netPaidTotal: money.nullish(),
        paymentDueDate: isoDate.nullish(),
        headcountHpp: headcount.nullish(),
        headcountDpc: headcount.nullish(),
        headcountDpp: headcount.nullish(),
        noteClient: optionalText(2000),
      })
      .strict(),
    employees: z
      .array(
        z
          .object({
            externalRef,
            fullName: text(255),
            contractType: z.enum(["hpp", "dpc", "dpp"]),
            startedOn: isoDate.nullish(),
            endedOn: isoDate.nullish(),
            /**
             * Whether the register still lists this person. Independent of
             * `endedOn` on purpose — spec §2.6.1 makes deactivating a leaver a
             * deliberate act ("never automatic"), so neither is derived from
             * the other here or in the database.
             */
            active: z.boolean().optional(),
            gross: money.nullish(),
            deductionsTotal: money.nullish(),
            net: money.nullish(),
            employerCost: money.nullish(),
          })
          .strict()
          .superRefine((value, ctx) => {
            // Mirrors `payroll_employee_employment_dates_ordered`. Stated here
            // so the caller is told WHICH field is wrong instead of being handed
            // a constraint name in a 23514.
            if (
              value.startedOn &&
              value.endedOn &&
              value.endedOn < value.startedOn
            ) {
              ctx.addIssue({
                code: "custom",
                path: ["endedOn"],
                message: "endedOn precedes startedOn",
              })
            }
          }),
      )
      .max(MAX_PAYROLL_EMPLOYEES),
    noteInternal: optionalText(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    // `payroll_employee_line_identity_unique` would refuse the second row with a
    // 23505 at the bottom of a transaction. Refused here instead, by index, so a
    // source that emitted one person twice is told which entry is the duplicate
    // — and so the refusal costs no transaction at all.
    const seen = new Set<string>()
    for (const [index, employee] of value.employees.entries()) {
      if (seen.has(employee.externalRef)) {
        ctx.addIssue({
          code: "custom",
          path: ["employees", index, "externalRef"],
          message: "duplicate externalRef in one payroll payload",
        })
      }
      seen.add(employee.externalRef)
    }
  })

// ---------------------------------------------------------------------------
// Registry upserts (spec §3.2 "filings, liabilities, ... assets")
// ---------------------------------------------------------------------------

export const filingsUpsertSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            externalRef,
            kind: z.enum([
              "dph_priznani",
              "dph_kontrolni_hlaseni",
              "dph_souhrnne_hlaseni",
              "dppo_priznani",
              "dppo_zaloha",
              "ucetni_zaverka",
              "vyuctovani_dane",
              "prehled_cssz",
              "prehled_zp",
              "jmhz",
              "silnicni_dan",
              "ostatni",
            ]),
            period: periodSchema,
            dueOn: isoDate,
            status: z
              .enum(["planned", "filed", "confirmed", "corrective"])
              .optional(),
            filedOn: isoDate.nullish(),
            amountDue: money.nullish(),
            paidAt: instant.nullish(),
            variableSymbol: z
              .string()
              .regex(/^\d{1,10}$/)
              .nullish(),
            noteClient: optionalText(2000),
            noteInternal: optionalText(2000),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict()

export const liabilitiesUpsertSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            externalRef,
            // `dodavatele` is absent on purpose: the database refuses it
            // (`liability_group_is_residue`) because that group belongs wholly
            // to the imported saldokonto, and an agent hand-feeding it would be
            // the triple-entry defect the read model exists to kill.
            creditorGroup: z.enum(["fu", "cssz_zp", "ostatni"]).optional(),
            label: text(255),
            amount: money,
            dueOn: isoDate,
            paidAt: instant.nullish(),
            variableSymbol: z
              .string()
              .regex(/^\d{1,10}$/)
              .nullish(),
            noteClient: optionalText(2000),
            noteInternal: optionalText(2000),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict()

export const assetsUpsertSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            externalRef,
            name: text(255),
            category: z.enum([
              "machine",
              "vehicle",
              "tool",
              "real_estate",
              "other",
            ]),
            isMinor: z.boolean().optional(),
            acquisitionCost: money,
            acquiredOn: isoDate.nullish(),
            placedInServiceOn: isoDate.nullish(),
            accumulatedDepreciation: money.nullish(),
            depreciationAsOf: isoDate.nullish(),
            taxResidualValue: money.nullish(),
            siteRef: optionalText(255),
            status: z.enum(["in_use", "disposed"]).optional(),
            disposedOn: isoDate.nullish(),
            noteClient: optionalText(2000),
            noteInternal: optionalText(2000),
          })
          .strict()
          .superRefine((value, ctx) => {
            // Both mirror a DB CHECK (`asset_depreciation_stamp_coherence`,
            // `asset_dispose_coherence`). Stated here so the caller is told
            // WHICH field is incoherent rather than being handed a constraint
            // name — an oprávky figure nobody can date is the "k dnešnímu dni"
            // trap §0.4 forbids, and it is worth naming.
            if (
              (value.accumulatedDepreciation == null) !==
              (value.depreciationAsOf == null)
            ) {
              ctx.addIssue({
                code: "custom",
                path: ["depreciationAsOf"],
                message: "accumulatedDepreciation and depreciationAsOf pair",
              })
            }
            // BOTH DIRECTIONS, mirroring `asset_dispose_coherence`'s own
            // `(status = 'disposed') = (disposed_on IS NOT NULL)`. The reverse
            // half is the one worth stating out loud: a `disposedOn` with no
            // `status` used to parse cleanly and then be DISCARDED by the ingest
            // (which only disposes when the payload says `disposed`), so an
            // office whose source marked an asset sold would get a 200, see
            // `updated`, and keep showing the asset in use. Silent discard of a
            // stated accounting fact is exactly what §0.2 forbids.
            if ((value.status === "disposed") !== (value.disposedOn != null)) {
              ctx.addIssue({
                code: "custom",
                path: ["disposedOn"],
                message: "status 'disposed' and disposedOn pair",
              })
            }
          }),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict()

/**
 * Upsert client tasks — "Co od vás potřebujeme" (spec §2.1, §3.4).
 *
 * REAL TASKS ONLY. There is no `isTemplate` field and there will not be one:
 * a template is not a thing the office's source system holds, it is a portal
 * construct the accountant builds in Pro účetní and instantiates with one
 * button. Letting an agent write templates would let a source-system row quietly
 * become a monthly obligation for every client.
 *
 * `done` is accepted because the office's own to-do list is where a task gets
 * ticked off; the API routes it to `setClientTaskDone`, which is the only write
 * that may touch `status` and `done_at` together.
 */
export const clientTasksUpsertSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            externalRef,
            title: text(255),
            description: optionalText(2000),
            dueDate: isoDate,
            linkKind: z.enum(["none", "dokumenty", "dane"]).optional(),
            done: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict()

/**
 * Upsert the account map — which účet is a bank account, which is the pokladna
 * (spec §3.2's `account_balance_map` endpoint, §2.4).
 *
 * NO `externalRef`, AND THAT IS NOT AN OVERSIGHT. Every other registry on this
 * API carries one because it has no natural key: two identical-looking DPH
 * advances can both be real, so an incoming row can only be matched on the id
 * its own source holds. An account map entry is the opposite case —
 * `accountCode` IS the identity, it is what the office's účtový rozvrh calls
 * the row, and migration 0014 makes it unique within the book. Adding a second
 * match key would let a re-sent entry match on one key and collide on the
 * other, which is the duplicate-or-lose failure `externalRef` exists to prevent
 * rather than to cause.
 *
 * THE MATCH KIND IS PART OF THE PAYLOAD, not inferred from the code's shape. An
 * office publishing `221` may mean "the syntetický účet 221 exactly" or "every
 * analytika under 221", and guessing from whether the code carries a separator
 * would be this product deciding what a client's rozvrh means. `exact` is the
 * default at the database, so an agent that says nothing claims one účet.
 *
 * `active: false` RETIRES AN ENTRY; there is no delete on this endpoint. A
 * closed account's balances still exist in every past předvaha, and dropping
 * the entry would silently remove that account from the client's history — so
 * the destructive act stays in the office's own hands (Zadávání dat).
 */
export const accountBalanceMapUpsertSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            // `trial_balance_line.account_code`'s own shape: free text, up to
            // 20 characters, no digit rule (a Czech rozvrh carries "343.01",
            // "311100", "221_02"). The one rule added here is the one the
            // matching depends on — no leading or trailing whitespace, because
            // the code is used as a literal PREFIX and a stray space would make
            // an entry match nothing while looking correct everywhere.
            accountCode: z
              .string()
              .max(20)
              .regex(
                /^\S(?:.*\S)?$/,
                "expected an account code with no padding",
              ),
            matchKind: z.enum(["exact", "prefix"]).optional(),
            label: text(120).regex(/\S/, "expected a non-blank label"),
            kind: z.enum(["bank", "cash"]),
            sortOrder: z.int().min(0).max(999).optional(),
            active: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict()

/**
 * `POST /orgs/{slug}/indicators` — state the office-provided figures that are
 * not a line of any statement (spec §2.1 item 4, migration 0020).
 *
 * MATCHED ON `(kind, asOf)`, NOT ON AN `externalRef`. Every registry endpoint
 * above matches on the agent's own id because a filing or an asset has an
 * identity in the office's system that this database cannot reconstruct. An
 * indicator reading has no such identity: it IS "this kind, as of this date",
 * which is also the unique key migration 0020 enforces. Adding an `externalRef`
 * would let a re-sent reading match on one key and collide on the other — the
 * duplicate-or-lose failure that key exists to prevent rather than to cause.
 *
 * NO DELETE ARM, deliberately, and unlike the office's own form. The agent
 * restates figures; removing one is a judgement about which reading was a typo,
 * and that stays in the office's hands on Zadávání dat.
 *
 * `asOf` IS REQUIRED. §0.4: every number carries the date it is as of, and obrat
 * more than any other — it is a 12-month rolling window, so a figure with no
 * date is not a fact anyone can check.
 */
export const indicatorsUpsertSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            // The pgEnum's own values (migration 0020). One today.
            kind: z.enum(["annual_turnover"]),
            // `unsignedMoney`, not `money`: obrat is a sum of taxable supplies
            // and the database refuses a negative one
            // (`organization_indicator_amount_nonnegative`). Naming the field in
            // a 400 beats a constraint name at the bottom of a transaction.
            amount: unsignedMoney,
            asOf: isoDate,
            noteInternal: optionalText(2000),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict()
  .superRefine((value, ctx) => {
    // ONE ITEM PER (kind, asOf) IN ONE PAYLOAD — the same rule, and the same
    // device, `publishSaldokontoSchema` applies to a repeated partner.
    //
    // The unique index makes a repeat an UPSERT rather than an error, so two
    // items naming 30. 6. 2026 do not fail: the second silently overwrites the
    // first and the summary reports `created: 1, updated: 1` for what the caller
    // sent as two distinct readings. That is the confidently-wrong outcome §0.4
    // is written against — the office agent's operator would read "2 applied"
    // and never learn that one figure was discarded. A payload stating one date
    // twice is a mis-mapped export, and it is cheaper to say which line is the
    // duplicate than to let the discrepancy surface on a client's Obrat watch.
    const seen = new Map<string, number>()
    for (const [index, item] of value.items.entries()) {
      const key = `${item.kind} ${item.asOf}`
      const first = seen.get(key)
      if (first !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "asOf"],
          message: `duplicate (kind, asOf), first stated at item ${first}`,
        })
        continue
      }
      seen.set(key, index)
    }
  })

export type PublishStatementsInput = z.infer<typeof publishStatementsSchema>
export type PublishTrialBalanceInput = z.infer<typeof publishTrialBalanceSchema>
export type PublishSaldokontoInput = z.infer<typeof publishSaldokontoSchema>
export type PublishPayrollInput = z.infer<typeof publishPayrollSchema>
export type FilingsUpsertInput = z.infer<typeof filingsUpsertSchema>
export type LiabilitiesUpsertInput = z.infer<typeof liabilitiesUpsertSchema>
export type AssetsUpsertInput = z.infer<typeof assetsUpsertSchema>
export type ClientTasksUpsertInput = z.infer<typeof clientTasksUpsertSchema>
export type AccountBalanceMapUpsertInput = z.infer<
  typeof accountBalanceMapUpsertSchema
>
export type IndicatorsUpsertInput = z.infer<typeof indicatorsUpsertSchema>
