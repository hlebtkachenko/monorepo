/**
 * The nine CSV contracts this agent reads, and where each one publishes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ASSUMPTIONS THAT HAVE NOT BEEN VALIDATED AGAINST A REAL MONEY S3 EXPORT
 * ═══════════════════════════════════════════════════════════════════════════
 * No real export file existed when this was written (the campaign plan carries
 * it as a HARD INPUT still owed by the office). Everything below was built
 * against the DOCUMENTED contract of the portal's own manual fallback
 * (`apps/beta/lib/import/datasets.ts`) plus `examples/*.csv`, which are
 * self-authored. The parser layer is deliberately thin and swappable — the
 * alias tables and the per-row builders are the ONLY things a real export can
 * invalidate, and each is one literal:
 *
 *   A1. HEADER SPELLINGS. `*_ALIASES` below are guesses for every dataset that
 *       has no counterpart in the portal fallback (filings, liabilities,
 *       assets, client tasks, saldokonto, payroll). Money S3 may print
 *       different words, or no header row at all.
 *   A2. ENUM WORDING. `FILING_KINDS`, `ASSET_CATEGORIES`, `CREDITOR_GROUPS`,
 *       `ASSET_STATUS` map Czech labels onto the portal's enum tokens. A real
 *       export may use codes ("21" for a DPH přiznání) rather than words.
 *   A3. ONE FILE = ONE DATASET. A Money S3 export that puts rozvaha and VZZ in
 *       one file, or a workbook with several sheets, needs a splitting step
 *       that does not exist here.
 *   A4. `externalRef` EXISTS. Every registry upsert is matched on the office's
 *       own row ID. If Money S3 prints no stable identifier, the office must
 *       add one column — the alternative (matching on name + date) would
 *       duplicate a client's whole asset register on a re-run.
 *   A5. PERIOD COLUMN. A registry row may carry `Období` as `2026-07`,
 *       `2026-Q3` or `2026`; otherwise `--period` applies to every row.
 *   A6. DATE + PAID-AT WIDENING. See `dateCell` / `instantCell` in `cells.ts`.
 *
 * The three statement datasets (`predvaha`, `rozvaha`, `vzz`) are the exception
 * to all of the above: their alias tables are copied from the portal's fallback
 * verbatim, so the agent and the drag-and-drop path accept the same files by
 * construction. Keep them in sync — `.github/related-files.yml` says so too.
 */
import type { z } from "zod"

import {
  collector,
  dateCell,
  enumCell,
  instantCell,
  intCell,
  intOptional,
  money,
  moneyReq,
  opt,
  req,
  type Collector,
  type TransformIssue,
} from "./cells"
import { formatPeriod, parsePeriod, type Period } from "./period"
import {
  indexColumns,
  parseBooleanCell,
  readCsv,
  cell,
  type ColumnIndex,
  type CsvRecord,
  type CsvStructuralCode,
} from "./vendor/csv"
import {
  assetsUpsertSchema,
  clientTasksUpsertSchema,
  filingsUpsertSchema,
  liabilitiesUpsertSchema,
  publishStatementsSchema,
  publishTrialBalanceSchema,
} from "./vendor/schemas"

export type DatasetName =
  | "predvaha"
  | "rozvaha"
  | "vzz"
  | "filings"
  | "liabilities"
  | "assets"
  | "client-tasks"
  | "saldokonto"
  | "payroll"

/** Same ceiling as the portal fallback: a mis-picked file, not a policy. */
const MAX_ROWS = 5_000

type BuildContext = {
  /** The `--period` flag, already parsed. Null when the command omitted it. */
  readonly period: Period | null
}

