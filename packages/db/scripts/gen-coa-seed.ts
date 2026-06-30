/**
 * gen-coa-seed.ts — generate the 0025 reference-seed migration.
 *
 * Reads the směrná účtová osnova (KB `coa.json`, Decree 500/2002 Sb. Příloha 1)
 * and emits `packages/db/migrations/0025_accounting_reference_seed.sql`:
 *   - static law seeds: regime, vat_regime, currency, legal_form(+allowed_regime),
 *     accounting_size (§1b), depreciation_group (ZDP §30/§31/§32), business_activity (minimal)
 *   - generated from coa.json: account_group (~57) + directive_account (~218)
 *
 * Seed-time fixes (per spec lines 412-413):
 *   - 710 -> account_group '71' (coa.json files it under group 70; the generated
 *     account.group_code is left(number,2) = '71', so group '71' must exist).
 *   - normal_balance "MD"->DEBIT, "D"->CREDIT, "mixed"/"technical"/"" -> NULL.
 *
 * The statement-line columns on account_group are the load-bearing závěrka mapping
 * (Vyhláška 500/2002 Příloha 1/2), VERIFIED against the current consolidated decree by a
 * research-advisor pass + an adversarial accounting-correctness review. Most rows HIGH
 * confidence; a few need Hleb's final sign-off (Open Decision 5) — see GROUP_META below.
 * KNOWN LIMITATION (group-fallback): groups whose synthetics span several statement lines
 * (33, 41, 42, 47, 52, 55, 60) carry ONE coarse group line — correct for the dominant
 * synthetic, coarse for the rest. directive_account carries NO line (cascade → group), so
 * the závěrka-builder epic can promote per-directive overrides without touching this seed.
 *
 * Vendored-data rule (memory vendored-data-prettier-gitleaks): both this generator
 * AND its committed output are tracked; add .prettierignore + .gitleaks.toml allowlist
 * for the account-number-shaped strings if lefthook trips.
 *
 * Run: pnpm --filter @workspace/db exec tsx scripts/gen-coa-seed.ts
 */
import { readFileSync, writeFileSync } from "node:fs"

const COA =
  "/Users/hleb/Documents/Obsidian Vault/accountingAfframe/20-coa/coa.json"
const OUT =
  "/Users/hleb/Developer/aff-v2-epic1/packages/db/migrations/0025_accounting_reference_seed.sql"

type Nature =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "EXPENSE"
  | "REVENUE"
  | "CLOSING"
  | "OFF_BALANCE"
type GroupMeta = {
  nature: Nature | null // null = sign-split / mixed
  va?: boolean // is_valuation_adjustment (oprávky / opravné položky)
  internal?: boolean // is_internal (off-statement; excluded from the mapping invariant)
  bs?: string // balance_sheet_line
  bsd?: string // balance_sheet_line_when_debit
  bsc?: string // balance_sheet_line_when_credit
  is?: string // income_statement_line
}

