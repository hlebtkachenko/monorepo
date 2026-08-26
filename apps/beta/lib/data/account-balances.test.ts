/**
 * Finance › Účty a hotovost' read model and the account map's writes, against a
 * real database.
 *
 * WHAT THIS SUITE IS FOR. Every claim this module makes is a claim about WHICH
 * ROWS ARE READ: the current published batch and not a superseded one, not a
 * draft, not another book's, and — for a prefix card — exactly the účty whose
 * code starts with the mapped one. None of that means anything against a mock:
 * they are properties of the publish state machine and of one SQL join, so the
 * fixtures seed real batches and the assertions read them back through the
 * function the page calls.
 *
 * The module imports are dynamic for the same reason every other `db` suite
 * does it: `DATABASE_URL` is set by globalSetup, and a static import would bind
 * the `betaDb()` singleton before it exists.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createAccountMappingRow,
  createMonthPeriod,
  createReportingPeriod,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "@/tests/fixtures"

/**
 * The sessions are genuine Better Auth sessions; only `next/headers` is mocked,
 * because there is no HTTP request in a test runner. Same arrangement as
 * `liabilities.test.ts`.
 */
const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const {
  accountBalancesForScope,
  accountMappingIdByCode,
  accountMappingsForScope,
  createAccountMapping,
  deleteAccountMappings,
  updateAccountMapping,
} = await import("./account-balances")
const { createDraftBatch, publishBatch } = await import("./imports")
const { forbiddenClientKeys } = await import("./projections")
const { requireOwner, requireScope } = await import("./scope")

/**
 * Publish one předvaha for a fresh month period, through the import spine's own
 * ritual rather than by writing rows.
 *
 * `createDraftBatch` + `publishBatch` is what the office (and the ingestion API)
 * actually does, and the payload trigger refuses a row written into anything
 * but a draft anyway — so a fixture that seeded a published batch directly
 * would be asserting against a state the product cannot reach. Re-publishing
 * the SAME period is how a supersession is produced, which is exactly what one
 * of the assertions below needs.
 */
async function seedPredvaha(
  book: TestOrganization,
  accounts: readonly { code: string; closing: string | null }[],
  options: { publish?: boolean; periodId?: string } = {},
): Promise<{ periodId: string; batchId: string }> {
  const owner = requireOwner(await scopeOf(book))
  const periodId =
    options.periodId ?? (await createMonthPeriod(book.organizationId))

  const batch = await createDraftBatch(owner, {
    dataset: "predvaha",
    periodId,
    source: "agent",
    trialBalanceLines: accounts.map((account) => ({
      accountCode: account.code,
      accountName: `Účet ${account.code}`,
      closingBalance: account.closing,
    })),
  })

  if (options.publish !== false) await publishBatch(owner, batch.id)
  return { periodId, batchId: batch.id }
}

