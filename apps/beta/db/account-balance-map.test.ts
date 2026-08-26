/**
 * The database's own rules for `account_balance_map` (migration 0014).
 *
 * WHY THESE ARE ASSERTED AT THE DATABASE AND NOT ONLY THROUGH THE ACTIONS.
 * Three callers write this table — the Zadávání form, the ingestion API, and
 * whatever lands next — and the rule that matters most (no two entries may
 * claim the same účet) is what makes Finance › Účty a hotovost's "celkem" a sum
 * over disjoint sets rather than a double count. A rule enforced only in a form
 * reader is a rule the next writer does not have.
 */
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  createAccountMappingRow,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../tests/fixtures"
import { sharedDatabaseUrl } from "../tests/scratch-db"

const sql = postgres(sharedDatabaseUrl(), { max: 2, onnotice: () => {} })

let org: TestOrganization
let other: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
  other = await seedOrganization()
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

async function refuses(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    return (error as { message?: string }).message ?? String(error)
  }
  throw new Error("expected the database to refuse this write")
}

describe("account_balance_map — shape", () => {
  it("refuses a blank label and a padded account code", async () => {
    expect(
      await refuses(() =>
        createAccountMappingRow(org.organizationId, {
          accountCode: "700",
          label: "   ",
        }),
      ),
    ).toContain("account_balance_map_label_present")

    expect(
      await refuses(() =>
        createAccountMappingRow(org.organizationId, {
          accountCode: " 701 ",
        }),
      ),
    ).toContain("account_balance_map_account_code_shape")
  })

  it("refuses a sort order outside the curated range", async () => {
    expect(
      await refuses(() =>
        createAccountMappingRow(org.organizationId, {
          accountCode: "702",
          sortOrder: 1000,
        }),
      ),
    ).toContain("account_balance_map_sort_order_range")
  })

  it("accepts an analytic code with separators — a real rozvrh spells them", async () => {
    // The column is deliberately NOT constrained to digits: "343.01" and
    // "221_02" are real Czech účty, and a validator that guessed wrong would
    // refuse a real client's real předvaha at month end.
    for (const accountCode of ["221.01", "221_02", "311100"]) {
      await expect(
        createAccountMappingRow(org.organizationId, { accountCode }),
      ).resolves.toBeTruthy()
    }
  })
})

describe("account_balance_map — one entry per účet", () => {
  it("refuses the same code twice in one book, and allows it in another", async () => {
    await createAccountMappingRow(org.organizationId, { accountCode: "261" })

    expect(
      await refuses(() =>
        createAccountMappingRow(org.organizationId, { accountCode: "261" }),
      ),
    ).toContain("account_balance_map_account_idx")

    // Two books' rozvrhy are two documents; the same code in each is normal.
    await expect(
      createAccountMappingRow(other.organizationId, { accountCode: "261" }),
    ).resolves.toBeTruthy()
  })
})

describe("account_balance_map — the overlap rule", () => {
  it("refuses a prefix entry that swallows an existing exact one", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221.01",
      matchKind: "exact",
    })

    expect(
      await refuses(() =>
        createAccountMappingRow(book.organizationId, {
          accountCode: "221",
          matchKind: "prefix",
        }),
      ),
    ).toContain("overlaps the existing mapping")
  })

  it("refuses an exact entry that an existing prefix already claims", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221",
      matchKind: "prefix",
    })

    expect(
      await refuses(() =>
        createAccountMappingRow(book.organizationId, {
          accountCode: "221.02",
          matchKind: "exact",
        }),
      ),
    ).toContain("overlaps the existing mapping")
  })

  it("refuses one prefix nested inside another", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221",
      matchKind: "prefix",
    })

    expect(
      await refuses(() =>
        createAccountMappingRow(book.organizationId, {
          accountCode: "221.9",
          matchKind: "prefix",
        }),
      ),
    ).toContain("overlaps the existing mapping")
  })

  it("allows two exact entries that merely share a prefix", async () => {
    // 221.01 and 221.02 are two distinct účty. Nothing about one being spelled
    // with the other's opening digits makes them the same money.
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221.01",
    })
    await expect(
      createAccountMappingRow(book.organizationId, { accountCode: "221.02" }),
    ).resolves.toBeTruthy()
  })

  it("ignores `active` — a retired overlap would re-arm the day it is switched on", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "211.01",
      active: false,
    })

    expect(
      await refuses(() =>
        createAccountMappingRow(book.organizationId, {
          accountCode: "211",
          matchKind: "prefix",
        }),
      ),
    ).toContain("overlaps the existing mapping")
  })

  it("fires on an UPDATE too, not only on an INSERT", async () => {
    const book = await seedOrganization()
    await createAccountMappingRow(book.organizationId, {
      accountCode: "221.01",
    })
    const second = await createAccountMappingRow(book.organizationId, {
      accountCode: "221",
      matchKind: "exact",
    })

    // Widening 221 from exact to prefix would swallow 221.01 — the mistake an
    // edit form makes, and the one an INSERT-only trigger would miss.
    expect(
      await refuses(
        () =>
          sql`UPDATE account_balance_map SET match_kind = 'prefix' WHERE id = ${second}`,
      ),
    ).toContain("overlaps the existing mapping")
  })

  it("lets an entry be edited without tripping over itself", async () => {
    const book = await seedOrganization()
    const id = await createAccountMappingRow(book.organizationId, {
      accountCode: "221",
      matchKind: "prefix",
    })
    await expect(
      sql`UPDATE account_balance_map SET friendly_label = 'Banka' WHERE id = ${id}`,
    ).resolves.toBeTruthy()
  })
})

describe("account_balance_map — tenancy", () => {
  it("refuses to move an entry to another book", async () => {
    const id = await createAccountMappingRow(org.organizationId, {
      accountCode: "213",
    })
    expect(
      await refuses(
        () =>
          sql`UPDATE account_balance_map SET organization_id = ${other.organizationId} WHERE id = ${id}`,
      ),
    ).toContain("organization_id is immutable")
  })

  it("cascades with the organization", async () => {
    const doomed = await seedOrganization()
    await createAccountMappingRow(doomed.organizationId, {
      accountCode: "221",
    })
    await sql`DELETE FROM organization WHERE id = ${doomed.organizationId}`
    const rows = await sql`
      SELECT 1 FROM account_balance_map
       WHERE organization_id = ${doomed.organizationId}
    `
    expect(rows).toHaveLength(0)
  })
})