// GROUP_META — statement-line mapping, VERIFIED against the CURRENT consolidated
// Vyhláška 500/2002 Sb. Příloha 1 (rozvaha) / Příloha 2 (VZZ druhové) / Příloha 4
// (směrná osnova) by a research-advisor pass (2026-06-30). Most rows HIGH confidence.
// Residual LOW/MEDIUM-confidence rows are noted "[sign-off]" and listed in the seed
// header — they still need Hleb's final sign-off (Open Decision 5) before production.
// Every on-statement group (classes 0-7 except CLOSING/OFF_BALANCE 70/71/75 and the
// internal převodové group 69) carries a group-level fallback line so the schema's
// app_unmapped_account_groups() invariant holds. directive_account carries no line.
const GROUP_META: Record<string, GroupMeta> = {
  // class 0 — long-term assets (rozvaha, ASSET); 07/08/09 = KOREKCE contra (§4/8)
  "01": { nature: "ASSET", bs: "B.I" },
  "02": { nature: "ASSET", bs: "B.II.2" },
  "03": { nature: "ASSET", bs: "B.II.1.1" },
  "04": { nature: "ASSET", bs: "B.II.5.2" },
  "05": { nature: "ASSET", bs: "B.II.5.1" },
  "06": { nature: "ASSET", bs: "B.III" },
  "07": { nature: "ASSET", va: true, bs: "B.I" },
  "08": { nature: "ASSET", va: true, bs: "B.II" },
  "09": { nature: "ASSET", va: true, bs: "B.II" },
  // class 1 — inventories (ASSET); 19 = KOREKCE
  "11": { nature: "ASSET", bs: "C.I.1" },
  "12": { nature: "ASSET", bs: "C.I.2" },
  "13": { nature: "ASSET", bs: "C.I.3.2" },
  "15": { nature: "ASSET", bs: "C.I.5" },
  "19": { nature: "ASSET", va: true, bs: "C.I.1" },
  // class 2 — money + short-term financial (ASSET); 23/24 = short-term LIABILITY; 29 = KOREKCE
  "21": { nature: "ASSET", bs: "C.IV.1" },
  "22": { nature: "ASSET", bs: "C.IV.2" },
  "23": { nature: "LIABILITY", bs: "C.II.2" },
  "24": { nature: "LIABILITY", bs: "C.II.8.2" },
  "25": { nature: "ASSET", bs: "C.III.2" },
  "26": { nature: "ASSET", bs: "C.IV.2" },
  "29": { nature: "ASSET", va: true, bs: "C.III.2" },
  // class 3 — settlements (MIXED); 34/37/38 sign-split; 39 KOREKCE
  "31": { nature: "ASSET", bs: "C.II.2.1" },
  "32": { nature: "LIABILITY", bs: "C.II.4" },
  "33": { nature: "LIABILITY", bs: "C.II.8.3" },
  "34": { nature: null, bsd: "C.II.2.4.3", bsc: "C.II.8.5" },
  "35": { nature: "ASSET", bs: "C.II.2.4.1" }, // advisor-confirmed: Pohledávky za společníky
  "36": { nature: "LIABILITY", bs: "C.II.8.1" }, // advisor-confirmed: Závazky ke společníkům
  "37": { nature: null, bsd: "C.II.2.4.6", bsc: "C.II.8.7" },
  "38": { nature: null, bsd: "D.1", bsc: "C.III.1" },
  "39": { nature: "ASSET", va: true, bs: "C.II.2.1" },
  // class 4 — equity + long-term liabilities; 48 sign-split
  "41": { nature: "EQUITY", bs: "A.I.1" },
  "42": { nature: "EQUITY", bs: "A.III" },
  "43": { nature: "EQUITY", bs: "A.V" },
  "45": { nature: "LIABILITY", bs: "B.4" },
  "46": { nature: "LIABILITY", bs: "C.I.2" },
  "47": { nature: "LIABILITY", bs: "C.I.9.3" }, // [sign-off] 471-479 scatter; group catch-all
  "48": { nature: null, bsd: "C.II.1.4", bsc: "C.I.8" },
  "49": { nature: "EQUITY", bs: "A.I.1" }, // [sign-off] decree has no FO-specific equity row
  // class 5 — expenses (VZZ Příloha 2 druhové, current scheme)
  "50": { nature: "EXPENSE", is: "A.2" },
  "51": { nature: "EXPENSE", is: "A.3" },
  "52": { nature: "EXPENSE", is: "D.1" },
  "53": { nature: "EXPENSE", is: "F.3" },
  "54": { nature: "EXPENSE", is: "F.5" },
  "55": { nature: "EXPENSE", is: "E.1" },
  "56": { nature: "EXPENSE", is: "K" },
  "57": { nature: "EXPENSE", is: "I" }, // financial provisions/impairment 574/579 → VZZ I "Úpravy hodnot a rezervy ve finanční oblasti" (advisor-confirmed, was K)
  "59": { nature: "EXPENSE", is: "L.1" },
  // class 6 — revenues (VZZ); 69 = internal převodové (off-statement)
  "60": { nature: "REVENUE", is: "I" },
  "61": { nature: "REVENUE", is: "B" },
  "62": { nature: "REVENUE", is: "C" },
  "64": { nature: "REVENUE", is: "III.3" },
  "66": { nature: "REVENUE", is: "VII" },
  "69": { nature: "REVENUE", internal: true }, // [sign-off] 697/698 převodové net to zero; not on current Příloha 2
  // class 7 — closing + off-balance (never on a statement)
  "70": { nature: "CLOSING" },
  "71": { nature: "CLOSING" },
  "75": { nature: "OFF_BALANCE" },
}