export type Dataset = {
  readonly name: DatasetName
  readonly label: string
  /**
   * Path under `/api/agent/v1/orgs/{orgSlug}/`, or `null` when beta has no
   * endpoint for this dataset yet. A `null` here is NOT a placeholder: there is
   * no route to call and the CLI says so by name (see `pending`). The
   * transformer still runs, so `--dry-run` prints exactly what will be sent the
   * day the endpoint lands.
   */
  readonly path: string | null
  /**
   * Why this dataset can't publish yet — set exactly when `path` is null.
   * Shown verbatim in the CLI's refusal message, so it names a concrete next
   * step rather than a specific campaign PR number: naming one has already
   * gone stale once (this field named "PR 27"/"PR 29" for saldokonto/payroll
   * while those were still unbuilt; both landed under different PR numbers —
   * item 28 and items 30-32 — and their server routes exist today while this
   * CLI still has no wiring for either).
   */
  readonly pending?: string
  /** `batch` requires `--period`; `row` reads it per row; `none` has no period. */
  readonly periodScope: "batch" | "row" | "none"
  /** The server's own zod schema, or null for a dataset with no endpoint yet. */
  readonly schema: z.ZodType | null
  readonly aliases: Readonly<Record<string, readonly string[]>>
  readonly required: readonly string[]
  readonly build: (
    rows: readonly CsvRecord[],
    columns: ColumnIndex,
    issues: Collector,
    ctx: BuildContext,
  ) => { payload: unknown; rowCount: number }
}

// ---------------------------------------------------------------------------
// Column contracts
// ---------------------------------------------------------------------------

/** Copied verbatim from `apps/beta/lib/import/datasets.ts` — do not diverge. */
const PREDVAHA_ALIASES = {
  accountCode: ["ucet", "cislo_uctu", "kod_uctu", "syntetika", "account"],
  accountName: ["nazev", "nazev_uctu", "popis", "name", "text"],
  openingBalance: [
    "pocatecni_stav",
    "pocatecni_zustatek",
    "ps",
    "pocatek",
    "pocatecni",
  ],
  turnoverDebit: ["obrat_md", "obraty_md", "md", "ma_dati", "obrat_ma_dati"],
  turnoverCredit: ["obrat_dal", "obraty_dal", "obrat_d", "dal", "d"],
  closingBalance: [
    "konecny_zustatek",
    "konecny_stav",
    "ks",
    "zustatek",
    "konecny",
  ],
} as const satisfies Record<string, readonly string[]>

/** Copied verbatim from `apps/beta/lib/import/datasets.ts` — do not diverge. */
const STATEMENT_ALIASES = {
  section: ["cast", "strana", "sekce", "vykaz", "section"],
  ozn: ["ozn", "oznaceni", "polozka"],
  rowCode: ["radek", "cislo_radku", "rada", "r", "row"],
  rowLabel: ["text", "nazev", "polozka_text", "popis", "label"],
  brutto: ["brutto"],
  korekce: ["korekce"],
  netto: ["netto"],
  bezne: ["bezne", "bezne_obdobi", "bezne_ucetni_obdobi", "aktualni"],
  minule: ["minule", "minule_obdobi", "minule_ucetni_obdobi", "predchozi"],
  indent: ["uroven", "odsazeni", "indent"],
  bold: ["tucne", "bold", "souhrn"],
} as const satisfies Record<string, readonly string[]>

/** Shared by every registry dataset: the office's own row ID (assumption A4). */
const REF_ALIASES = {
  externalRef: ["id", "ref", "externi_id", "cislo", "klic", "external_ref"],
} as const satisfies Record<string, readonly string[]>

/** Only `filings` carries a period per row; everything else is period-free. */
const PERIOD_ALIASES = {
  period: ["obdobi", "period", "ucetni_obdobi"],
} as const satisfies Record<string, readonly string[]>

const NOTE_ALIASES = {
  noteClient: ["poznamka", "poznamka_klient", "note", "note_client"],
  noteInternal: ["interni_poznamka", "poznamka_interni", "note_internal"],
} as const satisfies Record<string, readonly string[]>

const FILING_ALIASES = {
  ...REF_ALIASES,
  ...PERIOD_ALIASES,
  ...NOTE_ALIASES,
  kind: ["druh", "typ", "kind", "podani"],
  dueOn: ["splatnost", "termin", "due", "due_on"],
  status: ["stav", "status"],
  filedOn: ["podano", "podano_dne", "filed_on"],
  amountDue: ["castka", "k_uhrade", "amount", "amount_due"],
  paidAt: ["zaplaceno", "uhrazeno", "paid_at"],
  variableSymbol: ["vs", "variabilni_symbol", "variable_symbol"],
} as const satisfies Record<string, readonly string[]>

