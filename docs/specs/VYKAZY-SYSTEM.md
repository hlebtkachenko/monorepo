# Výkazy + DPPO: how the system works

Agent-facing map of the `/vykazy` statement builder and the DPPO (DPPDP9) export.
Covers the routes, the data flow, every file format the system reads or writes,
the invariants that must hold, and the known gaps. For what each individual
řádek contains and which účty feed it, read the generated
[`VYKAZY-AND-DPPO-REFERENCE.md`](VYKAZY-AND-DPPO-REFERENCE.md) instead.

## What it is

A single-user, client-side builder for the Czech statutory účetní závěrka of a
podnikatel účtující v soustavě podvojného účetnictví, plus the corporate income
tax return derived from the same book, plus the three statutory DPH filings. No
database, no server state: everything lives in browser storage and is exported as
files. The only server calls are the ARES lookup and the DPPO XML build — the DPH
module builds and validates entirely client-side (see below).

## Routes

| Route                  | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `/vykazy`              | landing, identification block, toolbar, import/export |
| `/vykazy/rozvaha`      | Rozvaha, aktiva + pasiva tables                       |
| `/vykazy/vzz`          | Výkaz zisku a ztráty, druhové členění                 |
| `/vykazy/predvaha`     | obratová předvaha built from the deník                |
| `/vykazy/denik`        | imported účetní deník, screen + print                 |
| `/vykazy/rozvrh`       | účtový rozvrh editor                                  |
| `/vykazy/dppo`         | DPPO form and XML generator                           |
| `/vykazy/dph`          | DPH landing — the three VAT filings                   |
| `/vykazy/dph/priznani` | Přiznání k DPH (DPHDP3) + XML generator               |
| `/vykazy/dph/kh`       | Kontrolní hlášení (DPHKH1) + XML generator            |
| `/vykazy/dph/sh`       | Souhrnné hlášení VIES (DPHSHV) + XML generator        |

## Data flow

```
účetní deník (XLSX/CSV)
  → parseDenikXlsx / parseDenikCsv        _lib/denik.ts
  → buildPredvaha                          _lib/predvaha.ts     (per-účet MD/Dal turnover + KS)
  → mapPredvahaToValues                    _lib/mapping.ts      (účet → statement leaf + column)
  → VykazValues (leaves only)              _lib/types.ts
  → computeAll                             _lib/engine.ts       (formulas → calc rows)
  → VykazTable / print pages               _components/vykaz-table.tsx
```

DPPO branches off the same `Predvaha`:

```
Predvaha
  → deriveUcetniVysledek / deriveCistyObrat   dppo/_lib/dppo-bridge.ts
  → DppoFormState (user edits + overrides)
  → toFigures / toPriloha / toZaverka          dppo/_lib/dppo-bridge.ts
  → buildDppoFromAccounting                    packages/filing .../dppo/adapter.ts
  → computeDppoTotals / applyDppoTotals        .../dppo/compute.ts
  → generateDppo                               .../dppo/write.ts
  → validateFiling(xml, "dppo", "05.01.01")    packages/filing/src/validate/validate.ts
```

The server action is `buildDppoXml` in `apps/web/app/vykazy/dppo/_lib/dppo-action.ts`
(`"use server"`). It is the only place XSD validation runs, because
`validateFiling` pulls in `xmllint-wasm`. The browser imports
`@workspace/filing/cz/fu/dppo`, a barrel that deliberately excludes the validator
so the client bundle stays on `decimal.js-light` + `zod`.

## Persistence

| Key                    | Contents                                                       |
| ---------------------- | -------------------------------------------------------------- |
| `vykazy-doc`           | the whole `VykazyDoc`, `DOC_VERSION = 3`                       |
| `vykazy-org-templates` | saved identification blocks, `OrgTemplate[]`                   |
| `vykazy-dph`           | DPH evidence, `DphEvidence` — **sessionStorage by default**    |
| `vykazy-dph-mode`      | `"local"` when the user opted into persisting the DPH evidence |

`VykazyDoc` holds `org`, `values` (three statement maps), `rozsah`, `crVariant`,
`rozvrh`, `denik`, `overrides`. Migration from older `version` values lives in
`_lib/storage.ts` and is covered by `storage-migration.test.ts`.

`overrides` records the cells where the user took a deník-sourced value over.
A leaf that is sourced renders grey until clicked; clicking records an override
and it becomes a white input. A calc line carrying an explicit value has its
formula overridden by the engine.

## File formats

### Účetní deník, XLSX or CSV

