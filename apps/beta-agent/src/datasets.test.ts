import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  DATASETS,
  DATASET_NAMES,
  transform,
  type DatasetName,
} from "./datasets"
import { parsePeriod } from "./period"
import { tenancyKeysIn } from "./vendor/schemas"

const examples = join(import.meta.dirname, "..", "examples")
const read = (name: string): string =>
  readFileSync(join(examples, `${name}.csv`), "utf8")

const JULY = parsePeriod("2026-07")!

function ok(name: DatasetName, text = read(name), period = JULY) {
  const result = transform(DATASETS[name], text, { period })
  if (!result.ok)
    throw new Error(`unexpected refusal: ${JSON.stringify(result)}`)
  return result
}

function refused(
  name: DatasetName,
  text: string,
  period: ReturnType<typeof parsePeriod> = JULY,
) {
  const result = transform(DATASETS[name], text, { period })
  if (result.ok) throw new Error("expected a refusal")
  return result
}

describe("shipped examples", () => {
  it("every dataset has an example file that transforms cleanly", () => {
    for (const name of DATASET_NAMES)
      expect(ok(name).rowCount).toBeGreaterThan(0)
  })

  it("no transformed payload ever names a tenant", () => {
    // The server refuses `organizationId` / `userId` / `role` at any depth
    // (`tenancy_key_in_payload`). Asserting it here means a transformer that
    // starts echoing a source column called "role" is caught locally rather
    // than as a 400 on the office's month-end evening.
    for (const name of DATASET_NAMES) {
      expect(tenancyKeysIn(ok(name).payload)).toEqual([])
    }
  })
})

describe("predvaha", () => {
  it("normalizes Czech decimals and reads a quoted field containing the delimiter", () => {
    const { payload } = ok("predvaha")
    expect(payload).toMatchObject({
      period: { kind: "month", year: 2026, month: 7 },
      lines: [
        {
          accountCode: "211000",
          accountName: "Pokladna",
          openingBalance: "12500.00",
          turnoverDebit: "340000.00",
          turnoverCredit: "318220.50",
          closingBalance: "34279.50",
        },
        { accountCode: "221000", closingBalance: "1443511.75" },
        { accountCode: "518000", accountName: "Ostatní služby; drobné" },
      ],
    })
  })

  it("reads a BOM-prefixed, comma-delimited, en-US decimal file too", () => {
    const { payload } = ok(
      "predvaha",
      "﻿Ucet,Nazev,Konecny zustatek\n211000,Pokladna,34279.50\n",
    )
    expect(payload).toMatchObject({ lines: [{ closingBalance: "34279.50" }] })
  })

  it("refuses an unreadable amount by line and column", () => {
    const result = refused(
      "predvaha",
      "Účet;Název;Konečný zůstatek\n211000;Pokladna;34 279,5x\n",
    )
    expect(result.issues).toEqual([
      { line: 2, column: "Konečný zůstatek", code: "invalid_amount" },
    ])
  })

  it("refuses a duplicated account rather than letting the server's index do it", () => {
    const result = refused(
      "predvaha",
      "Účet;Název\n211000;Pokladna\n211000;Pokladna znovu\n",
    )
    expect(result.issues[0]).toMatchObject({ line: 3, code: "duplicate_row" })
  })

  it("names the missing required columns in Czech", () => {
    const result = refused("predvaha", "Něco;Jiného\n1;2\n")
    expect(result.missingColumns).toEqual(["Účet", "Název"])
  })

  it("refuses a batch dataset with no period", () => {
    expect(refused("predvaha", read("predvaha"), null).structural).toBe(
      "missing_period",
    )
  })
})