/** Resolve `book`'s scope as one of its members — the owner unless told otherwise. */
async function scopeOf(
  book: TestOrganization,
  role: "owner" | "admin" | "member" | "guest" = "owner",
) {
  request.headers = book.members[role].headers
  return requireScope(book.slug)
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(endFixtures)

describe("balances come from the CURRENT published předvaha, and nowhere else", () => {
  it("reads the closing balance of a mapped účet", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221",
      label: "Běžný účet",
    })
    await seedPredvaha(book, [
      { code: "221", closing: "150000.00" },
      { code: "211", closing: "4200.00" },
    ])

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(model.cards).toHaveLength(1)
    expect(model.cards[0]).toMatchObject({
      accountCode: "221",
      label: "Běžný účet",
      kind: "bank",
      closingBalance: "150000.00",
      matchedAccounts: 1,
    })
    expect(model.period?.month).not.toBeNull()
    expect(model.publishedAt).not.toBeNull()
    // The figure is the STRING Postgres returned — never a parsed number.
    expect(typeof model.cards[0]?.closingBalance).toBe("string")
  })

  it("ignores a draft batch entirely", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })
    await seedPredvaha(book, [{ code: "221", closing: "999999.00" }], {
      publish: false,
    })

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    // Not "0 Kč": the office has published nothing, so §0.4's absent state.
    expect(model.period).toBeNull()
    expect(model.total).toBeNull()
    expect(model.cards[0]?.closingBalance).toBeNull()
    expect(model.cards[0]?.series).toEqual([])
  })

  it("ignores a superseded batch and reads the one that replaced it", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })

    // Two batches for the SAME period. Publishing the second supersedes the
    // first, exactly as a corrected month-end does.
    const { periodId } = await seedPredvaha(book, [
      { code: "221", closing: "111111.00" },
    ])
    await seedPredvaha(book, [{ code: "221", closing: "222222.00" }], {
      periodId,
    })

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(model.cards[0]?.closingBalance).toBe("222222.00")
    // One point, not two: the superseded batch is not a period of its own.
    expect(model.cards[0]?.series).toHaveLength(1)
  })

  it("never reads another book's předvaha", async () => {
    const mine = await seedOrganization()
    const theirs = await seedOrganization()
    await createAccountMappingRow(mine.organizationId, { accountCode: "221" })
    await seedPredvaha(theirs, [{ code: "221", closing: "5000000.00" }])

    const scope = await scopeOf(mine)
    const model = await accountBalancesForScope(scope)

    expect(model.period).toBeNull()
    expect(model.cards[0]?.closingBalance).toBeNull()
  })

  it("says nothing rather than zero when the předvaha omits the account", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "213" })
    await seedPredvaha(book, [{ code: "221", closing: "1000.00" }])

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(model.cards[0]?.closingBalance).toBeNull()
    expect(model.cards[0]?.matchedAccounts).toBe(0)
    expect(model.total).toBeNull()
  })

  it("carries a stated NULL through as an absence, not as a zero", async () => {
    // A předvaha may omit a COLUMN; an omitted column is not a zero (§0.4).
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })
    await seedPredvaha(book, [{ code: "221", closing: null }])

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(model.cards[0]?.closingBalance).toBeNull()
    // The účet IS in the předvaha — that is a different fact from being absent.
    expect(model.cards[0]?.matchedAccounts).toBe(1)
  })
})

describe("prefix matching claims exactly the účty whose code starts with it", () => {
  it("sums the analytics under a prefix, in SQL", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221",
      matchKind: "prefix",
      label: "Bankovní účty",
    })
    await seedPredvaha(book, [
      { code: "221.01", closing: "100000.00" },
      { code: "221.02", closing: "50000.50" },
      { code: "2210", closing: "0.50" },
      // Not claimed: a different syntetický účet that merely starts with a 2.
      { code: "211", closing: "9999.00" },
      { code: "22", closing: "7777.00" },
    ])

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(model.cards[0]?.closingBalance).toBe("150001.00")
    expect(model.cards[0]?.matchedAccounts).toBe(3)
  })

  it("an exact entry claims one účet and never its analytics", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221",
      matchKind: "exact",
    })
    await seedPredvaha(book, [
      { code: "221", closing: "10.00" },
      { code: "221.01", closing: "999.00" },
    ])

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(model.cards[0]?.closingBalance).toBe("10.00")
    expect(model.cards[0]?.matchedAccounts).toBe(1)
  })

  it("treats `_` as a character, not as a LIKE wildcard", async () => {
    // The whole reason the join uses `starts_with` rather than
    // `LIKE code || '%'`: a mapping for `221_0` written as a LIKE pattern would
    // also claim `221X0`, which is somebody else's money.
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221_0",
      matchKind: "prefix",
    })
    await seedPredvaha(book, [
      { code: "221_01", closing: "1.00" },
      { code: "221X01", closing: "1000000.00" },
    ])

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(model.cards[0]?.closingBalance).toBe("1.00")
    expect(model.cards[0]?.matchedAccounts).toBe(1)
  })
})