Required columns: `Datum`, `TpUD`, `Zdroj`, `Číslo`, `Text`, `MD`, `DAL`,
`Částka`. Optional: `Cizí měna`, `Středisko`, `Zakázka`, `Činnost`, `Pársym`,
`Firma`, `Jméno`, `IČ`. Delimiter is auto-detected (`;` unless commas dominate).
Template: `denikCsvTemplate()`.

XLSX is unzipped with `fflate` and the sheet XML is read directly in
`parseDenikXlsx`; there is no spreadsheet library. Missing required columns fail
the import with the list of what is missing.

### Účtový rozvrh, CSV

Required columns: `Účet`, `Název`. Optional: `Oprávkový` (`Ano`/`Ne`), `Výkaz`
(`Aktiva` / `Pasiva` / `VZZ`, empty = the vyhláška's placement), `Řádek` (a leaf
řádek inside that výkaz, e.g. `062`). A superset is accepted so the full sheet
imports as-is. Diacritic-free aliases (`Ucet`, `Nazev`, `Opravkovy`, `Vykaz`,
`Radek`) are accepted. Template: `rozvrhCsvTemplate()`, UTF-8 with BOM.

Name resolution order: rozvrh exact → osnova exact → osnova syntetický. There is
no "rozvrh by synthetic" tier on purpose: an analytický název describes one
account and lending it to a sibling would state something false.

**Placement override** (`buildPlacementLookup`, consumed by
`mapPredvahaToValues` before its own law table). § 14 zákona o účetnictví splits
the ownership: a syntetický účet's řádek is the vyhláška's, an analytický účet's
is the účetní jednotka's. The case it exists for is 395 vnitřní zúčtování, where
one analytika is a pohledávka and another a závazek, and mapping the whole
synthetic to one side nets them against each other.

Resolution is exact-account-only, for the same reason names are. Three overrides
are refused rather than corrected, and land in `rejectedPlacements`:

| Refused                                  | Why                                               |
| ---------------------------------------- | ------------------------------------------------- |
| a syntetický účet (`311`, `311000`)      | its řádek is the vyhláška's (§ 14)                |
| `Výkaz` without `Řádek`, or the reverse  | half a placement says nothing                     |
| a calculated řádek (`001` AKTIVA CELKEM) | it sums its children, so the account counts twice |

An override that stops naming a leaf is dropped again at read time, so a
document written against an older layout degrades to the vyhláška rather than to
a cell that no longer exists.

A cp1250 file mangles the accented headers and the import fails with a hint to
save as UTF-8. Every dropped row (no account number, no name, duplicate) is
reported.

### Minulé období, JSON

```json
{
  "version": 1,
  "kind": "vykazy-minule",
  "minule": { "rozvahaAktiva": {}, "rozvahaPasiva": {}, "vzz": {} }
}
```

Keys are řádek numbers, values are whole tisíce. Feeds the `minule` column only.

### Full export, JSON

`exportJson(toDoc())` writes the whole `VykazyDoc`. `importJson` reads it back.
This is the only format that round-trips the entire state.

### DPPO, XML

EPO2 envelope, `Pisemnost > DPPDP9`. We write `verzePis` from `DPPO_VERSION` =
`"05.01.01"`; EPO's own working files write `"05.01"`. Both validate. XSD is
vendored at
`packages/filing/schemas/fu/dppo/05.01.01/dppdp9_epo2.xsd`, registry key
`dppo@05.01.01` in `packages/filing/src/validate/registry.ts`.

Věty, in XSD sequence order (`DPPO_EXTRA_VETA_TAGS` in
`packages/filing/src/model/dppo.ts`):

| Věta     | Cardinality | Carries                                                     |
| -------- | ----------- | ----------------------------------------------------------- |
| `VetaD`  | 1           | hlavička; also `uv_vyhl`, `uv_mena`, `uv_rozsah_rozv/vzz`   |
| `VetaP`  | 0..1        | poplatník, address, oprávněná osoba                         |
| `VetaO`  | 1           | II. oddíl, `kc_ii<x>_<řádek>` attributes                    |
| `VetaU`  | 0..12       | příloha tabulka A, one per účtová skupina                   |
| `VetaE`  | 0..1        | tabulka A celkem                                            |
| `VetaF`  | 0..1        | tabulka B, daňové odpisy                                    |
| `VetaS`  | 0..1        | tabulka K, čistý obrat + počet zaměstnanců                  |
| `VetaUA` | 0..∞        | Rozvaha AKTIVA, `c_radku` + brutto/korekce/netto/netto min. |
| `VetaUB` | 0..∞        | **VZZ** druhové členění, `c_radku` + `kc_sled`/`kc_min`     |
| `VetaUD` | 0..∞        | **Rozvaha PASIVA**, `c_radku` + `kc_sled`/`kc_min`          |
| `VetaA`  | 0..∞        | samostatná příloha, one list per spojená osoba              |
| `VetaUZ` | 0..1        | žádost o předání závěrky do sbírky listin                   |

