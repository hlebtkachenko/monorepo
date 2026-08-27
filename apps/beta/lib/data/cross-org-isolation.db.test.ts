/**
 * TENANCY-SUITE COMPLETION — the cross-org cases migrations 0016-0019 shipped
 * without.
 *
 * Beta's tenant separation is an application property, not a database one:
 * there is no RLS here, only scope brands and composite `(id, organization_id)`
 * foreign keys. That makes a per-function cross-org test the enforcement rather
 * than a nicety — an `eq(x.organization_id, scope.organizationId)` that somebody
 * drops in a refactor fails nothing unless a test is standing on it.
 *
 * An audit of the existing suites found the coverage genuinely good and six
 * specific holes, each of which is a conjunct in a real WHERE clause that no
 * assertion touches. They are collected here rather than sprinkled across five
 * files ON PURPOSE, and the reason is mechanical: three other lanes are editing
 * `payroll`, `imports` and the agent surface in parallel, and a shared file is
 * a rebase conflict per lane. The cases below name the function and the file
 * they belong to, so they can be folded home once the tree is quiet.
 *
 * WHAT MAKES THE CHAT CASES SHARP. `renameChat` / `deleteChat` /
 * `appendChatMessage` filter on BOTH `organization_id` and `user_id`, and the
 * existing suite only ever varies the user — so the org conjunct has never been
 * the thing that refused anything, and deleting it would have broken no test.
 * These cases put the SAME PERSON in two books, which is the only shape that
 * isolates the org arm: the user matches, so a refusal can only come from the
 * organization.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import postgres from "postgres"

import {
  addMembership,
  createImportBatchRow,
  createMonthPeriod,
  createPayrollEmployeeRow,
  createPayrollSummaryRow,
  endFixtures,
  publishPayrollFixture,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"
import { sharedDatabaseUrl } from "../../tests/scratch-db"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope } = await import("./scope")
const { payrollLinesForPeriod, publishedPayrollPeriods } =
  await import("./payroll")
const {
  appendChatMessage,
  chatForScope,
  chatHistoryForTurn,
  createChat,
  deleteChat,
  renameChat,
} = await import("./assistant")

let sql: ReturnType<typeof postgres>
let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })
  ;[orgA, orgB] = await Promise.all([seedOrganization(), seedOrganization()])
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

async function scopeAs(
  org: TestOrganization,
  role: "owner" | "admin" | "member" | "guest",
) {
  request.headers = org.members[role].headers
  return requireScope(org.slug)
}

/** A fresh year per call, so two suites' periods never collide. */
let yearCursor = 2031
const freshYear = (): number => (yearCursor += 1)

// ---------------------------------------------------------------------------
// payroll.ts — the two reads with no cross-org case
// ---------------------------------------------------------------------------

describe("payrollLinesForPeriod — lib/data/payroll.ts", () => {
  it("answers [] for a period id from another book", async () => {
    // The sibling read `payrollSummaryForPeriod` HAS this case
    // (`payroll.test.ts`); this one does not, and both take a bare period id
    // from a caller that got it from a URL.
    const theirPeriod = await createMonthPeriod(
      orgB.organizationId,
      freshYear(),
    )
    const theirEmployee = await createPayrollEmployeeRow(orgB.organizationId)
    await publishPayrollFixture(orgB.organizationId, theirPeriod, {
      lines: [{ employeeId: theirEmployee }],
    })

    // B really does have lines there — otherwise A's empty answer proves
    // nothing at all.
    expect(
      await payrollLinesForPeriod(await scopeAs(orgB, "owner"), theirPeriod),
    ).not.toEqual([])

    expect(
      await payrollLinesForPeriod(await scopeAs(orgA, "owner"), theirPeriod),
    ).toEqual([])
  })
})

describe("publishedPayrollPeriods — lib/data/payroll.ts", () => {
  it("never carries another book's published months", async () => {
    const theirPeriod = await createMonthPeriod(
      orgB.organizationId,
      freshYear(),
    )
    await publishPayrollFixture(orgB.organizationId, theirPeriod)

    expect(
      (await publishedPayrollPeriods(await scopeAs(orgB, "owner"))).map(
        (period) => period.id,
      ),
    ).toContain(theirPeriod)

    expect(
      (await publishedPayrollPeriods(await scopeAs(orgA, "owner"))).map(
        (period) => period.id,
      ),
    ).not.toContain(theirPeriod)
  })
})

// ---------------------------------------------------------------------------
// assistant.ts — the org conjunct, isolated from the user conjunct
// ---------------------------------------------------------------------------

