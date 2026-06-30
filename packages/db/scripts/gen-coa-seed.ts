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
 * The statement-line columns are the load-bearing závěrka mapping (Vyhláška 500/2002
 * Příloha 1/2), VERIFIED against the current consolidated decree by a research-advisor pass
 * + an adversarial accounting-correctness review. The mapping is now PRECISE at BOTH levels:
 *   - account_group (GROUP_META) — the legally-guaranteed group fallback (cascade level 2);
 *     every on-statement skupina carries a line so app_unmapped_account_groups() = 0.
 *   - directive_account (DIRECTIVE_LINES) — per-synthetic OVERRIDE (cascade level 1) for
 *     every synthetic whose correct rozvaha/VZZ row DIFFERS from its group fallback. This
 *     replaces the old group-fallback coarseness for multi-line groups (01-06, 31-38, 41,
 *     42, 45, 47, 50, 52, 54, 55, 56, 59, 60, 64, 66 + the 07x/08x/09x KOREKCE oprávky).
 *     A synthetic NOT in DIRECTIVE_LINES stays NULL and inherits the group line.
 * Sign-split groups (34 Stát-daňové, 37 pevné operace, 48 odložená daň) keep using the
 * group's bsd/bsc pair; their directives are intentionally NOT overridden. Most rows HIGH
 * confidence; the residual low-confidence rows are flagged // [sign-off] in DIRECTIVE_LINES /
 * GROUP_META and listed in the seed header (Open Decision 5 — Hleb's final sign-off).
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

// DIRECTIVE_LINES — per-synthetic statement-line OVERRIDE (decision 3, cascade level 1).
// VERIFIED against the CURRENT consolidated Vyhláška 500/2002 Sb. Příloha 1 (rozvaha)
// and Příloha 2 (VZZ druhové) as reproduced verbatim in the official MFČR/Finanční-správa
// "Rozvaha v plném rozsahu" and "Výkaz zisku a ztráty - druhové členění" forms
// (research-advisor pass 2026-06-30). A directive listed here EMITS its own line; a
// directive NOT listed stays NULL and falls back to its account_group line (still complete,
// app_unmapped_account_groups() = 0). Only synthetics whose correct row DIFFERS from their
// group fallback appear here — coarse single-line groups keep relying on the group.
//   bs  = balance_sheet_line (single-side / fixed-sign account)
//   bsd/bsc = sign-split pair (account flips asset<->liability by closing balance sign)
//   is  = income_statement_line (VZZ druhové letter/number)
// Sign-split groups 34 (Stát-daňové) and 48 (odložená daň) and 37 (pevné operace) inherit
// the group's bsd/bsc pair unchanged, so their directives are intentionally absent here.
// KOREKCE oprávky (07x/08x) carry the rozvaha line of the GROSS asset row they net in the
// Korekce column; opravné položky (09x) that net a single gross row do likewise.
// Rows whose decree row is genuinely ambiguous are flagged with an inline // [sign-off].
const DIRECTIVE_LINES: Record<
  string,
  { bs?: string; bsd?: string; bsc?: string; is?: string }
> = {
  // ── class 0: long-term assets — group lines are coarse; map each synthetic to its leaf row ──
  // 01 DNM (group B.I): 012 vývoj, 013/014 ocenitelná práva (Software / Ostatní), 015 goodwill, 011/019 ostatní
  "011": { bs: "B.I.4" }, // [sign-off] Zřizovací výdaje retired post-2016; no B.I.1 row -> Ostatní DNM
  "012": { bs: "B.I.1" }, // Nehmotné výsledky vývoje
  "013": { bs: "B.I.2.1" }, // Software
  "014": { bs: "B.I.2.2" }, // Ostatní ocenitelná práva
  "015": { bs: "B.I.3" }, // Goodwill
  "019": { bs: "B.I.4" }, // Ostatní DNM
  // 02 DHM odpisovaný (group B.II.2): 021 stavby, 022 movité, 025/026/029 ostatní DHM leaves
  "021": { bs: "B.II.1.2" }, // Stavby
  "022": { bs: "B.II.2" }, // Hmotné movité věci a jejich soubory
  "025": { bs: "B.II.4.1" }, // Pěstitelské celky trvalých porostů
  "026": { bs: "B.II.4.2" }, // Dospělá zvířata a jejich skupiny
  "029": { bs: "B.II.4.3" }, // Jiný dlouhodobý hmotný majetek
  // 03 DHM neodpisovaný (group B.II.1.1 = Pozemky): 031 == group; 032 art -> Jiný DHM
  "032": { bs: "B.II.4.3" }, // [sign-off] Umělecká díla a sbírky -> Jiný DHM (no dedicated art row)
  // 04 Pořízení DM (group B.II.5.2 = Nedokončený DHM): 041 nedok. DNM, 042 == group, 043 fin
  "041": { bs: "B.I.5.2" }, // Nedokončený dlouhodobý nehmotný majetek
  "043": { bs: "B.III.7.1" }, // [sign-off] Pořízení DFM -> Jiný DFM (no "pořizovaný DFM" leaf in current form)
  // 05 Zálohy na DM (group B.II.5.1 = Zálohy na DHM): 051 zálohy DNM, 052 == group, 053 zálohy DFM
  "051": { bs: "B.I.5.1" }, // Poskytnuté zálohy na DNM
  "053": { bs: "B.III.7.2" }, // Poskytnuté zálohy na DFM
  // 06 DFM (group B.III): map each podíl/zápůjčka/CP to its B.III leaf
  "061": { bs: "B.III.1" }, // Podíly – ovládaná nebo ovládající osoba
  "062": { bs: "B.III.3" }, // Podíly – podstatný vliv
  "063": { bs: "B.III.5" }, // Ostatní dlouhodobé cenné papíry a podíly
  "065": { bs: "B.III.5" }, // Dluhové CP do splatnosti -> Ostatní dlouhodobé CP a podíly
  "066": { bs: "B.III.2" }, // Zápůjčky a úvěry – ovládaná nebo ovládající osoba
  "067": { bs: "B.III.4" }, // Zápůjčky a úvěry – podstatný vliv
  "069": { bs: "B.III.7.1" }, // Jiný dlouhodobý finanční majetek
  // ── KOREKCE: oprávky 07x/08x land in the Korekce column of the GROSS asset row they amortize ──
  "071": { bs: "B.I.4" }, // [sign-off] oprávky k zřiz. výdajům -> Ostatní DNM (gross 011)
  "072": { bs: "B.I.1" }, // oprávky k nehm. výsledkům vývoje (gross 012)
  "073": { bs: "B.I.2.1" }, // oprávky k softwaru (gross 013)
  "074": { bs: "B.I.2.2" }, // oprávky k ocenitelným právům (gross 014)
  "075": { bs: "B.I.3" }, // oprávky ke goodwillu (gross 015)
  "079": { bs: "B.I.4" }, // oprávky k jinému DNM (gross 019)
  "081": { bs: "B.II.1.2" }, // oprávky ke stavbám (gross 021)
  "082": { bs: "B.II.2" }, // oprávky k movitým věcem (gross 022)
  "085": { bs: "B.II.4.1" }, // oprávky k pěstitelským celkům (gross 025)
  "086": { bs: "B.II.4.2" }, // oprávky k dospělým zvířatům (gross 026)
  "089": { bs: "B.II.4.3" }, // oprávky k jinému DHM (gross 029)
  // 09x opravné položky to LT assets: only the single-row targets are precise; whole-category
  // OP (091 DNM / 092 DHM) stay at the group fallback (07/08 group line) — they span many rows.
  "093": { bs: "B.I.5.2" }, // OP k nedokončenému DNM (gross 041)
  "094": { bs: "B.II.5.2" }, // OP k nedokončenému DHM (gross 042)
  "095": { bs: "B.II.5.1" }, // [sign-off] OP k poskytnutým zálohám -> zálohy na DHM (gross 05x; DHM-side)
  "096": { bs: "B.III.7.1" }, // OP k finančnímu majetku -> Jiný DFM (gross 06x)
  // ── class 1: inventory leaves (group lines already mostly precise; only split rows differ) ──
  // 11 (group C.I.1 Materiál): 111/112/119 all material -> == group; no overrides
  // 12 (group C.I.2 NV+polotovary): 121/122 == group; 123 výrobky -> C.I.3.1, 124 zvířata -> C.I.4
  "123": { bs: "C.I.3.1" }, // Výrobky
  "124": { bs: "C.I.4" }, // Mladá a ostatní zvířata a jejich skupiny
  // 13 (group C.I.3.2 Zboží): 131/132/139 == group; no overrides
  // ── class 2: 25 short-term securities (group C.III.2 Ostatní KFM): 251/253 -> C.III.1? no — held-for-trading podíly
  // The current form C.III split is only ovládaná(1)/ostatní(2); all 25x are "ostatní" -> == group C.III.2.
  // ── class 3 settlements ──
  // 31 Pohledávky (group C.II.2.1 obchodní): 311 == group; rest -> ostatní leaves
  "312": { bs: "C.II.2.4.6" }, // Směnky k inkasu -> Jiné pohledávky
  "313": { bs: "C.II.2.4.6" }, // Pohledávky za eskontované CP -> Jiné pohledávky
  "314": { bs: "C.II.2.4.4" }, // Poskytnuté zálohy -> Krátkodobé poskytnuté zálohy
  "315": { bs: "C.II.2.4.6" }, // Ostatní pohledávky -> Jiné pohledávky
  // 32 Závazky (group C.II.4 obchodní): 321 == group; rest -> krátkodobé leaves
  "322": { bs: "C.II.5" }, // Směnky k úhradě -> Krátkodobé směnky k úhradě
  "324": { bs: "C.II.3" }, // Přijaté zálohy -> Krátkodobé přijaté zálohy
  "325": { bs: "C.II.8.7" }, // Ostatní závazky -> Jiné závazky
  // 33 Zúčtování se zaměstnanci (group C.II.8.3): 331/333 == group; 335 receivable; 336 SP+ZP
  "335": { bs: "C.II.2.4.6" }, // Pohledávky za zaměstnanci -> Jiné pohledávky (krátkodobé, debit)
  "336": { bs: "C.II.8.4" }, // Zúčtování SP a ZP -> Závazky ze SP a ZP
  // 34 (group sign-split Stát-daňové bsd C.II.2.4.3 / bsc C.II.8.5): all 34x inherit the pair -> no overrides
  // 35 Pohledávky za společníky (group C.II.2.4.1): 351 ovládaná has its own row
  "351": { bs: "C.II.2.2" }, // Pohledávky – ovládaná nebo ovládající osoba (krátkodobé)
  // 36 Závazky ke společníkům (group C.II.8.1): 361 ovládaná has its own row
  "361": { bs: "C.II.6" }, // Závazky – ovládaná nebo ovládající osoba (krátkodobé)
  // 37 (group sign-split Jiné bsd C.II.2.4.6 / bsc C.II.8.7): 373/378/379 inherit -> no overrides
  // 38 Přechodné účty (group sign-split bsd D.1 / bsc C.III.1): dohadné účty are NOT časové rozlišení
  "382": { bs: "D.2" }, // Komplexní náklady příštích období (čas. rozlišení aktiv)
  "385": { bs: "D.3" }, // Příjmy příštích období (čas. rozlišení aktiv)
  "388": { bs: "C.II.2.4.5" }, // Dohadné účty aktivní -> krátkodobé pohledávky ostatní
  "389": { bs: "C.II.8.6" }, // Dohadné účty pasivní -> krátkodobé závazky ostatní
  // 39 (group C.II.2.1, is_valuation_adjustment): 391 OP k pohledávkám nets receivables;
  // 395/398 vnitřní zúčtování/sdružení net to zero -> leave at group fallback. No overrides.
  // ── class 4: equity + LT liabilities ──
  // 41 Základní kapitál a kap. fondy (group A.I.1): 411 == group; rest -> A.I / A.II leaves
  "412": { bs: "A.II.1" }, // Emisní ážio -> Ážio
  "413": { bs: "A.II.2.1" }, // Ostatní kapitálové fondy
  "414": { bs: "A.II.2.2" }, // Oceňovací rozdíly z přecenění majetku a závazků
  "418": { bs: "A.II.2.3" }, // Oceňovací rozdíly z přecenění při přeměnách obch. korporací
  "419": { bs: "A.I.3" }, // Změny základního kapitálu
  // 42 Fondy ze zisku a převedené výsledky (group A.III header): map to A.III leaves + A.IV
  "421": { bs: "A.III.1" }, // Rezervní fond -> Ostatní rezervní fondy
  "422": { bs: "A.III.1" }, // Nedělitelný fond -> Ostatní rezervní fondy
  "423": { bs: "A.III.2" }, // Statutární fondy
  "427": { bs: "A.III.2" }, // Ostatní fondy
  "428": { bs: "A.IV.1" }, // Nerozdělený zisk minulých let
  "429": { bs: "A.IV.1" }, // Neuhrazená ztráta minulých let (same combined A.IV.1 line, debit)
  // 45 Rezervy (group B.4 Ostatní rezervy): 451 zvláštní předpisy, 453 daň z příjmů
  "451": { bs: "B.3" }, // Zákonné rezervy -> Rezervy podle zvláštních právních předpisů
  "453": { bs: "B.2" }, // Rezerva na daň z příjmů
  // 46 (group C.I.2): 461 == group; no override
  // 47 Dlouhodobé závazky (group C.I.9.3 catch-all): map named LT-liability leaves
  "471": { bs: "C.I.6" }, // Závazky k ovládaným osobám (dlouhodobé)
  "473": { bs: "C.I.1" }, // Emitované dluhopisy -> Vydané dluhopisy
  "475": { bs: "C.I.3" }, // Dlouhodobé přijaté zálohy
  // 474 leasing / 479 ostatní stay at group C.I.9.3 (no named row) — group fallback. [sign-off on group]
  // 48 (group sign-split odložená daň bsd C.II.1.4 / bsc C.I.8): 481 inherits -> no override
  // 49 (group A.I.1 [sign-off]): 491 FO capital -> no decree row, stays at group fallback
  // ── class 5: expenses (VZZ druhové) ──
  // 50 (group A.2 Spotřeba materiálu a energie): 504 prodané zboží -> A.1
  "504": { is: "A.1" }, // Prodané zboží -> Náklady vynaložené na prodané zboží
  // 51 (group A.3 Služby): all 51x == group; no overrides
  // 52 Osobní náklady (group D.1 Mzdové): 524/525 SP+ZP -> D.2.1; 526/527/528 ostatní -> D.2.2
  "524": { is: "D.2.1" }, // Zákonné sociální pojištění (zaměstnavatel)
  "525": { is: "D.2.1" }, // Ostatní sociální pojištění
  "526": { is: "D.2.2" }, // Sociální náklady individ. podnikatele -> Ostatní náklady
  "527": { is: "D.2.2" }, // Zákonné sociální náklady -> Ostatní náklady
  "528": { is: "D.2.2" }, // Ostatní sociální náklady -> Ostatní náklady
  // 53 (group F.3 Daně a poplatky): all 53x == group; no overrides
  // 54 Jiné provozní náklady (group F.5): 541 ZC majetku -> F.1, 542 prodaný materiál -> F.2
  "541": { is: "F.1" }, // ZC prodaného DM -> Zůstatková cena prodaného dlouhodobého majetku
  "542": { is: "F.2" }, // Prodaný materiál
  // 543/544/545/546/548/549 stay F.5 (Jiné provozní náklady)
  // 55 Odpisy/rezervy/OP (group E.1 header): 551 odpisy -> E.1.1; 552/554 rezervy -> F.4; 558/559 OP -> E.3
  "551": { is: "E.1.1" }, // Odpisy DNM a DHM -> Úpravy hodnot DNM a DHM - trvalé
  "552": { is: "F.4" }, // Tvorba zákonných rezerv -> Rezervy v provozní oblasti a komplexní NPO
  "554": { is: "F.4" }, // Tvorba ostatních rezerv -> Rezervy v provozní oblasti
  "558": { is: "E.3" }, // Tvorba zákonných opravných položek -> Úpravy hodnot pohledávek
  "559": { is: "E.3" }, // [sign-off] Tvorba ostatních OP -> Úpravy hodnot pohledávek (assumes receivable OP; inventory OP would be E.2)
  // 56 Finanční náklady (group K Ostatní finanční náklady): 561 prodané podíly -> G; 562 úroky -> J
  "561": { is: "G" }, // Prodané CP a podíly -> Náklady vynaložené na prodané podíly
  "562": { is: "J" }, // Úroky -> Nákladové úroky a podobné náklady
  // 563/564/566/567/568/569 stay K (Ostatní finanční náklady)
  // 57 (group I Úpravy hodnot a rezervy ve finanční oblasti): 574/579 == group; no overrides
  // 59 Daně z příjmů + převodové (group L.1 splatná): 592 odložená -> L.2; 596 převod podílu -> M
  "592": { is: "L.2" }, // Daň z příjmů odložená
  "596": { is: "M" }, // Převod podílu na VH společníkům -> Převod podílu na výsledku hospodaření
  // 595 dodatečné odvody stay L.1; 597/598 převodové (internal, net to zero) stay at group L.1 fallback [sign-off]
  // ── class 6: revenues (VZZ druhové) ──
  // 60 Tržby (group I Tržby z prodeje výrobků a služeb): 604 zboží -> II
  "604": { is: "II" }, // Tržby za prodané zboží -> Tržby za prodej zboží
  // 61 (group B Změna stavu zásob) / 62 (group C Aktivace): all == group; no overrides
  // 64 Jiné provozní výnosy (group III.3): 641 prodej DM -> III.1, 642 prodej materiálu -> III.2
  "641": { is: "III.1" }, // Tržby z prodeje DHM -> Tržby z prodaného dlouhodobého majetku
  "642": { is: "III.2" }, // Tržby z prodeje materiálu -> Tržby z prodaného materiálu
  // 644/646/648 stay III.3 (Jiné provozní výnosy)
  // 66 Finanční výnosy (group VII Ostatní finanční výnosy): 662 úroky -> VI; 665 dividendy -> IV.2
  "662": { is: "VI" }, // Úroky -> Výnosové úroky a podobné výnosy
  "665": { is: "IV.2" }, // Výnosy z DFM (dividendy) -> Ostatní výnosy z podílů
  // 661/663/664/666/667/668 stay VII (Ostatní finanční výnosy)
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

// ── directive_account rows ──
// Statement line: cascade level 1. A synthetic listed in DIRECTIVE_LINES emits its own
// override (bs / bsd+bsc / is); otherwise all four columns stay NULL and the rozvaha/VZZ
// builder falls back to the account_group line (cascade level 2). Sign-split directives
// keep the bsd/bsc pair; everything else uses bs or is.
let directiveOverrideCount = 0
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
    const dl = DIRECTIVE_LINES[a.id]
    if (dl) directiveOverrideCount++
    return `  ('${a.id}', '${groupCode}', ${sqlStr(a.name_cz)}, ${sqlStr(a.name_en ?? null)}, '${nature}', ${nb ? `'${nb}'` : "NULL"}, ${sqlStr(dl?.bs)}, ${sqlStr(dl?.bsd)}, ${sqlStr(dl?.bsc)}, ${sqlStr(dl?.is)}, ${sqlBool(!!a.deprecated)})`
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
-- Statement-line columns (balance_sheet_line / *_when_debit/_credit / income_statement_line):
-- VERIFIED against the CURRENT consolidated Vyhláška 500/2002 Sb. Příloha 1 (rozvaha) /
-- Příloha 2 (VZZ druhové) by a research-advisor pass — most rows HIGH confidence. The mapping
-- is PRECISE at BOTH levels:
--   • account_group = the legally-guaranteed group fallback (cascade level 2). Complete:
--     app_unmapped_account_groups() returns 0 rows.
--   • directive_account = per-synthetic OVERRIDE (cascade level 1). A directive carries its
--     own rozvaha/VZZ row only where it DIFFERS from the group fallback; else NULL → group.
--     Promoted for multi-line groups (01-06 long-term assets, 07x/08x/09x KOREKCE oprávky,
--     31/32/35/36/38 settlements, 41/42/45/47 equity+LT-liab, 50/52/54/55/56/59 expenses,
--     60/64/66 revenues). Sign-split groups 34/37/48 inherit the group bsd/bsc pair (no
--     directive override). KOREKCE oprávky land in the Korekce column of their gross row.
-- ⚠ HUMAN GATE (Open Decision 5): rows still needing Hleb's final sign-off (// [sign-off]):
--   GROUP level — 47 (471-479 scatter; 474 leasing/479 ostatní stay C.I.9.3), 49 (no
--     FO-specific equity row; A.I.1 substitute), 57 (financial provisions), 69 (697/698
--     převodové marked is_internal = off-statement).
--   DIRECTIVE level — 011/071 (Zřizovací výdaje retired post-2016 → Ostatní DNM B.I.4),
--     032 (umělecká díla → Jiný DHM B.II.4.3), 043 (Pořízení DFM → Jiný DFM B.III.7.1),
--     095 (OP k zálohám → DHM-side B.II.5.1), 559 (ostatní OP → E.3 assumes receivable; if
--     inventory it is E.2), 597/598 (převodové net to zero → stay group L.1 fallback).
-- Verified corrections vs the old draft: bank loans 23/24/46 → C.II.2 / C.II.8.2 / C.I.2
-- (not B.II); trade payables 32 → C.II.4; deferred tax 48 → C.II.1.4 / C.I.8 (not B.II.8);
-- VZZ uses the current Příloha-2 letter scheme (no pre-2016 "Q").
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

-- directive_account (recommendation catalogue from coa.json; statement line = per-synthetic
-- override where it differs from the group, else NULL → group fallback. See DIRECTIVE_LINES.)
INSERT INTO directive_account (code, group_code, name_cs, name_en, nature, normal_balance, balance_sheet_line, balance_sheet_line_when_debit, balance_sheet_line_when_credit, income_statement_line, deprecated) VALUES
${directiveRows.join(",\n")}
ON CONFLICT (code) DO NOTHING;

COMMIT;
`

writeFileSync(OUT, header)
console.log(`wrote ${OUT}`)
console.log(
  `account_group rows: ${groupRows.length}, directive_account rows: ${directiveRows.length}, directive statement-line overrides: ${directiveOverrideCount}`,
)