`VetaUB` is the VZZ and `VetaUD` is pasiva, NOT the other way round. Both are the
same two-column shape and the XSD documents neither by name, so the block order
reads backwards; the assignment is pinned to a submitted return in
`zaverka.test.ts`. The XSD cannot catch a swap, since both věty accept identical
attributes.

`readDppo` captures every recognised věta into `extraVety` in XSD order, so a
document read → edited → written round-trips losslessly.

`VetaA`'s sixteen amount pairs are `<name>_sl1` / `<name>_sl2`, and the two
columns do NOT mean the same thing across rows: Služby is výnos/náklad,
Dlouhodobý majetek is prodej/pořizovací cena, Úvěrové nástroje is
přijaté/vyplacené, Vlastní kapitál is zvýšení/snížení, and pohledávky/závazky are
stav aktuálního/minulého období. `DPPO_SPOJENE_TRANSAKCE` in `spojene.ts` carries
each row's own two column names, so no caller ever writes `sl1`. Two emission
rules the XSD does not state, both pinned to a submitted return: a pair with any
activity ships BOTH halves (the idle one as `0`), and all five A/N příznaky are
always present.

## Rules that are easy to get wrong

**Units.** Rozvaha and VZZ are filed v celých tisících. Předvaha and DPPO stay
in exact Kč. `uz_rad` in `VetaD` declares which (`T` or `M`).

**Rounding is an allocation.** Each side is rounded to the thousand it totals and
the residual is dealt largest-remainder-first. Never round cells independently:
that prints AKTIVA ≠ PASIVA on a book that ties to the haléř.

**Rozvaha is stavová, VZZ toková.** Rozvaha takes konečný zůstatek; VZZ takes
obraty. Oprávky and opravné položky land on the **same** asset leaf in the
korekce column, and netto is always derived, never entered.

**Korekce sign flips between the výkaz and the XML.** The books carry it as a
credit and the printed form shows it negative, but EPO says
`"Záporné znaménko se neuvádí"`, so `VetaUA` sends it unsigned. A korekce cell
the form prints `x` on is omitted, not sent as 0.

**`c_radku` is a remap, not our řádek number.** EPO numbers aktiva 1–81 and
pasiva 1–69 in two independent spaces, both with a "nesmí být duplicitní"
control, which is why aktiva and pasiva must be separate věty. Our numbering
diverges wherever the časové-rozlišení variant sits: our aktiva C.III. `072` is
EPO 68, our pasiva A.IV.2. `020` is EPO 21. `zaverka.test.ts` pins every segment
boundary and asserts all 81 + 68 řádky map onto distinct čísla.

**Čistý obrat is skupina 60 only.** § 1d odst. 2 ZoÚ counts tržby from selling
výrobky, zboží and služby. Not the whole třída 6: ostatní provozní výnosy and
finanční výnosy are not tržby. The all-výnosy reading is § 1d odst. 5 and applies
to a veřejně prospěšný poplatník. VZZ ř.56 and tabulka K ř.1 derive it the same
way and must agree.

**DPPO ř.10 excludes the daň accounts.** `deriveUcetniVysledek` sums třída 6
minus třída 5 but skips exactly `590`, `591`, `592`, `595`, `596`, `599`
(`BELOW_VYSLEDEK_PRED_ZDANENIM`), since daň z příjmů sits below výsledek
hospodaření před zdaněním. It is not the whole 59x range: 597/598 (převod
provozních / finančních nákladů) stay in, because their 697/698 counterparts are
třída 6 and counted as výnos, so dropping one side inflates ř.10 by the transfer.

The DB path (`buildDppo` in `packages/accounting/src/output/dppo.ts`) matches the
same six on the generated `synthetic_code` column, so an analytical `591.001` is
caught like its parent. The two paths must stay in sync; they disagreed until
#948.

**Formulas are evaluated before export.** The store holds only leaves, so the
závěrka věty run `computeAll` first or every aggregate ships as 0.

