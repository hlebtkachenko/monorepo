/**
 * The ingestion API's validation boundary, tested adversarially.
 *
 * These are the assertions that stop a hostile or careless body from reaching a
 * transaction: a payload naming a tenant, an unknown field that would be
 * silently dropped, a money value that is a JS number, a statement row in the
 * wrong batch. Every one of them has a database CHECK behind it — the point of
 * testing here is that the caller is told WHAT is wrong, and that "wrong" is
 * decided before any row is written.
 */
import { describe, expect, it } from "vitest"

import {
  AGENT_KEY_PREFIX,
  bearerKey,
  generateAgentKey,
  hashAgentKey,
} from "./key"
import {
  accountBalanceMapUpsertSchema,
  assetsUpsertSchema,
  clientTasksUpsertSchema,
  filingsUpsertSchema,
  indicatorsUpsertSchema,
  liabilitiesUpsertSchema,
  publishPayrollSchema,
  publishSaldokontoSchema,
  publishStatementsSchema,
  publishTrialBalanceSchema,
  tenancyKeysIn,
} from "./schemas"

const period = { kind: "month", year: 2026, month: 3 } as const

const statementsBody = {
  dataset: "rozvaha",
  period,
  lines: [
    {
      statementKind: "rozvaha_aktiva",
      rowCode: "001",
      rowLabel: "AKTIVA CELKEM",
      sortOrder: 1,
      netto: "1234567.89",
    },
  ],
}

const filingsBody = {
  items: [
    {
      externalRef: "money-s3:filing:4711",
      kind: "dph_priznani",
      period,
      dueOn: "2026-04-25",
      amountDue: "12345.00",
    },
  ],
}

describe("tenancy keys are refused, at any depth and in any spelling", () => {
  it.each([
    ["organizationId", { organizationId: "x" }],
    ["organization_id", { organization_id: "x" }],
    ["ORGANIZATION_ID", { ORGANIZATION_ID: "x" }],
    ["orgSlug", { orgSlug: "acme" }],
    ["userId", { userId: "x" }],
    ["role", { role: "owner" }],
    ["isStaff", { is_staff: true }],
  ])("%s", (_name, body) => {
    expect(tenancyKeysIn(body)).toHaveLength(1)
  })

  it("finds one nested inside an item array", () => {
    expect(
      tenancyKeysIn({ items: [{ externalRef: "a", organizationId: "b" }] }),
    ).toEqual(["organizationId"])
  })

  it("does not fire on a legitimate field that merely contains the word", () => {
    expect(tenancyKeysIn({ partnerRole: "supplier", userIdent: "x" })).toEqual(
      [],
    )
  })
})

describe("publishStatementsSchema", () => {
  it("accepts a well-formed rozvaha", () => {
    expect(publishStatementsSchema.safeParse(statementsBody).success).toBe(true)
  })

  it("refuses a vzz row inside a rozvaha batch", () => {
    const body = {
      ...statementsBody,
      lines: [{ ...statementsBody.lines[0], statementKind: "vzz" }],
    }
    expect(publishStatementsSchema.safeParse(body).success).toBe(false)
  })

  it("refuses an unknown field rather than dropping it", () => {
    const result = publishStatementsSchema.safeParse({
      ...statementsBody,
      publish: true,
    })
    expect(result.success).toBe(false)
  })

  it("refuses a money value that is a number", () => {
    const body = {
      ...statementsBody,
      lines: [{ ...statementsBody.lines[0], netto: 1234567.89 }],
    }
    expect(publishStatementsSchema.safeParse(body).success).toBe(false)
  })

  it("refuses more than two decimal places (numeric(14,2))", () => {
    const body = {
      ...statementsBody,
      lines: [{ ...statementsBody.lines[0], netto: "1.234" }],
    }
    expect(publishStatementsSchema.safeParse(body).success).toBe(false)
  })

  it("refuses an empty batch", () => {
    expect(
      publishStatementsSchema.safeParse({ ...statementsBody, lines: [] })
        .success,
    ).toBe(false)
  })

  it("refuses a month period with no month", () => {
    const result = publishStatementsSchema.safeParse({
      ...statementsBody,
      period: { kind: "month", year: 2026 },
    })
    expect(result.success).toBe(false)
  })
})

