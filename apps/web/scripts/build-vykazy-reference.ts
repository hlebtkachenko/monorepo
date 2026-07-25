// Generator for docs/specs/VYKAZY-AND-DPPO-REFERENCE.md — the line-by-line
// reference an účetní / advisor reviews the statement builder against.
//
// Everything here is DERIVED, never transcribed. The řádek tables come from the
// statement definitions, and the account column comes from probing
// mapPredvahaToValues itself with one synthetic account at a time, so the doc
// records what the code actually does rather than what a second copy of the
// table claims. A rule that changes and a doc that does not is the failure mode
// this avoids.
//
// Regenerate:  pnpm --filter web exec tsx scripts/build-vykazy-reference.ts

import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"

import { rozvahaAktiva, rozvahaPasiva } from "../app/vykazy/_data/rozvaha"
import { VZZ } from "../app/vykazy/_data/vzz"
import { OSNOVA } from "../app/vykazy/_data/osnova"
import { mapPredvahaToValues } from "../app/vykazy/_lib/mapping"
import type { VykazLine, VykazStatement } from "../app/vykazy/_lib/types"

const OUT = "../../docs/specs/VYKAZY-AND-DPPO-REFERENCE.md"
/** One probe = 1 000 tis., large enough that the tisíce allocation is exact. */
const PROBE_KC = 1_000_000

type StatementId = "rozvaha-aktiva" | "rozvaha-pasiva" | "vzz"
interface Hit {
  statement: StatementId
  rada: string
  col: string
}

/** Where does one syntetický účet land? Answered by running the real mapper. */
function probe(syn: string): Hit | null {
  const isNaklad = syn.startsWith("5")
  const isVynos = syn.startsWith("6")
  const out = mapPredvahaToValues(
    [
      {
        ucet: `${syn}000`,
        synteticky: syn,
        ks: isNaklad || isVynos ? 0 : PROBE_KC,
        obratMD: isNaklad ? PROBE_KC : 0,
        obratDal: isVynos ? PROBE_KC : 0,
      },
    ],
    "D",
  )
  if (out.unmapped.length > 0) return null
  const maps: [StatementId, Record<string, Record<string, number>>][] = [
    ["rozvaha-aktiva", out.rozvahaAktiva as never],
    ["rozvaha-pasiva", out.rozvahaPasiva as never],
    ["vzz", out.vzz as never],
  ]
  for (const [statement, values] of maps) {
    for (const [rada, cell] of Object.entries(values)) {
      // Pasiva ř.021 is stamped in from the VZZ result, not accumulated from an
      // account, so it is never a probe hit.
      if (statement === "rozvaha-pasiva" && rada === "021") continue
      for (const [col, v] of Object.entries(cell)) {
        if (v !== 0) return { statement, rada, col }
      }
    }
  }
  return null
}

const osnovaName = new Map(OSNOVA.map((a) => [a.ucet.slice(0, 3), a.nazev]))

/** syntetický -> hit, for every 3-digit synthetic the osnova knows, plus 349. */
function buildIndex(): Map<string, { syn: string; nazev: string }[]> {
  const index = new Map<string, { syn: string; nazev: string }[]>()
  const synthetics = [...new Set([...osnovaName.keys(), "349"])].sort()
  for (const syn of synthetics) {
    const hit = probe(syn)
    if (!hit) continue
    const key = `${hit.statement}|${hit.rada}|${hit.col}`
    const list = index.get(key) ?? []
    list.push({ syn, nazev: osnovaName.get(syn) ?? "" })
    index.set(key, list)
  }
  return index
}

/**
 * Make a statutory text safe inside a markdown table cell. Backslashes go
 * FIRST: escaping only the pipe turns an input "a\" + "|" into "a\\|", which
 * renders as a literal backslash followed by an unescaped pipe and splits the
 * row. A newline would end the row outright, so it collapses to a space.
 */
const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")