**Rozsah and ČR variant follow the report; `hideEmpty` does not.** `hideEmpty` is
a screen toggle and must never reach an export. A mikro ÚJ has rozvaha rozsah `M`
but VZZ has no `M`, which is why `uv_rozsah_rozv` and `uv_rozsah_vzz` split.

## Printing

Safari honours neither `break-inside: avoid` on a `<tr>` nor a repeating
`<thead>`, so pagination is explicit. `_lib/print-pagination.ts` measures a
hidden replica (`.print-metrics`) and chunks rows into `.print-page` divs, each a
complete table with its own header, separated by `break-before: page`.

**Safari does not print a CSS pixel at 96dpi.** It lays the page out on a 1/90in
grid in both axes and rounds every box edge up onto it: a 1px border prints
0.8pt, 2px padding prints 1.6pt, a 16.5px line box prints 12.8pt. So a row's
printed height is rebuilt from its parts (`rowPt`), never scaled, and the replica
is laid out at `PRINT_METRICS_WIDTH_PX = 186mm at 90dpi − 1pt` so text wraps
where the paper wraps. Measuring at 96dpi gives labels 6.7% more room than they
have and the extra lines overflow the page.

Each printed row is its own `<tbody>`: Safari splits a `<tr>` across the fold
however it is styled but keeps a row group whole, so a miss costs a page break
rather than a torn row.

Re-measure the calibration if cell padding, font size or line height changes.

## Verifying a change

```bash
pnpm --filter web vitest run app/vykazy
```

```bash
pnpm --filter @workspace/filing vitest run src/cz/fu/dppo
```

```bash
pnpm preflight
```

To check a generated return end to end, `buildDppoXml` already runs
`validateFiling` and `checkDppo`. `checkDppo` sees only the document, never the
books, so an XSD-valid return with no findings can still disagree with the deník.
Tie ř.10 back to VZZ ř.49 by hand.

To regenerate the line-by-line reference after changing the mapping:

```bash
pnpm --filter web exec tsx scripts/build-vykazy-reference.ts
```

## Known gaps

- `c_pracufo` in `VetaP` (územní pracoviště) needs the FÚ číselník, which the
  repo does not vendor. `c_ufo_cil` already names the finanční úřad.
- `kc_v_4` (zálohy, § 38b) is derived from ř.340 and belongs to the totals chain
  in `compute.ts`, not to filing meta.
- `uz_dle_mus` is left unset on purpose: it is "A" only for a § 19a entity, and
  guessing "N" for everyone would be wrong for exactly those.
- `sam_pr`, `zvl_pr` and `p_pr_2od` are NOT gaps. The XSD says each "se vyplňuje
  automaticky" — EPO counts the přílohy itself. `c_obce` likewise carries
  "V generovaném souboru nemusí být vyplněno".
- Tabulka B and ř.150 are user-entered. Nothing derives daňové odpisy from a
  majetek register, so a return can charge full účetní odpisy on ř.50 and claim
  zero daňových.
- Tabulka A is user-entered. Which náklady are nedaňové is a judgement, so the
  figures do not move when the deník moves. Re-check them after a deník reimport.
- VZZ účelové členění (příloha č. 3) is not implemented. Only `VetaUB`, the
  druhové členění, is produced; the účelové variant is `VetaUE`.
- The DPPO form is component state. It is not part of `VykazyDoc` and does not
  survive a reload.

## DPH module (`/vykazy/dph`)

Three statutory filings — přiznání k DPH (DPHDP3), kontrolní hlášení (DPHKH1) and
souhrnné hlášení VIES (DPHSHV) — exported as official Finanční správa EPO XML for
upload to the daňový portál.

### Why it is not built from the deník

The deník is an accounting record. VAT reporting stands on the separate evidence
required by § 100 odst. 1 ZDPH, kept "v členění potřebném pro sestavení daňového
přiznání, souhrnného hlášení nebo kontrolního hlášení". A deník export cannot
supply what the three filings need: the counterparty's DIČ (it carries IČ at
best), the DPPD as distinct from the účetní datum, the supplier's own evidenční
číslo that KH B.2 requires, or the § 92 kód předmětu plnění. It also cannot tell
an EU acquisition from a domestic § 92 PDP or a § 108 residual — all three post
343 against 343 — and ř.20/21/22/25/50 carry no 343 leg at all.

So the evidence is entered or imported directly (`_lib/dph-evidence.ts`, with a
CSV template mirroring the deník and rozvrh imports), and the deník is used for
what it is good for: the kontrolní vazby.

### One evidence, three projections

