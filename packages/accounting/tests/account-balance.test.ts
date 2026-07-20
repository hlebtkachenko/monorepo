/**
 * accountBalance — a single GL account's read-model balance by number + period.
 * The primitive a Finance financial_account reads for its own balance (via its
 * gl_account_number). Seeds a read-model row directly (the trigger that maintains
 * account_period_balance is covered elsewhere; this proves the lookup + the
 * no-row → null contract).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import { accountBalance } from "../src/index"
import type { DoubleEntrySeed } from "./fixtures"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures"

let admin: ReturnType<typeof adminClient>
let orgA: string
let workspaceId: string
let userId: string
let seed: DoubleEntrySeed

beforeAll(async () => {
  admin = adminClient()
  const s = await seedTwoOrganizations(admin)
  orgA = s.orgAId
  workspaceId = s.workspaceId
  userId = s.userAId
  seed = await seedDoubleEntryOrg(orgA, workspaceId, userId)

  // počáteční 1000, obrat MD 500 / Dal 200 → konečný 1300 (closing is GENERATED).
  await admin`
    INSERT INTO account_period_balance
      (organization_id, period_id, account_id, opening_balance, turnover_debit, turnover_credit)
    VALUES
      (${orgA}::uuid, ${seed.periodId}::uuid, ${seed.accounts["221"]}::uuid, 1000, 500, 200)
  `
})

afterAll(async () => {
  await admin.end({ timeout: 5 })
})

describe("accountBalance", () => {
  it("returns a single account's read-model balance by number + period", async () => {
    const row = await withOrganization(orgA, userId, (db) =>
      accountBalance(db, { accountNumber: "221", periodId: seed.periodId }),
    )
    expect(row).not.toBeNull()
    expect(row).toMatchObject({
      account_id: seed.accounts["221"],
      account_number: "221",
      opening_balance: "1000.0000",
      turnover_debit: "500.0000",
      turnover_credit: "200.0000",
      closing_balance: "1300.0000",
    })
  })

  it("returns null for an account with no balance row in the period", async () => {
    const row = await withOrganization(orgA, userId, (db) =>
      accountBalance(db, { accountNumber: "999", periodId: seed.periodId }),
    )
    expect(row).toBeNull()
  })
})