const LIABILITY_ALIASES = {
  ...REF_ALIASES,
  ...NOTE_ALIASES,
  creditorGroup: ["skupina", "veritel", "group"],
  label: ["nazev", "titul", "popis", "label"],
  amount: ["castka", "amount"],
  dueOn: ["splatnost", "termin", "due_on"],
  paidAt: ["zaplaceno", "uhrazeno", "paid_at"],
  variableSymbol: ["vs", "variabilni_symbol", "variable_symbol"],
} as const satisfies Record<string, readonly string[]>

const ASSET_ALIASES = {
  ...REF_ALIASES,
  ...NOTE_ALIASES,
  name: ["nazev", "name", "majetek"],
  category: ["kategorie", "druh", "category"],
  isMinor: ["drobny", "drobny_majetek", "is_minor"],
  acquisitionCost: [
    "poridovaci_cena",
    "porizovaci_cena",
    "cena",
    "acquisition_cost",
  ],
  acquiredOn: ["porizeno", "datum_porizeni", "acquired_on"],
  placedInServiceOn: ["zarazeno", "datum_zarazeni", "placed_in_service_on"],
  accumulatedDepreciation: ["opravky", "accumulated_depreciation"],
  depreciationAsOf: ["opravky_k", "opravky_k_datu", "depreciation_as_of"],
  taxResidualValue: [
    "danova_zustatkova",
    "danova_zustatkova_cena",
    "tax_residual_value",
  ],
  siteRef: ["stavba", "zakazka", "site", "site_ref"],
  status: ["stav", "status"],
  disposedOn: ["vyrazeno", "datum_vyrazeni", "disposed_on"],
} as const satisfies Record<string, readonly string[]>

const TASK_ALIASES = {
  ...REF_ALIASES,
  title: ["nazev", "ukol", "title"],
  description: ["popis", "description"],
  dueDate: ["termin", "splatnost", "do", "due_date"],
  linkKind: ["odkaz", "link", "link_kind"],
  done: ["hotovo", "splneno", "done"],
} as const satisfies Record<string, readonly string[]>

const SALDO_ALIASES = {
  name: ["nazev", "partner", "odberatel_dodavatel", "name"],
  ico: ["ico", "ic"],
  dic: ["dic"],
  receivableTotal: ["pohledavky", "dluzi_nam", "receivable_total"],
  payableTotal: ["zavazky", "dlouzime", "payable_total"],
  oldestDue: ["nejstarsi_splatnost", "oldest_due"],
} as const satisfies Record<string, readonly string[]>

const PAYROLL_ALIASES = {
  grossTotal: ["hruba_mzda", "hrube_mzdy", "gross_total"],
  employerCostTotal: [
    "naklady_zamestnavatele",
    "celkove_naklady",
    "employer_cost_total",
  ],
  employerSocial: ["socialni_zamestnavatel", "employer_social"],
  employerHealth: ["zdravotni_zamestnavatel", "employer_health"],
  employeeWithholdingsTotal: [
    "srazky",
    "srazky_zamestnanec",
    "employee_withholdings_total",
  ],
  incomeTaxAdvance: ["zaloha_na_dan", "income_tax_advance"],
  netPaidTotal: ["ciste_vyplaceno", "cista_mzda", "net_paid_total"],
  paymentDueDate: ["splatnost", "termin_vyplaty", "payment_due_date"],
  headcountHpp: ["pocet_hpp", "hpp", "headcount_hpp"],
  headcountDpc: ["pocet_dpc", "dpc", "headcount_dpc"],
  headcountDpp: ["pocet_dpp", "dpp", "headcount_dpp"],
} as const satisfies Record<string, readonly string[]>

/** The canonical Czech header a missing required column is reported under. */
const CANONICAL_HEADER: Readonly<Record<string, string>> = {
  accountCode: "Účet",
  accountName: "Název",
  section: "Část",
  rowCode: "Řádek",
  rowLabel: "Text",
  externalRef: "ID",
  kind: "Druh",
  dueOn: "Splatnost",
  label: "Název",
  amount: "Částka",
  name: "Název",
  category: "Kategorie",
  acquisitionCost: "Pořizovací cena",
  title: "Název",
  dueDate: "Termín",
  grossTotal: "Hrubé mzdy",
  netPaidTotal: "Čisté vyplaceno",
}

// ---------------------------------------------------------------------------
// Enum tables (assumption A2)
// ---------------------------------------------------------------------------