function accountsFor(
  index: Map<string, { syn: string; nazev: string }[]>,
  statement: StatementId,
  rada: string,
  cols: string[],
): string {
  const parts: string[] = []
  for (const col of cols) {
    const hits = index.get(`${statement}|${rada}|${col}`)
    if (!hits) continue
    const label = col === "korekce" ? " *(korekce)*" : ""
    parts.push(hits.map((h) => h.syn).join(", ") + label)
  }
  return parts.join(" · ")
}

function lineTable(
  statement: VykazStatement,
  id: StatementId,
  index: Map<string, { syn: string; nazev: string }[]>,
  cols: string[],
): string {
  const rows = statement.lines.map((line: VykazLine) => {
    const how =
      line.kind === "calc"
        ? `= ${line.formula ?? "(bez vzorce)"}`
        : "leaf (vstup)"
    const accounts = accountsFor(index, id, line.rada, cols)
    const flags = [
      line.korekceNA ? "korekce = x" : "",
      line.overridable ? "přepisovatelné" : "",
      line.crVariant ? `pouze varianta ${line.crVariant}` : "",
    ]
      .filter(Boolean)
      .join(", ")
    return `| ${line.rada} | ${esc(line.ozn)} | ${esc(line.text)} | ${how} | ${accounts || (line.kind === "input" ? "—" : "")} | ${flags} |`
  })
  return [
    "| ř. | Ozn. | Text | Výpočet | Účty | Pozn. |",
    "|---|---|---|---|---|---|",
    ...rows,
  ].join("\n")
}

/** Leaves no account can ever reach — filled by hand or by the minulé import. */
function orphanLeaves(
  statement: VykazStatement,
  id: StatementId,
  index: Map<string, { syn: string; nazev: string }[]>,
  cols: string[],
): string[] {
  return statement.lines
    .filter(
      (l) => l.kind === "input" && accountsFor(index, id, l.rada, cols) === "",
    )
    .map((l) => `${l.rada} ${l.ozn} ${l.text}`)
}