const GROUP_NAME_OVERRIDE: Record<string, { cs: string; en: string }> = {
  "71": {
    cs: "Závěrkové účty (účet zisků a ztrát)",
    en: "Closing Accounts (P&L)",
  },
  "75": { cs: "Podrozvahové účty", en: "Off-balance-sheet Accounts" },
}

const sqlStr = (v: string | null | undefined) =>
  v === null || v === undefined ? "NULL" : `'${v.replace(/'/g, "''")}'`
const sqlBool = (b: boolean) => (b ? "true" : "false")

function mapNormalBalance(nb: unknown): "DEBIT" | "CREDIT" | null {
  if (nb === "MD") return "DEBIT"
  if (nb === "D") return "CREDIT"
  return null // "mixed" / "technical" / "" -> NULL
}

function directiveNature(code: string, gm: GroupMeta, nb: unknown): Nature {
  if (gm.nature) return gm.nature
  // sign-split / mixed group: best-effort catalogue hint (NOT enforcement — the
  // binding nature is the tenant account.nature set at period-open).
  const cls = Number(code[0])
  if (cls <= 2) return "ASSET"
  if (cls === 3) return nb === "D" ? "LIABILITY" : "ASSET"
  if (cls === 4) return "LIABILITY"
  if (cls === 5) return "EXPENSE"
  if (cls === 6) return "REVENUE"
  return "CLOSING"
}

const coa = JSON.parse(readFileSync(COA, "utf8")) as {
  classes: {
    class_id: string
    groups?: {
      group_id: string
      name_cz: string
      name_en?: string
      accounts?: {
        id: string
        name_cz: string
        name_en?: string
        normal_balance?: string
        deprecated?: boolean
      }[]
    }[]
  }[]
}

// collect accounts (classes 0-7 only; 8-9 are entity-free, not in coa.json)
const accounts: {
  id: string
  name_cz: string
  name_en?: string
  normal_balance?: string
  deprecated?: boolean
}[] = []
const groupName: Record<string, { cs: string; en: string }> = {}
for (const cl of coa.classes) {
  for (const g of cl.groups ?? []) {
    for (const a of g.accounts ?? []) {
      accounts.push(a)
      const prefix = a.id.slice(0, 2)
      if (!groupName[prefix]) {
        groupName[prefix] = GROUP_NAME_OVERRIDE[prefix] ?? {
          cs: g.name_cz,
          en: g.name_en ?? "",
        }
      }
    }
  }
}
// synthetic groups with no accounts in coa.json
for (const code of ["75"])
  if (!groupName[code]) groupName[code] = GROUP_NAME_OVERRIDE[code]

const groupCodes = Object.keys(groupName).sort()

// ── account_group rows ──
const groupRows = groupCodes.map((code) => {
  const gm = GROUP_META[code]
  if (!gm) throw new Error(`No GROUP_META for account_group '${code}'`)
  const n = groupName[code]
  return `  ('${code}', ${Number(code[0])}, ${sqlStr(n.cs)}, ${sqlStr(n.en)}, ${gm.nature ? `'${gm.nature}'` : "NULL"}, ${sqlBool(!!gm.internal)}, ${sqlBool(!!gm.va)}, ${sqlStr(gm.bs)}, ${sqlStr(gm.bsd)}, ${sqlStr(gm.bsc)}, ${sqlStr(gm.is)})`
})