const SECTION_KINDS = {
  aktiva: "rozvaha_aktiva",
  a: "rozvaha_aktiva",
  rozvaha_aktiva: "rozvaha_aktiva",
  pasiva: "rozvaha_pasiva",
  p: "rozvaha_pasiva",
  rozvaha_pasiva: "rozvaha_pasiva",
} as const

const FILING_KINDS = {
  dph_priznani: "dph_priznani",
  dph: "dph_priznani",
  priznani_dph: "dph_priznani",
  dph_kontrolni_hlaseni: "dph_kontrolni_hlaseni",
  kontrolni_hlaseni: "dph_kontrolni_hlaseni",
  kh: "dph_kontrolni_hlaseni",
  dph_souhrnne_hlaseni: "dph_souhrnne_hlaseni",
  souhrnne_hlaseni: "dph_souhrnne_hlaseni",
  sh: "dph_souhrnne_hlaseni",
  dppo_priznani: "dppo_priznani",
  dppo: "dppo_priznani",
  dppo_zaloha: "dppo_zaloha",
  zaloha_dppo: "dppo_zaloha",
  ucetni_zaverka: "ucetni_zaverka",
  zaverka: "ucetni_zaverka",
  vyuctovani_dane: "vyuctovani_dane",
  vyuctovani: "vyuctovani_dane",
  prehled_cssz: "prehled_cssz",
  cssz: "prehled_cssz",
  prehled_zp: "prehled_zp",
  zp: "prehled_zp",
  jmhz: "jmhz",
  silnicni_dan: "silnicni_dan",
  silnicni: "silnicni_dan",
  ostatni: "ostatni",
} as const

const FILING_STATUS = {
  planned: "planned",
  planovano: "planned",
  filed: "filed",
  podano: "filed",
  confirmed: "confirmed",
  potvrzeno: "confirmed",
  corrective: "corrective",
  opravne: "corrective",
} as const

const CREDITOR_GROUPS = {
  fu: "fu",
  financni_urad: "fu",
  cssz_zp: "cssz_zp",
  cssz: "cssz_zp",
  zp: "cssz_zp",
  ostatni: "ostatni",
} as const

const ASSET_CATEGORIES = {
  machine: "machine",
  stroj: "machine",
  stroje: "machine",
  vehicle: "vehicle",
  vozidlo: "vehicle",
  tool: "tool",
  naradi: "tool",
  real_estate: "real_estate",
  nemovitost: "real_estate",
  other: "other",
  ostatni: "other",
} as const

const ASSET_STATUS = {
  in_use: "in_use",
  v_uzivani: "in_use",
  pouzivany: "in_use",
  disposed: "disposed",
  vyrazeny: "disposed",
  vyrazeno: "disposed",
} as const

const TASK_LINK_KINDS = {
  none: "none",
  zadny: "none",
  dokumenty: "dokumenty",
  dane: "dane",
} as const

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

/** The period for one registry row: its own column, else the `--period` flag. */
function rowPeriod(
  row: CsvRecord,
  columns: ColumnIndex,
  issues: Collector,
  ctx: BuildContext,
): Period | null {
  const raw = opt(row, columns, "period")
  if (raw === null) {
    if (ctx.period === null) {
      issues.add(row.line, columns.matched["period"] ?? null, "invalid_period")
    }
    return ctx.period
  }
  const parsed = parsePeriod(raw)
  if (parsed === null) {
    issues.add(row.line, columns.matched["period"] ?? null, "invalid_period")
  }
  return parsed
}

/**
 * The `items[]` envelope every registry upsert shares.
 *
 * Deduplicates on `externalRef` before the call rather than after: two rows with
 * the same ref race each other on the server's own unique index and come back as
 * a bare `conflict`, which tells the office nothing about which line to fix.
 */
function items<T>(
  rows: readonly CsvRecord[],
  columns: ColumnIndex,
  issues: Collector,
  map: (row: CsvRecord, ref: string) => T | null,
): { payload: unknown; rowCount: number } {
  const built: T[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const ref = req(row, columns, "externalRef", issues)
    if (ref === null) continue
    if (seen.has(ref)) {
      issues.add(
        row.line,
        columns.matched["externalRef"] ?? null,
        "duplicate_row",
      )
      continue
    }
    seen.add(ref)
    const item = map(row, ref)
    if (item !== null) built.push(item)
  }

  return { payload: { items: built }, rowCount: built.length }
}