function main(): void {
  const index = buildIndex()
  const A = rozvahaAktiva("D")
  const P = rozvahaPasiva("D")
  const AC = rozvahaAktiva("C")
  const PC = rozvahaPasiva("C")

  const mappedCount = [...index.values()].reduce((n, l) => n + l.length, 0)

  const doc = `<!-- GENERATED by apps/web/scripts/build-vykazy-reference.ts — do not edit by hand.
     Regenerate: pnpm --filter web exec tsx scripts/build-vykazy-reference.ts -->

# Výkazy + DPPO: line-by-line reference

What every řádek of the Rozvaha and the Výkaz zisku a ztráty contains, how it is
computed, which účty feed it, and how the DPPO return is derived from the same
book. Written to be audited against the law: each section names the provision it
implements, so a reviewer can check the rule and the implementation side by side.

The account column is not a transcription. It is produced by running the real
mapper (\`mapPredvahaToValues\`) once per syntetický účet and recording where the
amount lands, so this document reports the behaviour of the code, not a second
copy of the table. ${mappedCount} synthetics map to a řádek.

## Legal basis

| Item | Provision |
|---|---|
| Rozvaha item list | vyhláška č. 500/2002 Sb., příloha č. 1 |
| VZZ item list (druhové členění) | vyhláška č. 500/2002 Sb., příloha č. 2 |
| Účelové členění (not implemented) | vyhláška č. 500/2002 Sb., příloha č. 3 |
| Rozsah (plný / zkrácený) | § 3a vyhlášky |
| Časové rozlišení, two layouts | § 3 odst. 3 a 4 vyhlášky |
| Účtový rozvrh | § 14 zákona č. 563/1991 Sb. |
| Účetní deník | § 13 zákona č. 563/1991 Sb. |
| Consistency of layout between periods | § 7 odst. 4 zákona č. 563/1991 Sb. |
| Čistý obrat | § 1d odst. 2 ZoÚ + § 35 vyhlášky |
| DPPO | zákon č. 586/1992 Sb., o daních z příjmů |

## Conventions the whole builder follows

**Unit.** Rozvaha and VZZ are filed *v celých tisících Kč*. The obratová
předvaha and the DPPO stay in exact Kč.

**Rounding is an allocation, not a per-cell round.** Σ round(x) ≠ round(Σ x), so
rounding each cell on its own can print AKTIVA 118 450 against PASIVA 118 449 on
a book that ties to the haléř. Instead each side is rounded to the thousand it
actually totals and the residual is dealt out largest-remainder-first to the
cells that lost most in rounding. No cell moves by more than 1 tis. and no cell
is a hardcoded plug.

**Rozvaha uses stavové hodnoty** — an account contributes its konečný zůstatek
(ΣMD − ΣDal).

- Aktivní účet → aktiva leaf, sloupec **brutto**, znaménko +1.
- Oprávky and opravné položky → the **same** asset leaf, sloupec **korekce**,
  znaménko +1. Their KS is a credit balance, so the korekce cell prints
  negative and netto = brutto + korekce, exactly as on the paper form.
- Pasivní účet → pasiva leaf, sloupec **bezne**, znaménko −1, so a credit
  balance prints positive. A contra-equity account (429 neuhrazená ztráta, a
  debit balance) prints negative under the same rule, which is correct.

**VZZ uses tokové hodnoty** — náklady (třída 5) = obratMD − obratDal, výnosy
(třída 6) = obratDal − obratMD. Both print positive.

**Netto is always derived**, never entered: netto = brutto + korekce. An
explicit netto value is ignored.

**A calc line may carry an explicit value**, which then wins over its formula.
Two things put one there: typing over an *overridable* cell, and a prior-year
import that supplies aggregates because the prior statement was zkrácený and has
no plný-rozsah leaves. Such a cell renders editable so it is visible and can be
cleared.

**Not mapped, deliberately.** 701 (počáteční účet rozvažný) and 702 / 710
(závěrkové účty) are technical: the opening balances they carry already reach the
výkaz through each rozvahový účet's KS, so mapping them would double-count.
Podrozvahové účty (třída 7) have no řádek in either statement; they belong in the
příloha v účetní závěrce. The app lists everything it did not map as
"nezařazené účty" on the deník page.

**Pasiva A.V. (ř. 021) has no account.** It is the VZZ result, stamped in so that
rozvaha A.V. and VZZ ř. 55 are identical by construction, with the remaining
pasiva leaves absorbing the rounding residual.

## Known limitations — review these first

Each is a deliberate simplification, listed so a reviewer can judge whether it is
acceptable for a given book rather than discover it by surprise.

1. **No dlouhodobé / krátkodobé split.** The deník carries no splatnost, so every
   pohledávka lands on C.II.2. Krátkodobé pohledávky and every závazek on C.II.
   Krátkodobé závazky. The dlouhodobé leaves (aktiva ř. 048–056, pasiva
   ř. 031–044) are therefore reachable only by hand or by the prior-year import.
   § 19 odst. 8 ZoÚ requires the split by residual maturity, so a book with any
   long-term receivable or payable needs those cells entered manually.
2. **Účty whose side depends on the sign are mapped to one fixed side.** 341,
   342, 343, 345 (daně), 314 / 324 (zálohy) and 336 always report on the side
   their nature suggests. A reversed balance — a nadměrný odpočet on 343, for
   instance — prints as a negative on that side instead of moving to
   "Stát - daňové pohledávky" (aktiva ř. 064). Check any 34x with a debit
   balance.
3. **Účelové členění VZZ is not implemented.** Only příloha č. 2 (druhové). An
   entity that reports by function needs příloha č. 3, which this builder does
   not produce.
4. **Podrozvahové účty (třída 7) reach no výkaz.** They belong in the příloha v
   účetní závěrce and must be disclosed there separately.
5. **Odložená daň is not computed.** Aktiva ř. 051 and pasiva ř. 040 are entered
   by hand; nothing derives a temporary difference.

## Cross-statement invariants

These must hold on any correct set. The app shows the first two as badges.

1. AKTIVA ř. 001 netto = PASIVA ř. 001 bezne
2. Rozvaha pasiva ř. 021 = VZZ ř. 055
3. Obratová předvaha: Σ MD = Σ Dal for počáteční stav, obrat and konečný stav
4. VZZ ř. 049 (VH před zdaněním) = DPPO ř. 10
5. VZZ ř. 030 + ř. 048 = ř. 049
6. VZZ ř. 049 − ř. 050 = ř. 053, and ř. 053 − ř. 054 = ř. 055

## Časové rozlišení: the two layouts

§ 3 odst. 3 a 4 vyhlášky give a choice, and the rozvaha carries only the chosen
one. The other block is dropped from the lines *and* from the aggregate
formulas, so a value left on the deselected block cannot reach a total that no
visible řádek explains.

| Účty | Layout "C" | Layout "D" |
|---|---|---|
| 381, 382, 385 | C.II.3. Časové rozlišení aktiv (ř. 068–071) | D. Časové rozlišení aktiv (ř. 078–081) |
| 383, 384 | C.III. Časové rozlišení pasiv (ř. 063–065) | D. Časové rozlišení pasiv (ř. 066–068) |

Under "C" the aggregates read ř. 001 = 002+003+037 and ř. 046 = 047+057+068;
under "D" they read ř. 001 = 002+003+037+078 and ř. 046 = 047+057.

## ROZVAHA — AKTIVA (${A.lines.length} řádků, layout D)

Columns: brutto, korekce, netto (derived), minulé.

${lineTable(A, "rozvaha-aktiva", index, ["brutto", "korekce"])}

Leaves no účet can reach (filled by hand or by the prior-year import):
${
  orphanLeaves(A, "rozvaha-aktiva", index, ["brutto", "korekce"])
    .map((l) => `\n- ${l}`)
    .join("") || " none"
}

Layout "C" replaces ř. 078–081 with ř. 068–071:

${lineTable({ ...AC, lines: AC.lines.filter((l) => l.crVariant === "C") }, "rozvaha-aktiva", index, ["brutto", "korekce"])}

## ROZVAHA — PASIVA (${P.lines.length} řádků, layout D)

Columns: běžné, minulé.

${lineTable(P, "rozvaha-pasiva", index, ["bezne"])}

Leaves no účet can reach:
${
  orphanLeaves(P, "rozvaha-pasiva", index, ["bezne"])
    .map((l) => `\n- ${l}`)
    .join("") || " none"
}

Layout "C" replaces ř. 066–068 with ř. 063–065:

${lineTable({ ...PC, lines: PC.lines.filter((l) => l.crVariant === "C") }, "rozvaha-pasiva", index, ["bezne"])}

## VÝKAZ ZISKU A ZTRÁTY — druhové členění (${VZZ.lines.length} řádků)

Columns: běžné, minulé.

${lineTable(VZZ, "vzz", index, ["bezne"])}

Leaves no účet can reach:
${
  orphanLeaves(VZZ, "vzz", index, ["bezne"])
    .map((l) => `\n- ${l}`)
    .join("") || " none"
}

### ř. 56 Čistý obrat — the one line that is not arithmetic

§ 1d odst. 2 ZoÚ: *"Čistým obratem se pro účely účetnictví rozumí výše výnosů z
prodeje výrobků a zboží a z poskytování služeb za účetní období."* That is I. +
II., which is the default this builder computes, and it is **not** the older
"I.+II.+III.+IV.+V.+VI.+VII." that the MF tiskopis (vzor 18) still prints.

The default can be wrong in either direction, so the cell is editable:

- § 35 odst. 1 vyhlášky defines the revenue as that *"na kterých je založen
  obchodní model účetní jednotky"*.
- § 35 odst. 2 vyhlášky: *"se nepřihlíží k tomu, ve které položce výkazu zisku a
  ztráty je výnos podle odstavce 1 vykazován"* — the položka does not decide.
- § 1d odst. 5 ZoÚ: an účetní jednotka *"u které hlavním předmětem činnosti není
  podnikání"* reports all výnosy instead. That is a different form (vyhláška
  504/2002 Sb.) and is not modelled here.

Applies to every účetní období započaté od 1. 1. 2024: zákon č. 349/2023 Sb.
Čl. LIX bod 1 and vyhláška č. 443/2023 Sb. Čl. II bod 2 keep the old rules only
for periods *započaté přede dnem* účinnosti.

## DPPO — přiznání k dani z příjmů právnických osob

### What the app supplies (II. oddíl input řádky)

| ř. | XML atribut | Význam | Zdroj |
|---|---|---|---|
| 10 | kc_ii10_10 | Výsledek hospodaření před zdaněním | Derived from the deník, exact Kč: Σ třída 6 (obratDal − obratMD) − Σ třída 5 (obratMD − obratDal), excluding 590, 591, 592, 595, 596, 599 |
| 40 | kc_ii50_40 | Daňově neuznatelné náklady, § 24 / § 25 | Entered |
| 50 | kc_ii60_50 | Účetní odpisy převyšují daňové, § 26–33 | Entered |
| 62 | kc_ii72_62 | § 18a odst. 1, veřejně prospěšný poplatník | Entered |
| 110 | kc_ii120_110 | Osvobozené / nezahrnované výnosy, § 19 | Entered |
| 150 | kc_ii170_150 | Daňové odpisy převyšují účetní | Entered |
| 230 | kc_ii210_230 | Odečet daňové ztráty minulých let, § 34 odst. 1 | Entered |
| 280 | kc_ii270_280 | Sazba daně v celých % | 21 % from 2024, 19 % for 2021–2023 (§ 21) |
| 300 | kc_ii290_300 | Slevy na dani, § 35 | Entered |

Why only ř. 10 fills itself: it is the single figure the účetnictví already
determines. Every other line is a *daňová* adjustment that no účet holds, so it
has to be entered.

The 590 / 591 / 592 / 595 / 596 / 599 exclusion is the VZZ structure: those sit
**below** "** Výsledek hospodaření před zdaněním" (ř. 049), so counting them
would not be the pre-tax result. The rest of skupina 59 (the převodové účty 597
and 598) **is** counted: it is reported in F.5 / K. and cancels against its
697 / 698 counterparts in třída 6. Dropping only one side would inflate ř. 10.

### What the form computes itself

Grounded in the Pokyny k vyplnění přiznání k DPPO. The vendored XSD carries only
facets, no vazby, so these formulas are the form's own footing.

| ř. | Vzorec |
|---|---|
| 70 | Σ zvýšení (ř. 20 … 65) |
| 170 | Σ snížení (ř. 100 … 165) |
| 200 | ř. 10 + ř. 70 − ř. 170 → základ daně / daňová ztráta (§ 23) |
| 220 | ř. 200 − ř. 201 − ř. 210 |
| 250 | max(0, ř. 220 − ř. 230 − ř. 240 − ř. 242 − ř. 243) |
| 270 | (ř. 250 − ř. 251 − ř. 260) zaokrouhleno na celé tisíce **dolů** (§ 21) |
| 290 | ř. 270 × ř. 280 / 100, na celé Kč **nahoru** (§ 21) |
| 310 | max(0, ř. 290 − ř. 300) |
| 340 | max(0, ř. 310 − ř. 319 − ř. 319a − ř. 320 + ř. 330) |
| 360 | ř. 340 − ř. 330 → poslední známá daň pro zálohy (§ 38a) |

Exactly one of ř. 50 and ř. 150 is non-zero: they are the two directions of the
same účetní-versus-daňové odpisy difference, and both are entered as a positive
magnitude. A negative number on either is wrong.
`

  writeFileSync(OUT, doc)
  // Format the output the same way the pre-commit hook would, so regenerating
  // an unchanged document leaves an empty diff instead of prettier's table
  // padding showing up as 275 changed lines every time.
  execFileSync("pnpm", ["exec", "prettier", "--write", OUT], {
    stdio: "ignore",
  })
  console.log(
    `${OUT}: ${doc.split("\n").length} lines, ${mappedCount} účtů mapped`,
  )
}

main()