describe("chat writes — lib/data/assistant.ts", () => {
  /**
   * One human, two books. Every case below runs as THAT person in book A
   * against a chat they really do own in book B, so `user_id` matches and only
   * `organization_id` can refuse.
   */
  const traveller = () => orgA.members.member

  beforeAll(async () => {
    await addMembership(orgB.organizationId, traveller().userId, "member")
  })

  async function twoBookChat(): Promise<{
    inA: Awaited<ReturnType<typeof requireScope>>
    chatInB: string
  }> {
    request.headers = traveller().headers
    const inB = await requireScope(orgB.slug)
    const chat = await createChat(inB)

    request.headers = traveller().headers
    return { inA: await requireScope(orgA.slug), chatInB: chat.id }
  }

  it("refuses a rename of the SAME user's chat in another book", async () => {
    const { inA, chatInB } = await twoBookChat()
    expect(await renameChat(inA, chatInB, "přejmenováno odjinud")).toBe(false)
  })

  it("refuses an append to the SAME user's chat in another book", async () => {
    const { inA, chatInB } = await twoBookChat()
    // Refuses by returning false, not by throwing — the same non-oracle answer
    // an invented chat id gets, so a caller cannot tell "not yours" from "does
    // not exist".
    expect(
      await appendChatMessage(inA, chatInB, {
        role: "user",
        content: "zpráva z jiné knihy",
      }),
    ).toBe(false)

    // And nothing landed in the transcript the owning book reads.
    request.headers = traveller().headers
    const inB = await requireScope(orgB.slug)
    expect(await chatHistoryForTurn(inB, chatInB, 20)).toEqual([])
  })

  it("refuses a delete of the SAME user's chat in another book", async () => {
    const { inA, chatInB } = await twoBookChat()
    expect(await deleteChat(inA, chatInB)).toBe(false)

    // And it is still there, read from the book that owns it.
    request.headers = traveller().headers
    const inB = await requireScope(orgB.slug)
    expect(await chatForScope(inB, chatInB)).not.toBeNull()
  })

  it("replays nothing from a chat in another book", async () => {
    const { inA, chatInB } = await twoBookChat()
    expect(await chatHistoryForTurn(inA, chatInB, 20)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Database level — the composite FK and the identity freeze that 0018 shipped
// with no test at all
// ---------------------------------------------------------------------------

describe("0018 — chat_message_chat_fk", () => {
  it("refuses a message pointing at a chat in another organization", async () => {
    // The composite FK is `(chat_id, organization_id) → chat (id,
    // organization_id)`. `db/payroll.test.ts` exercises all three of 0016's
    // composite FKs this way; 0018's had no equivalent, because there is no
    // db/assistant.test.ts.
    const inB = await (async () => {
      request.headers = orgB.members.member.headers
      return requireScope(orgB.slug)
    })()
    const theirChat = await createChat(inB)

    await expect(
      sql`
        INSERT INTO chat_message (organization_id, chat_id, role, content)
        VALUES (${orgA.organizationId}, ${theirChat.id}, 'user', 'ukradeno')
      `,
    ).rejects.toThrow(/chat_message_chat_fk|foreign key/i)
  })

  it("refuses to move a message to another organization", async () => {
    request.headers = orgB.members.member.headers
    const inB = await requireScope(orgB.slug)
    const chat = await createChat(inB)
    await appendChatMessage(inB, chat.id, { role: "user", content: "ahoj" })

    await expect(
      sql`
        UPDATE chat_message
           SET organization_id = ${orgA.organizationId}
         WHERE chat_id = ${chat.id}
      `,
    ).rejects.toThrow()
  })
})

describe("0018 — chat_usage identity freeze", () => {
  it("refuses to re-attribute a usage row to another organization", async () => {
    // `beta_chat_usage_freeze_identity` guards the tenancy tuple that IS the
    // primary key. The chat identity freeze beside it is tested; this one was
    // not.
    const usageDate = "2031-04-01"
    await sql`
      INSERT INTO chat_usage (organization_id, user_id, usage_date, input_tokens, output_tokens)
      VALUES (${orgB.organizationId}, ${orgB.members.member.userId}, ${usageDate}, 10, 5)
    `

    await expect(
      sql`
        UPDATE chat_usage
           SET organization_id = ${orgA.organizationId}
         WHERE organization_id = ${orgB.organizationId}
           AND user_id = ${orgB.members.member.userId}
           AND usage_date = ${usageDate}
      `,
    ).rejects.toThrow()
  })
})

describe("0016 — payroll_summary_batch_fk", () => {
  it("refuses a summary whose batch belongs to another organization", async () => {
    // `db/payroll.test.ts` covers this composite FK for
    // `payroll_employee_line` and not for `payroll_summary`, though both carry
    // the same `(import_batch_id, organization_id)` reference.
    const theirBatch = await createImportBatchRow(
      orgB.organizationId,
      await createMonthPeriod(orgB.organizationId, freshYear()),
      { dataset: "payroll" },
    )
    const ourPeriod = await createMonthPeriod(orgA.organizationId, freshYear())

    await expect(
      createPayrollSummaryRow(orgA.organizationId, theirBatch, ourPeriod),
    ).rejects.toThrow()
  })
})