```
DphEvidenceRow[]                      dph/_lib/dph-evidence.ts
  → projectPriznani                   dph/_lib/dph-project.ts  → Dphdp3Input
  → projectKontrolniHlaseni                                    → Dphkh1Input
  → projectSouhrnneHlaseni                                     → DphshvInput
  → generate* + validateFiling        dph/_lib/dph-xml.ts      → XML + XSD verdict
```

All three project from ONE array because EPO cross-checks them against each other
(Σ A.4 + A.5 základ against ř.1 + ř.2, and so on). `kontrolniVazby()` runs those
same checks in the UI before anything is downloaded.

### Client-side by design

Unlike the DPPO export, the DPH module has **no server action**. A kontrolní
hlášení is line-level personal data — every counterparty's DIČ, and for an OSVČ
that DIČ is a rodné číslo — so it is never sent anywhere. The writers are pure
string builders and `xmllint-wasm` ships a browser build, so generation and XSD
validation both run in the tab; the validator is imported lazily so its WASM
payload stays out of the initial bundle. `/vykazy` is a login-free public route,
so this also avoids adding an unauthenticated endpoint that would accept an
arbitrary-length KH array.

The evidence defaults to `sessionStorage` and disappears with the tab. Persisting
it is an explicit opt-in, and the wipe button clears both storages.

### Cadence traps

- **Kontrolní hlášení is monthly for every právnická osoba** (§ 101e odst. 1),
  even for a quarterly DPH plátce. It carries its own `khMesic`, and deriving the
  KH period from the přiznání period is the classic way to file a wrong hlášení.
- **Souhrnné hlášení** may be quarterly only when the filer supplies nothing but
  § 9 odst. 1 services; any goods force monthly (§ 102 odst. 6). `checkDphshv`
  rejects a quarterly hlášení carrying kód 0/1/2.
- `shvies_forma` is **R / N**, not the B/O/D/E of DPHDP3 or the B/O/N of DPHKH1.

### Known gaps

- ř.40–47 file the "V plné výši" column from the evidence; the "Krácený odpočet"
  column is entered by hand under its exact XML attribute name
  (`DPH_MANUAL_FIELDS`). The XSD carries two parallel attribute families for
  those řádky whose column roles its own documentation does not settle, and
  guessing would file a wrong return.
- Opravné / dodatečné forms are not exposed in the UI. `d_zjist` and
  `c_jed_vyzvy` exist on the header models, so the engine supports them.
- Call-off stock (`VetaS`) and SH storno rows are modelled and validated but have
  no UI.
### The workbook join

The evidence can also live as a `DPH` sheet in the SAME workbook as the deník
(`_lib/denik.ts` now resolves sheets by tab name, not by file order). One row per
doklad, joined to the deník on **(Zdroj, Číslo)** — never `Číslo` alone, because an
FV 001 and an FP 001 coexist and collapsing them would file the odběratel's doklad
as the dodavatel's.

The sheet carries only what the deník cannot: DIČ, DPPD, the supplier's evidenční
číslo, and the classification. `Základ` / `Daň` are optional:

- blank → inherited from the deník's postings for that doklad,
- filled → used, and **cross-checked** against the books, with any mismatch reported.

`indexDenikByDoklad` reads the base from the side OPPOSITE the 343 leg. An issued
invoice books 311 MD / 602 DAL / 343 DAL, so counting every non-343 leg would add
the receivable to the revenue and double the base. A leg that is 343 on both sides
(samovyměření, the monthly zápočet) contributes nothing.

Two reconciliation checks fall out of the join and run on import:

- a doklad the deník puts through 343 that the evidence never mentions — a plnění
  missing from the přiznání, the expensive direction,
- an evidence row naming a doklad that is not in the deník — a typo.

DIČ is proposed as `CZ` + the deník's IČ when the sheet leaves it blank, and the
proposal is flagged: a fyzická osoba registers under a rodné číslo and a skupinová
registrace under `CZ699…`.

The účtový rozvrh reads from a `Rozvrh` sheet of the same workbook too
(`parseRozvrhSheet`), reusing the CSV parser so header matching, duplicate
detection and placement overrides stay in one place. The separate CSV import
still works.

### Known gaps (continued)

- A doklad spanning two sazby needs two evidence rows with the base split by
  hand; the join reports the duplicate key as a warning rather than splitting it.
- Base inheritance cannot work for a doklad with no 343 leg (osvobozená plnění,
  PDP dodavatel) — those must carry an explicit `Základ`.
