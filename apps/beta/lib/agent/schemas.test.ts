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
  assetsUpsertSchema,
  clientTasksUpsertSchema,
  filingsUpsertSchema,
  liabilitiesUpsertSchema,
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