describe("rozvaha / vzz", () => {
  it("splits aktiva and pasiva and keeps the file's own order", () => {
    const { payload } = ok("rozvaha")
    expect(payload).toMatchObject({
      dataset: "rozvaha",
      lines: [
        {
          statementKind: "rozvaha_aktiva",
          rowCode: "001",
          sortOrder: 1,
          isBold: true,
          brutto: "3480220.00",
          korekce: "-420118.00",
          netto: "3060102.00",
          bezne: null,
        },
        {
          statementKind: "rozvaha_aktiva",
          rowCode: "014",
          indent: 2,
          isBold: false,
        },
        {
          statementKind: "rozvaha_pasiva",
          rowCode: "078",
          bezne: "3060102.00",
          netto: null,
        },
        { statementKind: "rozvaha_pasiva", rowCode: "079", sortOrder: 4 },
      ],
    })
  })

  it("refuses a rozvaha row carrying the other side's columns", () => {
    const result = refused(
      "rozvaha",
      "Část;Řádek;Text;Brutto;Běžné\naktiva;001;AKTIVA CELKEM;1,00;2,00\n",
    )
    expect(result.issues).toEqual([
      { line: 2, column: null, code: "column_shape" },
    ])
  })

  it("refuses a část cell that is neither aktiva nor pasiva", () => {
    const result = refused("rozvaha", "Část;Řádek;Text\nvýkaz;001;Něco\n")
    expect(result.issues[0]).toMatchObject({
      code: "unknown_value",
      column: "Část",
    })
  })

  it("stamps every VZZ row with the vzz kind and needs no část column", () => {
    const { payload } = ok("vzz")
    expect(payload).toMatchObject({
      dataset: "vzz",
      lines: [
        { statementKind: "vzz", rowCode: "01", ozn: "I.", bezne: "4820000.00" },
        { statementKind: "vzz", rowCode: "02" },
        { statementKind: "vzz", rowCode: "30", isBold: true },
      ],
    })
  })
})

describe("filings", () => {
  it("maps Czech labels onto the portal's enums and reads a per-row period", () => {
    const { payload } = ok("filings")
    expect(payload).toMatchObject({
      items: [
        {
          externalRef: "FIL-2026-07-DPH",
          kind: "dph_priznani",
          period: { kind: "month", year: 2026, month: 7 },
          dueOn: "2026-08-25",
          status: "filed",
          filedOn: "2026-08-25",
          amountDue: "48210.00",
          variableSymbol: "12345678",
        },
        {
          externalRef: "FIL-2026-Q3-SH",
          kind: "dph_souhrnne_hlaseni",
          period: { kind: "quarter", year: 2026, quarter: 3 },
          amountDue: null,
          variableSymbol: null,
        },
      ],
    })
  })

  it("falls back to --period when the file carries no Období column", () => {
    const { payload } = ok(
      "filings",
      "ID;Druh;Splatnost\nFIL-1;DPH;25.08.2026\n",
    )
    expect(payload).toMatchObject({
      items: [{ period: { kind: "month", year: 2026, month: 7 } }],
    })
  })

  it("widens a paid-on DATE to noon UTC, so the calendar day cannot move", () => {
    const { payload } = ok(
      "filings",
      "ID;Druh;Splatnost;Zaplaceno\nFIL-1;DPH;25.08.2026;25.08.2026\n",
    )
    expect(payload).toMatchObject({
      items: [{ paidAt: "2026-08-25T12:00:00Z" }],
    })
  })

  it("refuses an impossible date rather than rolling it over", () => {
    const result = refused(
      "filings",
      "ID;Druh;Splatnost\nFIL-1;DPH;31.02.2026\n",
    )
    expect(result.issues).toEqual([
      { line: 2, column: "Splatnost", code: "invalid_date" },
    ])
  })

  it("refuses a row with no period at all", () => {
    const result = refused(
      "filings",
      "ID;Druh;Splatnost\nFIL-1;DPH;25.08.2026\n",
      null,
    )
    expect(result.issues[0]).toMatchObject({ code: "invalid_period" })
  })

  it("refuses an unknown druh instead of filing it under ostatní", () => {
    const result = refused(
      "filings",
      "ID;Druh;Splatnost\nFIL-1;Něco jiného;25.08.2026\n",
    )
    expect(result.issues[0]).toMatchObject({
      code: "unknown_value",
      column: "Druh",
    })
  })

  it("refuses a repeated ID before the server's own index does", () => {
    const result = refused(
      "filings",
      "ID;Druh;Splatnost\nFIL-1;DPH;25.08.2026\nFIL-1;DPH;25.09.2026\n",
    )
    expect(result.issues[0]).toMatchObject({ line: 3, code: "duplicate_row" })
  })
})