function buildStatements(dataset: "rozvaha" | "vzz"): Dataset["build"] {
  return (rows, columns, issues, ctx) => {
    const lines: Record<string, unknown>[] = []
    const seen = new Set<string>()

    rows.forEach((row, position) => {
      const rowCode = req(row, columns, "rowCode", issues)
      const rowLabel = req(row, columns, "rowLabel", issues)
      const statementKind =
        dataset === "vzz"
          ? "vzz"
          : enumCell(row, columns, "section", SECTION_KINDS, issues, true)

      const brutto = money(row, columns, "brutto", issues)
      const korekce = money(row, columns, "korekce", issues)
      const netto = money(row, columns, "netto", issues)
      const bezne = money(row, columns, "bezne", issues)
      const minule = money(row, columns, "minule", issues)
      const indent = intCell(
        row,
        columns,
        "indent",
        { min: 0, max: 8 },
        issues,
        0,
      )

      if (rowCode === null || rowLabel === null || statementKind === null)
        return

      // `statement_line_column_shape`, one layer up — a rozvaha row carrying the
      // other side's columns is a mis-shaped file, not a mis-typed number, and
      // the server would answer with a constraint failure the office cannot read.
      const wrongShape =
        statementKind === "rozvaha_aktiva"
          ? bezne !== null
          : statementKind === "rozvaha_pasiva"
            ? brutto !== null || korekce !== null || netto !== null
            : false
      if (wrongShape) {
        issues.add(row.line, null, "column_shape")
        return
      }

      const identity = `${statementKind}:${rowCode}`
      if (seen.has(identity)) {
        issues.add(
          row.line,
          columns.matched["rowCode"] ?? null,
          "duplicate_row",
        )
        return
      }
      seen.add(identity)

      lines.push({
        statementKind,
        ozn: opt(row, columns, "ozn"),
        rowCode,
        rowLabel,
        // The file's own order is the printed order — never derived from the
        // řádek number, which is text and renumbered by every exporter.
        sortOrder: position + 1,
        indent,
        isBold: parseBooleanCell(cell(row, columns, "bold") ?? ""),
        brutto,
        korekce,
        netto,
        bezne,
        minule,
      })
    })

    return {
      payload: { dataset, period: ctx.period, lines },
      rowCount: lines.length,
    }
  }
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const DATASETS: Readonly<Record<DatasetName, Dataset>> = {
  predvaha: {
    name: "predvaha",
    label: "Obratová předvaha",
    path: "publish/trial-balance",
    periodScope: "batch",
    schema: publishTrialBalanceSchema,
    aliases: PREDVAHA_ALIASES,
    required: ["accountCode", "accountName"],
    build: (rows, columns, issues, ctx) => {
      const lines: Record<string, unknown>[] = []
      const seen = new Set<string>()
      for (const row of rows) {
        const accountCode = req(row, columns, "accountCode", issues)
        const accountName = req(row, columns, "accountName", issues)
        const openingBalance = money(row, columns, "openingBalance", issues)
        const turnoverDebit = money(row, columns, "turnoverDebit", issues)
        const turnoverCredit = money(row, columns, "turnoverCredit", issues)
        const closingBalance = money(row, columns, "closingBalance", issues)
        if (accountCode === null || accountName === null) continue
        if (seen.has(accountCode)) {
          issues.add(
            row.line,
            columns.matched["accountCode"] ?? null,
            "duplicate_row",
          )
          continue
        }
        seen.add(accountCode)
        lines.push({
          accountCode,
          accountName,
          openingBalance,
          turnoverDebit,
          turnoverCredit,
          closingBalance,
        })
      }
      return { payload: { period: ctx.period, lines }, rowCount: lines.length }
    },
  },

  rozvaha: {
    name: "rozvaha",
    label: "Rozvaha",
    path: "publish/statements",
    periodScope: "batch",
    schema: publishStatementsSchema,
    aliases: STATEMENT_ALIASES,
    required: ["section", "rowCode", "rowLabel"],
    build: buildStatements("rozvaha"),
  },

  vzz: {
    name: "vzz",
    label: "Výsledovka (VZZ)",
    path: "publish/statements",
    periodScope: "batch",
    schema: publishStatementsSchema,
    aliases: STATEMENT_ALIASES,
    required: ["rowCode", "rowLabel"],
    build: buildStatements("vzz"),
  },

  filings: {
    name: "filings",
    label: "Daňová podání",
    path: "filings",
    periodScope: "row",
    schema: filingsUpsertSchema,
    aliases: FILING_ALIASES,
    required: ["externalRef", "kind", "dueOn"],
    build: (rows, columns, issues, ctx) =>
      items(rows, columns, issues, (row, externalRef) => {
        const kind = enumCell(row, columns, "kind", FILING_KINDS, issues, true)
        const period = rowPeriod(row, columns, issues, ctx)
        const dueOn = dateCell(row, columns, "dueOn", issues, true)
        const status = enumCell(row, columns, "status", FILING_STATUS, issues)
        if (kind === null || period === null || dueOn === null) return null
        return {
          externalRef,
          kind,
          period,
          dueOn,
          ...(status === null ? {} : { status }),
          filedOn: dateCell(row, columns, "filedOn", issues),
          amountDue: money(row, columns, "amountDue", issues),
          paidAt: instantCell(row, columns, "paidAt", issues),
          variableSymbol: opt(row, columns, "variableSymbol"),
          noteClient: opt(row, columns, "noteClient"),
          noteInternal: opt(row, columns, "noteInternal"),
        }
      }),
  },

  liabilities: {
    name: "liabilities",
    label: "Ostatní závazky",
    path: "liabilities",
    periodScope: "none",
    schema: liabilitiesUpsertSchema,
    aliases: LIABILITY_ALIASES,
    required: ["externalRef", "label", "amount", "dueOn"],
    build: (rows, columns, issues) =>
      items(rows, columns, issues, (row, externalRef) => {
        // `dodavatele` is absent from CREDITOR_GROUPS on purpose: that group
        // belongs wholly to the imported saldokonto, and the server refuses it.
        const creditorGroup = enumCell(
          row,
          columns,
          "creditorGroup",
          CREDITOR_GROUPS,
          issues,
        )
        const label = req(row, columns, "label", issues)
        const amount = moneyReq(row, columns, "amount", issues)
        const dueOn = dateCell(row, columns, "dueOn", issues, true)
        if (label === null || amount === null || dueOn === null) return null
        return {
          externalRef,
          ...(creditorGroup === null ? {} : { creditorGroup }),
          label,
          amount,
          dueOn,
          paidAt: instantCell(row, columns, "paidAt", issues),
          variableSymbol: opt(row, columns, "variableSymbol"),
          noteClient: opt(row, columns, "noteClient"),
          noteInternal: opt(row, columns, "noteInternal"),
        }
      }),
  },

  assets: {
    name: "assets",
    label: "Majetek",
    path: "assets",
    periodScope: "none",
    schema: assetsUpsertSchema,
    aliases: ASSET_ALIASES,
    required: ["externalRef", "name", "category", "acquisitionCost"],
    build: (rows, columns, issues) =>
      items(rows, columns, issues, (row, externalRef) => {
        const name = req(row, columns, "name", issues)
        const category = enumCell(
          row,
          columns,
          "category",
          ASSET_CATEGORIES,
          issues,
          true,
        )
        const acquisitionCost = moneyReq(
          row,
          columns,
          "acquisitionCost",
          issues,
        )
        const status = enumCell(row, columns, "status", ASSET_STATUS, issues)
        if (name === null || category === null || acquisitionCost === null)
          return null
        return {
          externalRef,
          name,
          category,
          isMinor: parseBooleanCell(cell(row, columns, "isMinor") ?? ""),
          acquisitionCost,
          acquiredOn: dateCell(row, columns, "acquiredOn", issues),
          placedInServiceOn: dateCell(
            row,
            columns,
            "placedInServiceOn",
            issues,
          ),
          accumulatedDepreciation: money(
            row,
            columns,
            "accumulatedDepreciation",
            issues,
          ),
          depreciationAsOf: dateCell(row, columns, "depreciationAsOf", issues),
          taxResidualValue: money(row, columns, "taxResidualValue", issues),
          siteRef: opt(row, columns, "siteRef"),
          ...(status === null ? {} : { status }),
          disposedOn: dateCell(row, columns, "disposedOn", issues),
          noteClient: opt(row, columns, "noteClient"),
          noteInternal: opt(row, columns, "noteInternal"),
        }
      }),
  },

  "client-tasks": {
    name: "client-tasks",
    label: "Úkoly klientovi",
    path: "client-tasks",
    periodScope: "none",
    schema: clientTasksUpsertSchema,
    aliases: TASK_ALIASES,
    required: ["externalRef", "title", "dueDate"],
    build: (rows, columns, issues) =>
      items(rows, columns, issues, (row, externalRef) => {
        const title = req(row, columns, "title", issues)
        const dueDate = dateCell(row, columns, "dueDate", issues, true)
        const linkKind = enumCell(
          row,
          columns,
          "linkKind",
          TASK_LINK_KINDS,
          issues,
        )
        if (title === null || dueDate === null) return null
        return {
          externalRef,
          title,
          description: opt(row, columns, "description"),
          dueDate,
          ...(linkKind === null ? {} : { linkKind }),
          done: parseBooleanCell(cell(row, columns, "done") ?? ""),
        }
      }),
  },

  saldokonto: {
    name: "saldokonto",
    label: "Saldokonto (pohledávky a závazky)",
    path: null,
    // `/api/agent/v1/orgs/{orgSlug}/publish/saldokonto` is live (item 28) —
    // this CLI's request wiring for it is a separate, not-yet-built follow-up.
    pending:
      "server route live (publish/saldokonto) — CLI wiring not yet built",
    periodScope: "batch",
    schema: null,
    aliases: SALDO_ALIASES,
    required: ["name"],
    build: (rows, columns, issues, ctx) => {
      const partners = rows
        .map((row) => {
          const name = req(row, columns, "name", issues)
          if (name === null) return null
          return {
            name,
            ico: opt(row, columns, "ico"),
            dic: opt(row, columns, "dic"),
            receivableTotal: money(row, columns, "receivableTotal", issues),
            payableTotal: money(row, columns, "payableTotal", issues),
            oldestDue: dateCell(row, columns, "oldestDue", issues),
          }
        })
        .filter((partner) => partner !== null)
      return {
        payload: { period: ctx.period, partners },
        rowCount: partners.length,
      }
    },
  },

  payroll: {
    name: "payroll",
    label: "Mzdová rekapitulace",
    path: null,
    // `/api/agent/v1/orgs/{orgSlug}/publish/payroll` is live (items 30-32) —
    // this CLI's request wiring for it is a separate, not-yet-built follow-up.
    pending: "server route live (publish/payroll) — CLI wiring not yet built",
    periodScope: "batch",
    schema: null,
    aliases: PAYROLL_ALIASES,
    // Two required columns rather than none: without them a wrong file would
    // pass the column check and produce a recap of nulls, which reads as "the
    // office published an empty month" instead of "this is the wrong export".
    required: ["grossTotal", "netPaidTotal"],
    build: (rows, columns, issues, ctx) => {
      // ONE ROW, not a table: the recap is a single set of totals for the
      // period. Extra rows are not summed — this program never computes an
      // accounting number — they are refused as a mis-picked file.
      const row = rows[0]
      if (row === undefined || rows.length > 1) {
        issues.add(rows[1]?.line ?? 1, null, "ragged_row")
        return { payload: { period: ctx.period, summary: null }, rowCount: 0 }
      }
      const count = { min: 0, max: 999 }
      return {
        payload: {
          period: ctx.period,
          summary: {
            grossTotal: money(row, columns, "grossTotal", issues),
            employerCostTotal: money(row, columns, "employerCostTotal", issues),
            employerSocial: money(row, columns, "employerSocial", issues),
            employerHealth: money(row, columns, "employerHealth", issues),
            employeeWithholdingsTotal: money(
              row,
              columns,
              "employeeWithholdingsTotal",
              issues,
            ),
            incomeTaxAdvance: money(row, columns, "incomeTaxAdvance", issues),
            netPaidTotal: money(row, columns, "netPaidTotal", issues),
            paymentDueDate: dateCell(row, columns, "paymentDueDate", issues),
            headcountHpp: intOptional(
              row,
              columns,
              "headcountHpp",
              count,
              issues,
            ),
            headcountDpc: intOptional(
              row,
              columns,
              "headcountDpc",
              count,
              issues,
            ),
            headcountDpp: intOptional(
              row,
              columns,
              "headcountDpp",
              count,
              issues,
            ),
          },
        },
        rowCount: 1,
      }
    },
  },
}

export const DATASET_NAMES = Object.keys(DATASETS) as DatasetName[]

export function isDatasetName(value: string): value is DatasetName {
  return DATASET_NAMES.includes(value as DatasetName)
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/** A field the SERVER's own schema refused, named by its path in the payload. */
type SchemaIssue = { readonly path: string; readonly code: string }

export type TransformFailure = {
  readonly ok: false
  readonly structural:
    CsvStructuralCode | "too_many_rows" | "missing_period" | null
  readonly missingColumns: readonly string[]
  readonly issues: readonly TransformIssue[]
  readonly schemaIssues: readonly SchemaIssue[]
}

export type TransformResult =
  | {
      readonly ok: true
      readonly payload: unknown
      readonly rowCount: number
      /** field → the header text as the file spells it. Printed by `--dry-run`. */
      readonly columns: Readonly<Record<string, string>>
    }
  | TransformFailure

function fail(partial: Partial<TransformFailure>): TransformFailure {
  return {
    ok: false,
    structural: null,
    missingColumns: [],
    issues: [],
    schemaIssues: [],
    ...partial,
  }
}

/**
 * A CSV file → the exact JSON body the ingestion API takes.
 *
 * The order of refusals mirrors the portal's fallback: structure, then required
 * columns, then size, then row content — each answers a different question the
 * office would otherwise reconstruct from a wall of row errors ("this is a comma
 * file", "this is the saldokonto export, not the předvaha", "this is a year").
 *
 * The last gate is the SERVER'S OWN SCHEMA, run here before anything is sent:
 * a payload that would come back as a 400 is refused locally, with the field
 * paths named, while the operator still has the file open.
 */
export function transform(
  dataset: Dataset,
  text: string,
  ctx: BuildContext,
): TransformResult {
  if (dataset.periodScope === "batch" && ctx.period === null) {
    return fail({ structural: "missing_period" })
  }

  const read = readCsv(text)
  if (!read.ok) return fail({ structural: read.code })

  const { document } = read
  const columns = indexColumns(document.header, dataset.aliases)

  const missingColumns = dataset.required
    .filter((field) => !columns.index.has(field))
    .map((field) => CANONICAL_HEADER[field] ?? field)
  if (missingColumns.length > 0) return fail({ missingColumns })

  if (document.rows.length > MAX_ROWS)
    return fail({ structural: "too_many_rows" })

  const issues = collector()
  const headerWidth = document.header.values.length
  for (const row of document.rows) {
    // More cells than headers means an unquoted delimiter inside a field and
    // every column after it is shifted — a silently wrong import.
    if (row.values.length > headerWidth)
      issues.add(row.line, null, "ragged_row")
  }

  const built = dataset.build(document.rows, columns, issues, ctx)

  if (issues.issues.length > 0) return fail({ issues: issues.issues })

  if (dataset.schema) {
    const parsed = dataset.schema.safeParse(built.payload)
    if (!parsed.success) {
      return fail({
        schemaIssues: parsed.error.issues.slice(0, 20).map((issue) => ({
          path: issue.path.join(".") || "(kořen)",
          code: issue.code,
        })),
      })
    }
  }

  return {
    ok: true,
    payload: built.payload,
    rowCount: built.rowCount,
    columns: columns.matched,
  }
}

/**
 * The dataset + period pair, as one operator-readable label.
 *
 * The period is shown ONLY for a batch dataset. A registry row carries its own
 * period, so stamping the `--period` flag on the summary line would misreport a
 * filings file whose rows deliberately span several — and a summary line that
 * names the wrong period is exactly the confidently-wrong report §0.4 is about.
 */
export function describeTarget(
  dataset: Dataset,
  period: Period | null,
): string {
  return dataset.periodScope !== "batch" || period === null
    ? dataset.label
    : `${dataset.label} — ${formatPeriod(period)}`
}
