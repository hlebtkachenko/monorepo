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

/** `YYYY-MM-DD`, the shape a `date` column stores. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")

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

export type PublishStatementsInput = z.infer<typeof publishStatementsSchema>
export type PublishTrialBalanceInput = z.infer<typeof publishTrialBalanceSchema>
export type FilingsUpsertInput = z.infer<typeof filingsUpsertSchema>
export type LiabilitiesUpsertInput = z.infer<typeof liabilitiesUpsertSchema>
export type AssetsUpsertInput = z.infer<typeof assetsUpsertSchema>
export type ClientTasksUpsertInput = z.infer<typeof clientTasksUpsertSchema>