describe("liabilities, assets, client tasks", () => {
  it("maps creditor groups and leaves dodavatele unreachable", () => {
    const { payload } = ok("liabilities")
    expect(payload).toMatchObject({
      items: [
        {
          externalRef: "LIA-2026-07-01",
          creditorGroup: "fu",
          amount: "3400.00",
        },
        {
          externalRef: "LIA-2026-07-02",
          creditorGroup: "ostatni",
          dueOn: "2026-08-20",
        },
      ],
    })
    const result = refused(
      "liabilities",
      "ID;Skupina;Název;Částka;Splatnost\nLIA-1;Dodavatelé;Faktura;10,00;20.08.2026\n",
    )
    expect(result.issues[0]).toMatchObject({
      code: "unknown_value",
      column: "Skupina",
    })
  })

  it("keeps oprávky paired with their as-of date", () => {
    const { payload } = ok("assets")
    expect(payload).toMatchObject({
      items: [
        {
          externalRef: "AST-0007",
          category: "machine",
          isMinor: false,
          acquisitionCost: "42800.00",
          accumulatedDepreciation: "28533.00",
          depreciationAsOf: "2026-06-30",
          status: "in_use",
        },
        {
          externalRef: "AST-0011",
          category: "tool",
          isMinor: true,
          accumulatedDepreciation: null,
          depreciationAsOf: null,
        },
      ],
    })
  })

  it("lets the SERVER's schema refuse an unpairable oprávky figure, locally", () => {
    // The pairing rule lives in the vendored schema, not in the transformer:
    // this asserts the local pre-flight actually runs it, so the office is told
    // which field is wrong instead of receiving a 400 with the same information.
    const result = refused(
      "assets",
      "ID;Název;Kategorie;Pořizovací cena;Oprávky\nAST-1;Míchačka;Stroj;100,00;40,00\n",
    )
    expect(result.schemaIssues[0]?.path).toBe("items.0.depreciationAsOf")
  })

  it("reads tasks with a link kind and a done flag", () => {
    const { payload } = ok("client-tasks")
    expect(payload).toMatchObject({
      items: [
        { externalRef: "TSK-2026-08-01", linkKind: "dokumenty", done: false },
        { externalRef: "TSK-2026-08-02", linkKind: "dane", description: null },
      ],
    })
  })
})

describe("datasets with no endpoint yet", () => {
  it("still transforms saldokonto, and names the PR that will accept it", () => {
    expect(DATASETS.saldokonto.path).toBeNull()
    expect(DATASETS.saldokonto.pending).toContain("PR 27")
    expect(ok("saldokonto").payload).toMatchObject({
      period: { kind: "month", year: 2026, month: 7 },
      partners: [
        {
          name: "Stavebniny Vltava s.r.o.",
          ico: "27604321",
          payableTotal: "186420.50",
        },
        {
          name: "Rezidence Vinohrady a.s.",
          dic: "CZ12345678",
          receivableTotal: "842000.00",
        },
      ],
    })
  })

  it("reads the payroll recap as ONE row and never sums a second", () => {
    expect(DATASETS.payroll.pending).toContain("PR 29")
    expect(ok("payroll").payload).toMatchObject({
      summary: {
        grossTotal: "486200.00",
        netPaidTotal: "381667.00",
        paymentDueDate: "2026-08-20",
        headcountHpp: 7,
        headcountDpc: 1,
        headcountDpp: 2,
      },
    })
    const twoRows = `${read("payroll")}486 200,00;650 468,00;;;;;;;1;1;1\n`
    expect(refused("payroll", twoRows).issues[0]).toMatchObject({
      code: "ragged_row",
    })
  })

  it("leaves an absent headcount absent, never reporting nobody employed", () => {
    const { payload } = ok(
      "payroll",
      "Hrubé mzdy;Čisté vyplaceno\n486 200,00;381 667,00\n",
    )
    expect(payload).toMatchObject({
      summary: { headcountHpp: null, headcountDpc: null, headcountDpp: null },
    })
  })

  it("names the required recap columns when the wrong export is picked", () => {
    expect(refused("payroll", "Něco;Jiného\n1;2\n").missingColumns).toEqual([
      "Hrubé mzdy",
      "Čisté vyplaceno",
    ])
  })
})

describe("structural refusals", () => {
  it.each([
    ["", "empty_file"],
    ["Účet;Název\n", "no_data_rows"],
    ['Účet;Název\n211000;"Pokladna\n', "unterminated_quote"],
  ])("refuses %j as %s", (text, code) => {
    expect(refused("predvaha", text).structural).toBe(code)
  })

  it("flags a row with more cells than the header has columns", () => {
    const result = refused("predvaha", "Účet;Název\n211000;Pokladna;navíc\n")
    expect(result.issues[0]).toMatchObject({ line: 2, code: "ragged_row" })
  })
})