// ── directive_account rows (no statement line: cascade falls back to the group) ──
const directiveRows = accounts
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((a) => {
    const groupCode = a.id.slice(0, 2) // 710 -> '71' (the seed-time fix, automatic)
    const gm = GROUP_META[groupCode]
    if (!gm)
      throw new Error(
        `No GROUP_META for directive '${a.id}' (group ${groupCode})`,
      )
    const nature = directiveNature(a.id, gm, a.normal_balance)
    const nb = mapNormalBalance(a.normal_balance)
    return `  ('${a.id}', '${groupCode}', ${sqlStr(a.name_cz)}, ${sqlStr(a.name_en ?? null)}, '${nature}', ${nb ? `'${nb}'` : "NULL"}, NULL, NULL, NULL, NULL, ${sqlBool(!!a.deprecated)})`
  })

const header = `-- 0025_accounting_reference_seed.sql
--
-- v2 accounting — reference/law seeds (regime · vat_regime · currency · legal_form ·
-- accounting_size · depreciation_group · business_activity · account_group · directive_account).
--
-- GENERATED by packages/db/scripts/gen-coa-seed.ts from the KB směrná účtová osnova
-- (coa.json, Decree 500/2002 Sb.). Reference tables hold the law — no tenant data, no RLS.
-- Idempotent (ON CONFLICT DO NOTHING). Re-generate with the script; do not hand-edit rows.
--
-- account_group statement-line columns (balance_sheet_line / *_when_debit/_credit /
-- income_statement_line): VERIFIED against the CURRENT consolidated Vyhláška 500/2002
-- Sb. Příloha 1 (rozvaha) / Příloha 2 (VZZ druhové) by a research-advisor pass — most
-- rows HIGH confidence. The cascade is complete (app_unmapped_account_groups() = 0 rows).
-- ⚠ HUMAN GATE (Open Decision 5): a few rows still need Hleb's final sign-off — groups
-- 35/36 (maturity/counterparty split), 47 (471-479 scatter; catch-all C.I.9.3), 49
-- (no FO-specific equity row in the decree; A.I.1 substitute), 57 (financial provisions),
-- 69 (697/698 převodové marked is_internal = off-statement). Verified corrections vs the
-- old draft: bank loans 23/24/46 → C.II.2 / C.II.8.2 / C.I.2 (not B.II); trade payables
-- 32 → C.II.4; deferred tax 48 → C.II.1.4 / C.I.8 (not B.II.8); VZZ uses the current
-- Příloha-2 letter scheme (no pre-2016 "Q"). See statement-line-mapping-review.md.
-- ⚠ legal_form / legal_form_allowed_regime and the §1b accounting_size thresholds are
-- a sensible baseline pending law review. business_activity is a MINIMAL NACE set
-- (top-level sections only); the full ~1763-row ČSÚ CZ-NACE bulk is deferred.

BEGIN;

-- regime (§13, §13b ZoÚ; §7b ZDP)
INSERT INTO regime (code, name, requires_chart_of_accounts, book_kind) VALUES
  ('DOUBLE_ENTRY', 'Podvojné účetnictví', true,  'LEDGER'),
  ('SINGLE_ENTRY', 'Jednoduché účetnictví', false, 'MONETARY_JOURNAL'),
  ('TAX_RECORDS',  'Daňová evidence', false, 'MONETARY_JOURNAL')
ON CONFLICT (code) DO NOTHING;

-- vat_regime
INSERT INTO vat_regime (code, name) VALUES
  ('NON_PAYER', 'Neplátce DPH'),
  ('PAYER', 'Plátce DPH'),
  ('IDENTIFIED_PERSON', 'Identifikovaná osoba')
ON CONFLICT (code) DO NOTHING;

-- currency (ISO 4217)
INSERT INTO currency (code, name, minor_units) VALUES
  ('CZK', 'Česká koruna', 2),
  ('EUR', 'Euro', 2),
  ('USD', 'US dollar', 2),
  ('GBP', 'Britská libra', 2),
  ('PLN', 'Polský zlotý', 2)
ON CONFLICT (code) DO NOTHING;

-- legal_form (⚠ baseline pending law review)
INSERT INTO legal_form (code, name, person_type, mandatory_double_entry, audit_possible) VALUES
  ('OSVC',     'Fyzická osoba podnikající (OSVČ)', 'NATURAL', false, false),
  ('SRO',      'Společnost s ručením omezeným (s.r.o.)', 'LEGAL', true,  true),
  ('AS',       'Akciová společnost (a.s.)', 'LEGAL', true,  true),
  ('VOS',      'Veřejná obchodní společnost (v.o.s.)', 'LEGAL', true,  true),
  ('KS',       'Komanditní společnost (k.s.)', 'LEGAL', true,  true),
  ('DRUZSTVO', 'Družstvo', 'LEGAL', true,  true),
  ('SPOLEK',   'Spolek', 'LEGAL', false, true),
  ('NADACE',   'Nadace', 'LEGAL', true,  true),
  ('USTAV',    'Ústav', 'LEGAL', true,  true),
  ('SVJ',      'Společenství vlastníků jednotek', 'LEGAL', false, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO legal_form_allowed_regime (legal_form_code, regime_code) VALUES
  ('OSVC', 'TAX_RECORDS'), ('OSVC', 'DOUBLE_ENTRY'),
  ('SRO', 'DOUBLE_ENTRY'), ('AS', 'DOUBLE_ENTRY'),
  ('VOS', 'DOUBLE_ENTRY'), ('KS', 'DOUBLE_ENTRY'),
  ('DRUZSTVO', 'DOUBLE_ENTRY'), ('NADACE', 'DOUBLE_ENTRY'), ('USTAV', 'DOUBLE_ENTRY'),
  ('SPOLEK', 'SINGLE_ENTRY'), ('SPOLEK', 'DOUBLE_ENTRY'),
  ('SVJ', 'SINGLE_ENTRY'), ('SVJ', 'DOUBLE_ENTRY')
ON CONFLICT (legal_form_code, regime_code) DO NOTHING;

-- accounting_size (§1b ZoÚ; 2-of-3 thresholds in CZK). Asset/turnover limits raised
-- +20% by zákon č. 316/2025 Sb. (effective for účetní období beginning from 2024).
INSERT INTO accounting_size (code, name, max_assets, max_net_turnover, max_average_employees) VALUES
  ('MICRO',  'Mikro účetní jednotka',  11000000,   22000000,    10),
  ('SMALL',  'Malá účetní jednotka',   120000000,  240000000,   50),
  ('MEDIUM', 'Střední účetní jednotka',600000000,  1200000000,  250),
  ('LARGE',  'Velká účetní jednotka',  NULL,       NULL,        NULL)
ON CONFLICT (code) DO NOTHING;

-- depreciation_group (ZDP §30 Příloha 1 + §31 rovnoměrné / §32 zrychlené)
INSERT INTO depreciation_group (code, period_years, linear_rate_first, linear_rate_subsequent, linear_rate_improvement, accel_coeff_first, accel_coeff_subsequent, accel_coeff_improvement, name) VALUES
  (1, 3,  20.0,   40.0,   33.3, 3,  4,  3,  'Odpisová skupina 1 (3 roky)'),
  (2, 5,  11.0,   22.25,  20.0, 5,  6,  5,  'Odpisová skupina 2 (5 let)'),
  (3, 10, 5.5,    10.5,   10.0, 10, 11, 10, 'Odpisová skupina 3 (10 let)'),
  (4, 20, 2.15,   5.15,   5.0,  20, 21, 20, 'Odpisová skupina 4 (20 let)'),
  (5, 30, 1.4,    3.4,    3.4,  30, 31, 30, 'Odpisová skupina 5 (30 let)'),
  (6, 50, 1.02,   2.02,   2.0,  50, 51, 50, 'Odpisová skupina 6 (50 let)')
ON CONFLICT (code) DO NOTHING;

-- business_activity (⚠ MINIMAL: CZ-NACE top-level sections only; full ~1763-row bulk deferred)
INSERT INTO business_activity (code, level, parent_code, name_cs, name_en) VALUES
  ('A', 1, NULL, 'Zemědělství, lesnictví a rybářství', 'Agriculture, forestry and fishing'),
  ('B', 1, NULL, 'Těžba a dobývání', 'Mining and quarrying'),
  ('C', 1, NULL, 'Zpracovatelský průmysl', 'Manufacturing'),
  ('D', 1, NULL, 'Výroba a rozvod elektřiny, plynu, tepla', 'Electricity, gas, steam supply'),
  ('E', 1, NULL, 'Zásobování vodou; činnosti související s odpady', 'Water supply; waste management'),
  ('F', 1, NULL, 'Stavebnictví', 'Construction'),
  ('G', 1, NULL, 'Velkoobchod a maloobchod; opravy motorových vozidel', 'Wholesale and retail trade'),
  ('H', 1, NULL, 'Doprava a skladování', 'Transportation and storage'),
  ('I', 1, NULL, 'Ubytování, stravování a pohostinství', 'Accommodation and food service'),
  ('J', 1, NULL, 'Informační a komunikační činnosti', 'Information and communication'),
  ('K', 1, NULL, 'Peněžnictví a pojišťovnictví', 'Financial and insurance activities'),
  ('L', 1, NULL, 'Činnosti v oblasti nemovitostí', 'Real estate activities'),
  ('M', 1, NULL, 'Profesní, vědecké a technické činnosti', 'Professional, scientific and technical'),
  ('N', 1, NULL, 'Administrativní a podpůrné činnosti', 'Administrative and support service'),
  ('O', 1, NULL, 'Veřejná správa a obrana', 'Public administration and defence'),
  ('P', 1, NULL, 'Vzdělávání', 'Education'),
  ('Q', 1, NULL, 'Zdravotní a sociální péče', 'Human health and social work'),
  ('R', 1, NULL, 'Kulturní, zábavní a rekreační činnosti', 'Arts, entertainment and recreation'),
  ('S', 1, NULL, 'Ostatní činnosti', 'Other service activities'),
  ('T', 1, NULL, 'Činnosti domácností jako zaměstnavatelů', 'Activities of households as employers'),
  ('U', 1, NULL, 'Činnosti exteritoriálních organizací', 'Activities of extraterritorial organisations')
ON CONFLICT (code) DO NOTHING;

-- account_group (Decree 500/2002 Příloha 4 binding skupina; ⚠ statement lines = DRAFT)
INSERT INTO account_group (code, class, name_cs, name_en, nature, is_internal, is_valuation_adjustment, balance_sheet_line, balance_sheet_line_when_debit, balance_sheet_line_when_credit, income_statement_line) VALUES
${groupRows.join(",\n")}
ON CONFLICT (code) DO NOTHING;

-- directive_account (recommendation catalogue from coa.json; statement line via group fallback)
INSERT INTO directive_account (code, group_code, name_cs, name_en, nature, normal_balance, balance_sheet_line, balance_sheet_line_when_debit, balance_sheet_line_when_credit, income_statement_line, deprecated) VALUES
${directiveRows.join(",\n")}
ON CONFLICT (code) DO NOTHING;

COMMIT;
`

writeFileSync(OUT, header)
console.log(`wrote ${OUT}`)
console.log(
  `account_group rows: ${groupRows.length}, directive_account rows: ${directiveRows.length}`,
)