describe("publishTrialBalanceSchema", () => {
  it("accepts účet rows", () => {
    const result = publishTrialBalanceSchema.safeParse({
      period,
      lines: [
        {
          accountCode: "221",
          accountName: "Bankovní účty",
          closingBalance: "500000.00",
        },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe("publishSaldokontoSchema", () => {
  const line = (over: Record<string, unknown> = {}) => ({
    partner: {
      externalRef: "money:p:1",
      name: "Stavebniny Novak s.r.o.",
      ico: "12345678",
      partnerRole: "supplier",
    },
    receivableTotal: "1000.00",
    payableTotal: "2000.00",
    oldestDue: "2026-04-30",
    ...over,
  })

  it("accepts a partner line with both sides stated", () => {
    expect(
      publishSaldokontoSchema.safeParse({ period, lines: [line()] }).success,
    ).toBe(true)
  })

  it("accepts a receivable-only line with no splatnost", () => {
    // A receivable owes nobody a deadline; the DB CHECK requires one only for a
    // payable, and this mirrors it exactly.
    expect(
      publishSaldokontoSchema.safeParse({
        period,
        lines: [
          {
            partner: { externalRef: "money:p:2", name: "Odberatel a.s." },
            receivableTotal: "1000.00",
          },
        ],
      }).success,
    ).toBe(true)
  })

  it("refuses a line that states neither side", () => {
    const result = publishSaldokontoSchema.safeParse({
      period,
      lines: [
        {
          partner: { externalRef: "money:p:3", name: "Prazdny s.r.o." },
        },
      ],
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain("payableTotal")
  })

  it("refuses a stated payable with no splatnost, naming the field", () => {
    const result = publishSaldokontoSchema.safeParse({
      period,
      lines: [line({ oldestDue: undefined })],
    })
    expect(result.success).toBe(false)
    // The obligations union lists a payable WITH its date. A named 400 beats a
    // 23514 the caller has to reverse-engineer — and beats a debt that silently
    // never reaches Dluhy a platby.
    expect(JSON.stringify(result.error?.issues)).toContain("oldestDue")
  })

  it("allows a settled ZERO payable with no splatnost", () => {
    // A measured zero never reaches the debt list, so it needs no date. The
    // check is on POSITIVE, textually — "0.00" carries no non-zero digit.
    expect(
      publishSaldokontoSchema.safeParse({
        period,
        lines: [line({ payableTotal: "0.00", oldestDue: undefined })],
      }).success,
    ).toBe(true)
  })

  it("refuses a negative total on either side", () => {
    // A negative receivable IS a payable; the caller meant the other column.
    expect(
      publishSaldokontoSchema.safeParse({
        period,
        lines: [line({ receivableTotal: "-1.00" })],
      }).success,
    ).toBe(false)
    expect(
      publishSaldokontoSchema.safeParse({
        period,
        lines: [line({ payableTotal: "-1.00" })],
      }).success,
    ).toBe(false)
  })

  it("refuses two lines for one partner", () => {
    const result = publishSaldokontoSchema.safeParse({
      period,
      lines: [line(), line()],
    })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result.error?.issues)).toContain("duplicate partner")
  })

  it("refuses an IČO that is not eight digits", () => {
    // It is a MATCH KEY: an unpadded IČO creates a second partner for a company
    // that already has one.
    expect(
      publishSaldokontoSchema.safeParse({
        period,
        lines: [
          line({ partner: { externalRef: "x", name: "A", ico: "1234567" } }),
        ],
      }).success,
    ).toBe(false)
  })

  it("refuses a partner line naming a membership role", () => {
    // `partnerRole` is the field; `role` is on FORBIDDEN_PAYLOAD_KEYS because a
    // membership role must never be stated in a body. Both halves are asserted:
    // the strict object refuses the unknown key, and `tenancyKeysIn` finds it
    // at depth before the schema ever runs.
    const body = {
      period,
      lines: [
        line({ partner: { externalRef: "x", name: "A", role: "owner" } }),
      ],
    }
    expect(publishSaldokontoSchema.safeParse(body).success).toBe(false)
    expect(tenancyKeysIn(body)).toEqual(["role"])
  })

  it("refuses an unknown field rather than dropping it", () => {
    expect(
      publishSaldokontoSchema.safeParse({
        period,
        lines: [line({ payableTotall: "2000.00" })],
      }).success,
    ).toBe(false)
  })

  it("refuses a money value that is a number", () => {
    expect(
      publishSaldokontoSchema.safeParse({
        period,
        lines: [line({ receivableTotal: 1000 })],
      }).success,
    ).toBe(false)
  })
})

describe("publishPayrollSchema", () => {
  const payrollBody = {
    period,
    summary: {
      grossTotal: "420000.00",
      employerSocial: "104160.00",
      employerHealth: "37800.00",
      employerCostTotal: "561960.00",
      employeeWithholdingsTotal: "48720.00",
      incomeTaxAdvance: "63000.00",
      netPaidTotal: "308280.00",
      paymentDueDate: "2026-04-12",
      headcountHpp: 4,
      headcountDpc: 1,
      headcountDpp: 2,
    },
    employees: [
      {
        externalRef: "money-s3:employee:88",
        fullName: "Jan Novák",
        contractType: "hpp",
        startedOn: "2024-02-01",
        gross: "60000.00",
        deductionsTotal: "6960.00",
        net: "44040.00",
        employerCost: "80280.00",
      },
    ],
  }

  it("accepts a payroll run", () => {
    expect(publishPayrollSchema.safeParse(payrollBody).success).toBe(true)
  })

  it("accepts totals with no per-employee breakdown", () => {
    const result = publishPayrollSchema.safeParse({
      ...payrollBody,
      employees: [],
    })
    expect(result.success).toBe(true)
  })

  it("refuses an employee with no externalRef — matching a NAME would merge two people", () => {
    const result = publishPayrollSchema.safeParse({
      ...payrollBody,
      employees: [{ fullName: "Jan Novák", contractType: "hpp" }],
    })
    expect(result.success).toBe(false)
  })

  it("refuses the same externalRef twice, naming which entry is the duplicate", () => {
    const result = publishPayrollSchema.safeParse({
      ...payrollBody,
      employees: [payrollBody.employees[0], payrollBody.employees[0]],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([
      "employees",
      1,
      "externalRef",
    ])
  })

  it("refuses an employment that ends before it begins", () => {
    const result = publishPayrollSchema.safeParse({
      ...payrollBody,
      employees: [
        {
          ...payrollBody.employees[0],
          startedOn: "2026-03-01",
          endedOn: "2026-02-01",
        },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["employees", 0, "endedOn"])
  })

  it("refuses an unknown contract type", () => {
    const result = publishPayrollSchema.safeParse({
      ...payrollBody,
      employees: [{ ...payrollBody.employees[0], contractType: "brigada" }],
    })
    expect(result.success).toBe(false)
  })

  it("refuses a summary figure that is a number rather than a numeric string", () => {
    const result = publishPayrollSchema.safeParse({
      ...payrollBody,
      summary: { ...payrollBody.summary, grossTotal: 420000 },
    })
    expect(result.success).toBe(false)
  })

  it("refuses a negative headcount", () => {
    const result = publishPayrollSchema.safeParse({
      ...payrollBody,
      summary: { ...payrollBody.summary, headcountHpp: -1 },
    })
    expect(result.success).toBe(false)
  })

  it("requires the summary — lines with no totals would split §2.6 in half", () => {
    const { summary: _dropped, ...withoutSummary } = payrollBody
    expect(publishPayrollSchema.safeParse(withoutSummary).success).toBe(false)
  })

  it("has no appUserId field — binding an account is not an agent's to write", () => {
    const result = publishPayrollSchema.safeParse({
      ...payrollBody,
      employees: [
        {
          ...payrollBody.employees[0],
          appUserId: "00000000-0000-7000-8000-000000000000",
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("refuses a body naming a tenant, like every other dataset", () => {
    expect(tenancyKeysIn({ ...payrollBody, organizationId: "x" })).toEqual([
      "organizationId",
    ])
  })
})

describe("filingsUpsertSchema", () => {
  it("accepts a filing with an externalRef", () => {
    expect(filingsUpsertSchema.safeParse(filingsBody).success).toBe(true)
  })

  it("refuses an item with no externalRef — the upsert would duplicate", () => {
    const [item] = filingsBody.items
    const { externalRef: _dropped, ...rest } = item!
    expect(filingsUpsertSchema.safeParse({ items: [rest] }).success).toBe(false)
  })

  it("refuses an unknown filing kind", () => {
    const body = {
      items: [{ ...filingsBody.items[0], kind: "dph_neco_jineho" }],
    }
    expect(filingsUpsertSchema.safeParse(body).success).toBe(false)
  })

  it("refuses a non-digit variable symbol", () => {
    const body = {
      items: [{ ...filingsBody.items[0], variableSymbol: "CZ123" }],
    }
    expect(filingsUpsertSchema.safeParse(body).success).toBe(false)
  })
})

describe("liabilitiesUpsertSchema", () => {
  const item = {
    externalRef: "money-s3:liability:9",
    label: "Penále",
    amount: "1500.00",
    dueOn: "2026-04-30",
  }

  it("accepts the residue groups", () => {
    expect(
      liabilitiesUpsertSchema.safeParse({
        items: [{ ...item, creditorGroup: "fu" }],
      }).success,
    ).toBe(true)
  })

  it("refuses `dodavatele` — that group belongs to the saldokonto import", () => {
    expect(
      liabilitiesUpsertSchema.safeParse({
        items: [{ ...item, creditorGroup: "dodavatele" }],
      }).success,
    ).toBe(false)
  })
})

describe("assetsUpsertSchema", () => {
  const item = {
    externalRef: "money-s3:asset:3",
    name: "Bagr",
    category: "machine",
    acquisitionCost: "800000.00",
  }

  it("accepts a plain asset", () => {
    expect(assetsUpsertSchema.safeParse({ items: [item] }).success).toBe(true)
  })

  it("refuses oprávky with no as-of date (and the reverse)", () => {
    expect(
      assetsUpsertSchema.safeParse({
        items: [{ ...item, accumulatedDepreciation: "100000.00" }],
      }).success,
    ).toBe(false)
    expect(
      assetsUpsertSchema.safeParse({
        items: [{ ...item, depreciationAsOf: "2026-03-31" }],
      }).success,
    ).toBe(false)
  })

  it("refuses a disposal with no disposal date", () => {
    expect(
      assetsUpsertSchema.safeParse({
        items: [{ ...item, status: "disposed" }],
      }).success,
    ).toBe(false)
  })

  /**
   * The reverse half, and the one that used to slip through: a `disposedOn`
   * with no `status` parsed cleanly and was then DISCARDED by the ingest, so the
   * office got a 200 for a disposal the portal never recorded.
   */
  it("refuses a disposal date with no disposal", () => {
    expect(
      assetsUpsertSchema.safeParse({
        items: [{ ...item, disposedOn: "2026-05-31" }],
      }).success,
    ).toBe(false)
    expect(
      assetsUpsertSchema.safeParse({
        items: [{ ...item, status: "in_use", disposedOn: "2026-05-31" }],
      }).success,
    ).toBe(false)
  })

  it("still accepts a coherent disposal", () => {
    expect(
      assetsUpsertSchema.safeParse({
        items: [{ ...item, status: "disposed", disposedOn: "2026-05-31" }],
      }).success,
    ).toBe(true)
  })
})

describe("clientTasksUpsertSchema", () => {
  const item = {
    externalRef: "money:task:1",
    title: "Doložte výpis z účtu",
    dueDate: "2026-04-15",
  }

  it("accepts a task", () => {
    expect(clientTasksUpsertSchema.safeParse({ items: [item] }).success).toBe(
      true,
    )
  })

  it("has no template field — a template is not an agent's to write", () => {
    expect(
      clientTasksUpsertSchema.safeParse({
        items: [{ ...item, isTemplate: true }],
      }).success,
    ).toBe(false)
  })
})

describe("accountBalanceMapUpsertSchema", () => {
  const item = { accountCode: "221", label: "Bankovní účty", kind: "bank" }

  it("accepts a minimal entry — the account code is the key", () => {
    expect(
      accountBalanceMapUpsertSchema.safeParse({ items: [item] }).success,
    ).toBe(true)
  })

  it("accepts the analytic codes a real rozvrh spells", () => {
    for (const accountCode of ["221.01", "221_02", "311100", "343-1"]) {
      expect(
        accountBalanceMapUpsertSchema.safeParse({
          items: [{ ...item, accountCode }],
        }).success,
        accountCode,
      ).toBe(true)
    }
  })

  it("has no externalRef field — a second match key would be the defect", () => {
    // Every other registry needs one because it has no natural key. This one's
    // account code IS its identity and is unique per book (migration 0014), so
    // a second key could only ever disagree with the first.
    expect(
      accountBalanceMapUpsertSchema.safeParse({
        items: [{ ...item, externalRef: "money:acct:1" }],
      }).success,
    ).toBe(false)
  })

  it("refuses a padded account code — a prefix match would silently miss", () => {
    for (const accountCode of [" 221", "221 ", " ", ""]) {
      expect(
        accountBalanceMapUpsertSchema.safeParse({
          items: [{ ...item, accountCode }],
        }).success,
        JSON.stringify(accountCode),
      ).toBe(false)
    }
  })

  it("refuses a code longer than the column", () => {
    expect(
      accountBalanceMapUpsertSchema.safeParse({
        items: [{ ...item, accountCode: "2".repeat(21) }],
      }).success,
    ).toBe(false)
  })

  it("refuses a blank label rather than storing whitespace", () => {
    expect(
      accountBalanceMapUpsertSchema.safeParse({
        items: [{ ...item, label: "   " }],
      }).success,
    ).toBe(false)
  })

  it("refuses a kind or match kind outside the enums", () => {
    expect(
      accountBalanceMapUpsertSchema.safeParse({
        items: [{ ...item, kind: "crypto" }],
      }).success,
    ).toBe(false)
    expect(
      accountBalanceMapUpsertSchema.safeParse({
        items: [{ ...item, matchKind: "regex" }],
      }).success,
    ).toBe(false)
  })

  it("refuses a sort order the column cannot hold", () => {
    expect(
      accountBalanceMapUpsertSchema.safeParse({
        items: [{ ...item, sortOrder: 1000 }],
      }).success,
    ).toBe(false)
    expect(
      accountBalanceMapUpsertSchema.safeParse({
        items: [{ ...item, sortOrder: -1 }],
      }).success,
    ).toBe(false)
  })

  it("refuses an empty call and an unknown field", () => {
    expect(accountBalanceMapUpsertSchema.safeParse({ items: [] }).success).toBe(
      false,
    )
    expect(
      accountBalanceMapUpsertSchema.safeParse({
        items: [{ ...item, balance: "100.00" }],
      }).success,
    ).toBe(false)
  })

  it("carries no money field at all — this table stores none", () => {
    const parsed = accountBalanceMapUpsertSchema.parse({
      items: [{ ...item, matchKind: "prefix", sortOrder: 2, active: false }],
    })
    expect(Object.keys(parsed.items[0]!).sort()).toEqual([
      "accountCode",
      "active",
      "kind",
      "label",
      "matchKind",
      "sortOrder",
    ])
  })
})

describe("indicatorsUpsertSchema", () => {
  const item = {
    kind: "annual_turnover",
    amount: "2536500.00",
    asOf: "2026-07-31",
  }

  it("accepts a minimal reading — kind, figure, date", () => {
    expect(indicatorsUpsertSchema.safeParse({ items: [item] }).success).toBe(
      true,
    )
  })

  it("has no externalRef field — (kind, asOf) IS the identity", () => {
    // Migration 0020 makes the pair unique per book. A second match key could
    // only ever disagree with the first, which is the duplicate-or-lose failure
    // `externalRef` exists to prevent rather than to cause.
    expect(
      indicatorsUpsertSchema.safeParse({
        items: [{ ...item, externalRef: "money:kpi:1" }],
      }).success,
    ).toBe(false)
  })

  it("refuses a kind outside the enum", () => {
    expect(
      indicatorsUpsertSchema.safeParse({
        items: [{ ...item, kind: "ebitda" }],
      }).success,
    ).toBe(false)
  })

  it("refuses a figure that is not a numeric(14,2) string", () => {
    for (const amount of ["", "abc", "1.234", "1e6", "1 234,50", 2536500]) {
      expect(
        indicatorsUpsertSchema.safeParse({ items: [{ ...item, amount }] })
          .success,
        JSON.stringify(amount),
      ).toBe(false)
    }
  })

  it("refuses a NEGATIVE figure by name, not by constraint", () => {
    // Obrat is a sum of taxable supplies; the database refuses it too
    // (`organization_indicator_amount_nonnegative`), and naming the field in a
    // 400 beats a constraint name at the bottom of a transaction.
    expect(
      indicatorsUpsertSchema.safeParse({
        items: [{ ...item, amount: "-1.00" }],
      }).success,
    ).toBe(false)
  })

  it("requires the as-of date — §0.4, every number carries its own", () => {
    const { asOf: _dropped, ...noDate } = item
    expect(indicatorsUpsertSchema.safeParse({ items: [noDate] }).success).toBe(
      false,
    )
    for (const asOf of ["31.07.2026", "2026-7-31", ""]) {
      expect(
        indicatorsUpsertSchema.safeParse({ items: [{ ...item, asOf }] })
          .success,
        asOf,
      ).toBe(false)
    }
  })

  it("refuses one (kind, asOf) stated twice in one payload", () => {
    // The unique index makes a repeat an UPSERT, not an error: without this
    // guard the second item silently overwrites the first and the summary
    // reports `created: 1, updated: 1` for two readings the caller believed it
    // had sent. The offending item is named by path.
    const result = indicatorsUpsertSchema.safeParse({
      items: [item, { ...item, amount: "1.00" }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["items", 1, "asOf"])

    // Two DIFFERENT dates are two readings and stay legal.
    expect(
      indicatorsUpsertSchema.safeParse({
        items: [item, { ...item, asOf: "2026-06-30" }],
      }).success,
    ).toBe(true)
  })

  it("takes an optional internal note and refuses an unknown key", () => {
    expect(
      indicatorsUpsertSchema.safeParse({
        items: [{ ...item, noteInternal: "Z výkazu DPH." }],
      }).success,
    ).toBe(true)
    expect(
      indicatorsUpsertSchema.safeParse({
        items: [{ ...item, noteClient: "viditelné klientovi" }],
      }).success,
    ).toBe(false)
  })

  it("refuses an empty batch and a body naming a tenant", () => {
    expect(indicatorsUpsertSchema.safeParse({ items: [] }).success).toBe(false)
    expect(tenancyKeysIn({ organizationId: "x", items: [item] })).toEqual([
      "organizationId",
    ])
  })
})

describe("a date field takes a REAL calendar day, on every dataset", () => {
  /**
   * The shape check alone let `2026-02-30` through to Postgres, which answers
   * 22008 at the bottom of the transaction — not an `IngestRefused`, not a
   * unique violation, so `ingest` rethrows and the caller gets a 500 for a
   * payload this API is supposed to name a 400 on. Fixed at the shared `isoDate`
   * reader, so it is asserted across datasets rather than on one field.
   */
  const IMPOSSIBLE = [
    "2026-02-30", // February never has 30 days
    "2026-02-29", // 2026 is not a leap year
    "2026-04-31", // April has 30
    "2026-13-01", // no 13th month
    "2026-00-10", // no 0th month
    "2026-06-00", // no 0th day
    "2026-06-32",
  ]

  it("refuses an impossible day on an indicator's asOf", () => {
    for (const asOf of IMPOSSIBLE) {
      expect(
        indicatorsUpsertSchema.safeParse({
          items: [{ kind: "annual_turnover", amount: "1.00", asOf }],
        }).success,
        asOf,
      ).toBe(false)
    }
  })

  it("refuses an impossible day on a filing's dueOn", () => {
    for (const dueOn of IMPOSSIBLE) {
      expect(
        filingsUpsertSchema.safeParse({
          items: [{ ...filingsBody.items[0], dueOn }],
        }).success,
        dueOn,
      ).toBe(false)
    }
  })

  it("still takes every real day, leap 29 February included", () => {
    for (const asOf of [
      "2024-02-29", // a real leap day
      "2026-01-31",
      "2026-04-30",
      "2026-12-31",
    ]) {
      expect(
        indicatorsUpsertSchema.safeParse({
          items: [{ kind: "annual_turnover", amount: "1.00", asOf }],
        }).success,
        asOf,
      ).toBe(true)
    }
  })

  it("is not fooled by a two-digit year widened to 19xx", () => {
    // `Date.UTC(26, …)` means 1926, so a naive round trip would accept
    // "0026-02-01" as if it were year 26. The comparison is against the digits
    // the caller wrote, so it refuses.
    expect(
      indicatorsUpsertSchema.safeParse({
        items: [
          { kind: "annual_turnover", amount: "1.00", asOf: "0026-02-01" },
        ],
      }).success,
    ).toBe(false)
  })
})

describe("the credential itself", () => {
  it("is prefixed, long, and never repeats", () => {
    const a = generateAgentKey()
    const b = generateAgentKey()
    expect(a.startsWith(AGENT_KEY_PREFIX)).toBe(true)
    expect(a.length).toBeGreaterThan(AGENT_KEY_PREFIX.length + 40)
    expect(a).not.toEqual(b)
  })

  it("hashes to 64 hex characters and never back", () => {
    const secret = generateAgentKey()
    const hash = hashAgentKey(secret)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(secret)
    expect(hashAgentKey(secret)).toEqual(hash)
  })

  it("reads only a Bearer header", () => {
    expect(bearerKey(new Headers({ authorization: "Bearer abc" }))).toBe("abc")
    expect(bearerKey(new Headers({ authorization: "bearer abc" }))).toBe("abc")
    expect(bearerKey(new Headers({ authorization: "Basic abc" }))).toBeNull()
    expect(bearerKey(new Headers({ authorization: "abc" }))).toBeNull()
    expect(bearerKey(new Headers())).toBeNull()
    expect(bearerKey(new Headers({ authorization: "Bearer " }))).toBeNull()
    expect(
      bearerKey(new Headers({ authorization: `Bearer ${"x".repeat(201)}` })),
    ).toBeNull()
  })
})