describe("the sparkline series", () => {
  it("carries one point per published period, oldest first", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })
    for (const closing of ["100.00", "300.00", "200.00"]) {
      await seedPredvaha(book, [{ code: "221", closing }])
    }

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)
    const series = model.cards[0]?.series ?? []

    expect(series.map((point) => point.closingBalance)).toEqual([
      "100.00",
      "300.00",
      "200.00",
    ])
    // The card's headline figure IS the last point.
    expect(model.cards[0]?.closingBalance).toBe("200.00")
    // Plot coordinates, computed by Postgres between the series' own low/high.
    expect(series.map((point) => point.plotRatio)).toEqual([0, 1, 0.5])
  })

  it("leaves a gap for a period the předvaha does not carry the account in", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })
    await seedPredvaha(book, [{ code: "221", closing: "10.00" }])
    // The office published this period, but without the account at all.
    await seedPredvaha(book, [{ code: "311", closing: "99.00" }])
    await seedPredvaha(book, [{ code: "221", closing: "30.00" }])

    const scope = await scopeOf(book)
    const series = (await accountBalancesForScope(scope)).cards[0]?.series ?? []

    expect(series).toHaveLength(3)
    expect(series.map((point) => point.closingBalance)).toEqual([
      "10.00",
      null,
      "30.00",
    ])
    // A gap is a gap: no coordinate, so the renderer draws no segment through
    // it rather than interpolating a number nobody stated.
    expect(series[1]?.plotRatio).toBeNull()
    expect(series[1]?.matchedAccounts).toBe(0)
  })

  it("gives a series that never moves no coordinate at all", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })
    await seedPredvaha(book, [{ code: "221", closing: "42.00" }])
    await seedPredvaha(book, [{ code: "221", closing: "42.00" }])

    const scope = await scopeOf(book)
    const series = (await accountBalancesForScope(scope)).cards[0]?.series ?? []

    // There is no "between" on a flat line; the renderer centres it.
    expect(series.map((point) => point.plotRatio)).toEqual([null, null])
  })

  it("caps the series at twelve periods, keeping the newest", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })
    // Fourteen distinct months, oldest first — more than a year, so the cap is
    // exercised across a year boundary rather than inside one.
    for (let index = 0; index < 14; index += 1) {
      const periodId = await createReportingPeriod(book.organizationId, {
        kind: "month",
        year: 2025 + Math.floor(index / 12),
        month: (index % 12) + 1,
      })
      await seedPredvaha(book, [{ code: "221", closing: `${index}.00` }], {
        periodId,
      })
    }

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)
    const series = model.cards[0]?.series ?? []

    expect(series).toHaveLength(12)
    expect(series[0]?.closingBalance).toBe("2.00")
    expect(series.at(-1)?.closingBalance).toBe("13.00")
    expect(model.cards[0]?.closingBalance).toBe("13.00")
  })
})

describe("the page total", () => {
  it("is a SQL sum over the current period's card balances", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221",
      kind: "bank",
    })
    await createAccountMappingRow(book.organizationId, {
      accountCode: "211",
      kind: "cash",
      sortOrder: 1,
    })
    await seedPredvaha(book, [
      { code: "221", closing: "150000.00" },
      { code: "211", closing: "4200.50" },
    ])

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(model.total).toBe("154200.50")
    expect(model.cards.map((card) => card.kind)).toEqual(["bank", "cash"])
  })

  it("counts only the CURRENT period, not the history", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })
    await seedPredvaha(book, [{ code: "221", closing: "1000.00" }])
    await seedPredvaha(book, [{ code: "221", closing: "7.00" }])

    const scope = await scopeOf(book)
    expect((await accountBalancesForScope(scope)).total).toBe("7.00")
  })

  it("excludes a retired mapping from the cards and from the total", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })
    await createAccountMappingRow(book.organizationId, {
      accountCode: "211",
      active: false,
    })
    await seedPredvaha(book, [
      { code: "221", closing: "100.00" },
      { code: "211", closing: "900.00" },
    ])

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(model.cards.map((card) => card.accountCode)).toEqual(["221"])
    expect(model.total).toBe("100.00")
  })
})

describe("the read model ships nothing a client may not see", () => {
  it("carries no forbidden column, in any spelling", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, { accountCode: "221" })
    await seedPredvaha(book, [{ code: "221", closing: "1.00" }])

    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    expect(forbiddenClientKeys(model)).toEqual([])
    expect(forbiddenClientKeys(await accountMappingsForScope(scope))).toEqual(
      [],
    )
  })

  it("ships no Czech display string — the words live in the label map", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221",
      label: "Fio",
    })
    const scope = await scopeOf(book)
    const model = await accountBalancesForScope(scope)

    // The office's own label is the ONE piece of Czech here, and it is the
    // office's words rather than this layer's.
    expect(model.cards[0]?.kind).toBe("bank")
    expect(model.cards[0]?.matchKind).toBe("exact")
  })
})

describe("mapping writes", () => {
  it("creates, edits, retires and deletes", async () => {
    const book = await seedOrganization()
    const scope = await scopeOf(book)
    const owner = requireOwner(scope)

    const created = await createAccountMapping(owner, {
      accountCode: "221.01",
      label: "Fio běžný účet",
      kind: "bank",
    })

    expect(await accountMappingIdByCode(owner, "221.01")).toBe(created.id)

    expect(
      await updateAccountMapping(owner, created.id, {
        label: "Fio CZK",
        sortOrder: 3,
        active: false,
      }),
    ).toBe(true)

    const [retired] = await accountMappingsForScope(owner, {
      includeInactive: true,
    })
    expect(retired).toMatchObject({
      label: "Fio CZK",
      sortOrder: 3,
      active: false,
    })
    // A retired entry is invisible to every client read.
    expect(await accountMappingsForScope(owner)).toEqual([])

    expect(await deleteAccountMappings(owner, [created.id])).toBe(1)
    expect(await accountMappingIdByCode(owner, "221.01")).toBeNull()
  })

  it("orders by the office's own sort order, then label, then code", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "211",
      label: "Pokladna",
      kind: "cash",
      sortOrder: 5,
    })
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221.02",
      label: "ČSOB",
      sortOrder: 1,
    })
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221.01",
      label: "Air Bank",
      sortOrder: 1,
    })

    const scope = await scopeOf(book)
    expect(
      (await accountMappingsForScope(scope)).map((row) => row.accountCode),
    ).toEqual(["221.01", "221.02", "211"])
  })

  it("never reaches another book's rows", async () => {
    const theirs = await seedOrganization()
    const theirId = await createAccountMappingRow(theirs.organizationId, {
      accountCode: "221",
    })

    const scope = await scopeOf(org)
    const owner = requireOwner(scope)

    // An id from another book is simply not there — the same non-oracle answer
    // the whole seam gives.
    expect(await accountMappingIdByCode(owner, "221")).toBeNull()
    expect(await updateAccountMapping(owner, theirId, { label: "Mine" })).toBe(
      false,
    )
    expect(await deleteAccountMappings(owner, [theirId])).toBe(0)

    const theirScope = await scopeOf(theirs)
    const [survivor] = await accountMappingsForScope(theirScope)
    expect(survivor?.label).toBe("Běžný účet")
  })

  it("refuses to state an account twice, and refuses an overlap", async () => {
    const book = await seedOrganization()
    const owner = requireOwner(await scopeOf(book))

    await createAccountMapping(owner, {
      accountCode: "221.01",
      label: "Fio",
      kind: "bank",
    })

    await expect(
      createAccountMapping(owner, {
        accountCode: "221.01",
        label: "Znovu",
        kind: "bank",
      }),
    ).rejects.toThrow()

    await expect(
      createAccountMapping(owner, {
        accountCode: "221",
        matchKind: "prefix",
        label: "Vše",
        kind: "bank",
      }),
    ).rejects.toThrow()
  })

  it("patches nothing when the patch is empty", async () => {
    const book = await seedOrganization()
    const owner = requireOwner(await scopeOf(book))
    const created = await createAccountMapping(owner, {
      accountCode: "221",
      label: "Banka",
      kind: "bank",
    })

    expect(await updateAccountMapping(owner, created.id, {})).toBe(true)
    const [row] = await accountMappingsForScope(owner)
    expect(row?.label).toBe("Banka")
  })
})
