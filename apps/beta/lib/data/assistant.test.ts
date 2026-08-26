/**
 * Asistent data — chats, transcripts and the budget ledger, against a real
 * Postgres 18.
 *
 * Three contracts, none of which any other suite in this app covers:
 *
 *   1. CROSS-ORG ISOLATION, the standard one every org-scoped module proves.
 *   2. CROSS-USER ISOLATION WITHIN ONE ORG, which is new here. A chat is
 *      private to the person who typed it, so an admin and a member in the same
 *      book must be unable to read, rename, delete or append to each other's
 *      conversations — and must not be able to tell whether they exist.
 *   3. THE BUDGET, including the property that matters most: the daily
 *      allowance is enforced by an atomic increment, so N concurrent turns
 *      cannot all pass a check that only N-of-them-minus-one should.
 *
 * The env gate is exercised too: `assistantVisibleTo` is what the rail, the
 * pages, the actions and the route all consult, and it must be false with the
 * flag unset no matter which role asks.
 */
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { betaDb } from "@/db/client"
import { chat, chat_message, chat_usage } from "@/db/schema"

import {
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope } = await import("./scope")
const {
  appendChatMessage,
  assertAssistantAvailable,
  assistantOrgFacts,
  assistantVisibleTo,
  chatForScope,
  chatHistoryForTurn,
  chatOwnedByScope,
  chatRetentionCutoff,
  chatsForScope,
  createChat,
  deleteChat,
  purgeExpiredChats,
  recordAssistantUsage,
  renameChat,
  reserveAssistantTurn,
} = await import("./assistant")
const { forbiddenClientKeys } = await import("./projections")

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

/**
 * Assert that a database trigger or constraint refused the write, BY NAME.
 *
 * Drizzle wraps the driver error, so `rejects.toThrow(/…/)` only ever sees
 * "Failed query: …". Mirrors the helper of the same name in
 * `filings.test.ts` / `assets.test.ts`: walk the `cause` chain and match the
 * joined messages.
 */
async function expectConstraintRefusal(
  run: () => Promise<unknown>,
  constraint: RegExp,
): Promise<void> {
  let messages = "<no throw>"
  try {
    await run()
  } catch (error) {
    const chain: string[] = []
    let current: unknown = error
    for (let depth = 0; current && depth < 5; depth++) {
      chain.push(String((current as { message?: unknown }).message ?? current))
      current = (current as { cause?: unknown }).cause
    }
    messages = chain.join("\n")
  }
  expect(messages).toMatch(constraint)
}

async function scopeFor(
  org: TestOrganization,
  role: "owner" | "admin" | "member" | "guest",
) {
  as(org.members[role].headers)
  return requireScope(org.slug)
}

/** The surface flag is process-wide; every test that needs it on says so. */
function enableSurface(): void {
  vi.stubEnv("BETA_ASSISTANT_ENABLED", "true")
}

/**
 * One shared book for the gate cases, which do not write anything. Every test
 * that WRITES seeds its own book instead: the `db` project shares one database
 * across files, so a suite that leaned on shared rows would be asserting about
 * whatever ran before it.
 */
let orgA: TestOrganization

beforeAll(async () => {
  orgA = await seedOrganization()
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await endFixtures()
})

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe("assistantVisibleTo — the dark-launch gate and the role rule", () => {
  it("is false for every role while the flag is unset", async () => {
    vi.stubEnv("BETA_ASSISTANT_ENABLED", "")

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      const scope = await scopeFor(orgA, role)
      expect(assistantVisibleTo(scope), role).toBe(false)
    }

    vi.unstubAllEnvs()
  })

  it("admits owner, admin and member once the flag is on", async () => {
    enableSurface()

    for (const role of ["owner", "admin", "member"] as const) {
      const scope = await scopeFor(orgA, role)
      expect(assistantVisibleTo(scope), role).toBe(true)
    }

    vi.unstubAllEnvs()
  })

  it("never admits guest — spec §5, which is also the employee seat", async () => {
    enableSurface()
    const guest = await scopeFor(orgA, "guest")

    expect(assistantVisibleTo(guest)).toBe(false)
    expect(() => assertAssistantAvailable(guest)).toThrowError(
      expect.objectContaining({ digest: NOT_FOUND_DIGEST }),
    )

    vi.unstubAllEnvs()
  })

  it("refuses a disabled surface and a forbidden role identically", async () => {
    enableSurface()
    const guest = await scopeFor(orgA, "guest")
    let guestDigest: unknown
    try {
      assertAssistantAvailable(guest)
    } catch (error) {
      guestDigest = (error as { digest?: unknown }).digest
    }
    vi.unstubAllEnvs()

    vi.stubEnv("BETA_ASSISTANT_ENABLED", "")
    const owner = await scopeFor(orgA, "owner")
    let disabledDigest: unknown
    try {
      assertAssistantAvailable(owner)
    } catch (error) {
      disabledDigest = (error as { digest?: unknown }).digest
    }
    vi.unstubAllEnvs()

    expect(guestDigest).toBe(NOT_FOUND_DIGEST)
    expect(disabledDigest).toBe(NOT_FOUND_DIGEST)
  })
})

// ---------------------------------------------------------------------------
// The org-facts fence
// ---------------------------------------------------------------------------

describe("assistantOrgFacts — the two-fact allowlist", () => {
  it("returns exactly the name and the VAT regime", async () => {
    const org = await seedOrganization({ vatRegime: "platce" })
    const facts = await assistantOrgFacts(await scopeFor(org, "owner"))

    expect(Object.keys(facts).sort()).toEqual(["legalName", "vatRegime"])
    expect(facts.vatRegime).toBe("platce")
    expect(facts.legalName.length).toBeGreaterThan(0)
  })

  it("carries no forbidden client column", async () => {
    const facts = await assistantOrgFacts(await scopeFor(orgA, "owner"))

    expect(forbiddenClientKeys(facts)).toEqual([])
  })

  it("reads the caller's own book, never another", async () => {
    // `seedOrganization` gives every book the same legal name, so the VAT
    // regime is what tells the two answers apart here.
    const platce = await seedOrganization({ vatRegime: "platce" })
    const neplatce = await seedOrganization({ vatRegime: "neplatce" })

    expect(
      (await assistantOrgFacts(await scopeFor(platce, "owner"))).vatRegime,
    ).toBe("platce")
    expect(
      (await assistantOrgFacts(await scopeFor(neplatce, "owner"))).vatRegime,
    ).toBe("neplatce")
  })
})

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------

describe("chats — cross-org isolation", () => {
  it("never lists another book's chats", async () => {
    const home = await seedOrganization()
    const other = await seedOrganization()
    await createChat(await scopeFor(home, "owner"))

    const listed = await chatsForScope(await scopeFor(other, "owner"))

    expect(listed).toHaveLength(0)
  })

  it("answers null for a chat id from another book", async () => {
    const home = await seedOrganization()
    const other = await seedOrganization()
    const created = await createChat(await scopeFor(home, "owner"))

    expect(
      await chatForScope(await scopeFor(other, "owner"), created.id),
    ).toBeNull()
  })
})

describe("chats — cross-user isolation inside one book", () => {
  it("lists only the caller's own chats", async () => {
    const org = await seedOrganization()
    await createChat(await scopeFor(org, "admin"))

    expect(await chatsForScope(await scopeFor(org, "admin"))).toHaveLength(1)
    expect(await chatsForScope(await scopeFor(org, "member"))).toHaveLength(0)
    expect(await chatsForScope(await scopeFor(org, "owner"))).toHaveLength(0)
  })

  it("hides a colleague's chat behind the same null as a missing one", async () => {
    const org = await seedOrganization()
    const created = await createChat(await scopeFor(org, "admin"))
    const colleague = await scopeFor(org, "member")

    expect(await chatForScope(colleague, created.id)).toBeNull()
    expect(await chatOwnedByScope(colleague, created.id)).toBe(false)
    expect(
      await chatForScope(colleague, "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6"),
    ).toBeNull()
  })

  it("refuses a colleague's rename, delete and append", async () => {
    const org = await seedOrganization()
    const created = await createChat(await scopeFor(org, "admin"))
    const colleague = await scopeFor(org, "member")

    expect(await renameChat(colleague, created.id, "Cizí")).toBe(false)
    expect(
      await appendChatMessage(colleague, created.id, {
        role: "user",
        content: "cizí dotaz",
      }),
    ).toBe(false)
    expect(await deleteChat(colleague, created.id)).toBe(false)

    // …and the owner's chat is untouched by any of the three.
    const mine = await chatForScope(await scopeFor(org, "admin"), created.id)
    expect(mine?.chat.title).toBeNull()
    expect(mine?.messages).toHaveLength(0)
  })
})

describe("chats — lifecycle", () => {
  it("stamps the prompt version at creation", async () => {
    const org = await seedOrganization()
    const created = await createChat(await scopeFor(org, "owner"))

    const [row] = await betaDb()
      .select({ version: chat.prompt_version })
      .from(chat)
      .where(eq(chat.id, created.id))

    expect(row?.version).toMatch(/^\d{4}-\d{2}-\d{2}\./)
  })

  it("leaves an unnamed chat NULL rather than storing UI copy", async () => {
    const org = await seedOrganization()
    const created = await createChat(await scopeFor(org, "owner"))

    expect(created.title).toBeNull()
  })

  it("renames, and clears the name again on a blank title", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const created = await createChat(scope)

    expect(await renameChat(scope, created.id, "  DPH u staveb  ")).toBe(true)
    expect((await chatForScope(scope, created.id))?.chat.title).toBe(
      "DPH u staveb",
    )

    expect(await renameChat(scope, created.id, "   ")).toBe(true)
    expect((await chatForScope(scope, created.id))?.chat.title).toBeNull()
  })

  it("refuses a title past the column's own limit", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const created = await createChat(scope)

    expect(await renameChat(scope, created.id, "x".repeat(121))).toBe(false)
  })

  it("cascades the transcript away with the chat", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const created = await createChat(scope)
    await appendChatMessage(scope, created.id, {
      role: "user",
      content: "dotaz",
    })

    expect(await deleteChat(scope, created.id)).toBe(true)
    const left = await betaDb()
      .select({ id: chat_message.id })
      .from(chat_message)
      .where(eq(chat_message.chat_id, created.id))
    expect(left).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

describe("the transcript", () => {
  it("appends in order and bumps the chat's retention stamp", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const created = await createChat(scope)
    const createdAt = new Date(created.updatedAt)

    await appendChatMessage(scope, created.id, {
      role: "user",
      content: "Jak funguje DPH?",
    })
    await appendChatMessage(scope, created.id, {
      role: "assistant",
      content: "Obecně platí…",
    })

    const detail = await chatForScope(scope, created.id)
    expect(detail?.messages.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(new Date(detail!.chat.updatedAt).getTime()).toBeGreaterThanOrEqual(
      createdAt.getTime(),
    )
  })

  it("stores nothing for an empty or whitespace-only message", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const created = await createChat(scope)

    expect(
      await appendChatMessage(scope, created.id, {
        role: "user",
        content: "  ",
      }),
    ).toBe(false)
    expect((await chatForScope(scope, created.id))?.messages).toHaveLength(0)
  })

  it("is append-only at the database", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const created = await createChat(scope)
    await appendChatMessage(scope, created.id, {
      role: "assistant",
      content: "původní odpověď",
    })
    const detail = await chatForScope(scope, created.id)
    const messageId = detail!.messages[0]!.id

    await expectConstraintRefusal(
      () =>
        betaDb()
          .update(chat_message)
          .set({ content: "přepsaná odpověď" })
          .where(eq(chat_message.id, messageId)),
      /append-only/,
    )
  })

  it("truncates the replayed history to the configured window, oldest first", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const created = await createChat(scope)

    for (let i = 0; i < 8; i += 1) {
      await appendChatMessage(scope, created.id, {
        role: i % 2 === 0 ? "user" : "assistant",
        content: `zpráva ${i}`,
      })
    }

    const history = await chatHistoryForTurn(scope, created.id, 3)

    // The window of 3 lands on messages 5-7, and 5 is an assistant turn — so
    // the replay starts at 6, the first question inside the window. The
    // dedicated case below covers that rule on its own.
    expect(history.map((m) => m.content)).toEqual(["zpráva 6", "zpráva 7"])
  })

  it("never starts the replayed window on an assistant turn", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const created = await createChat(scope)

    await appendChatMessage(scope, created.id, {
      role: "user",
      content: "první dotaz",
    })
    await appendChatMessage(scope, created.id, {
      role: "assistant",
      content: "první odpověď",
    })
    await appendChatMessage(scope, created.id, {
      role: "user",
      content: "druhý dotaz",
    })

    // A window of 2 would cut between the first question and its answer; the
    // Messages API refuses a conversation that opens on an assistant turn.
    const history = await chatHistoryForTurn(scope, created.id, 2)

    expect(history[0]?.role).toBe("user")
    expect(history.map((m) => m.content)).toEqual(["druhý dotaz"])
  })

  it("replays nothing when the window holds no question at all", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const created = await createChat(scope)
    await appendChatMessage(scope, created.id, {
      role: "assistant",
      content: "osiřelá odpověď",
    })

    expect(await chatHistoryForTurn(scope, created.id, 20)).toEqual([])
  })

  it("replays nothing from another book's chat", async () => {
    const home = await seedOrganization()
    const other = await seedOrganization()
    const scope = await scopeFor(home, "owner")
    const created = await createChat(scope)
    await appendChatMessage(scope, created.id, {
      role: "user",
      content: "tajný dotaz",
    })

    expect(
      await chatHistoryForTurn(await scopeFor(other, "owner"), created.id, 20),
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

const GENEROUS = { userDailyMessages: 50, monthlyTokenBudget: 2_000_000 }

describe("reserveAssistantTurn — the daily allowance", () => {
  it("admits turns up to the ceiling and refuses the one past it", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const config = { userDailyMessages: 3, monthlyTokenBudget: 2_000_000 }

    for (let i = 0; i < 3; i += 1) {
      expect(await reserveAssistantTurn(scope, config), `turn ${i}`).toEqual({
        ok: true,
      })
    }

    expect(await reserveAssistantTurn(scope, config)).toEqual({
      ok: false,
      reason: "daily_limit",
    })
  })

  it("counts per user, not per organization", async () => {
    const org = await seedOrganization()
    const config = { userDailyMessages: 1, monthlyTokenBudget: 2_000_000 }

    expect(
      await reserveAssistantTurn(await scopeFor(org, "owner"), config),
    ).toEqual({ ok: true })
    // A different person in the same book still has their own allowance.
    expect(
      await reserveAssistantTurn(await scopeFor(org, "admin"), config),
    ).toEqual({ ok: true })
  })

  it("cannot be raced past the ceiling by concurrent turns", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const config = { userDailyMessages: 4, monthlyTokenBudget: 2_000_000 }

    const results = await Promise.all(
      Array.from({ length: 12 }, () => reserveAssistantTurn(scope, config)),
    )

    expect(results.filter((r) => r.ok)).toHaveLength(4)
    expect(results.filter((r) => !r.ok)).toHaveLength(8)
  })

  it("partitions by the Prague day", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const config = { userDailyMessages: 1, monthlyTokenBudget: 2_000_000 }

    // 23:30 UTC is already the next Prague day in winter.
    const before = new Date("2026-01-31T12:00:00Z")
    const after = new Date("2026-01-31T23:30:00Z")

    expect(await reserveAssistantTurn(scope, config, before)).toEqual({
      ok: true,
    })
    expect(await reserveAssistantTurn(scope, config, before)).toEqual({
      ok: false,
      reason: "daily_limit",
    })
    expect(await reserveAssistantTurn(scope, config, after)).toEqual({
      ok: true,
    })
  })
})

describe("the monthly token budget", () => {
  it("refuses once the month's recorded tokens reach the ceiling", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const now = new Date("2026-03-10T09:00:00Z")

    await recordAssistantUsage(
      scope,
      { inputTokens: 600, outputTokens: 400 },
      now,
    )

    expect(
      await reserveAssistantTurn(
        scope,
        { userDailyMessages: 50, monthlyTokenBudget: 1000 },
        now,
      ),
    ).toEqual({ ok: false, reason: "monthly_budget" })
  })

  it("refuses BEFORE consuming a daily slot", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const now = new Date("2026-03-10T09:00:00Z")
    await recordAssistantUsage(
      scope,
      { inputTokens: 5000, outputTokens: 0 },
      now,
    )

    await reserveAssistantTurn(
      scope,
      { userDailyMessages: 50, monthlyTokenBudget: 100 },
      now,
    )

    const [row] = await betaDb()
      .select({ count: chat_usage.message_count })
      .from(chat_usage)
      .where(eq(chat_usage.user_id, scope.userId))

    expect(row?.count).toBe(0)
  })

  it("is install-wide — another book's spend counts too", async () => {
    const spender = await seedOrganization()
    const other = await seedOrganization()
    const now = new Date("2026-04-10T09:00:00Z")

    await recordAssistantUsage(
      await scopeFor(spender, "owner"),
      { inputTokens: 900, outputTokens: 200 },
      now,
    )

    expect(
      await reserveAssistantTurn(
        await scopeFor(other, "owner"),
        { userDailyMessages: 50, monthlyTokenBudget: 1000 },
        now,
      ),
    ).toEqual({ ok: false, reason: "monthly_budget" })
  })

  it("starts over in the next month", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")

    await recordAssistantUsage(
      scope,
      { inputTokens: 9_000_000, outputTokens: 0 },
      new Date("2026-05-20T09:00:00Z"),
    )

    expect(
      await reserveAssistantTurn(
        scope,
        { userDailyMessages: 50, monthlyTokenBudget: 1000 },
        new Date("2026-06-01T09:00:00Z"),
      ),
    ).toEqual({ ok: true })
  })
})

describe("recordAssistantUsage", () => {
  it("accumulates rather than overwrites", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const now = new Date("2026-07-02T09:00:00Z")

    await recordAssistantUsage(scope, { inputTokens: 10, outputTokens: 3 }, now)
    await recordAssistantUsage(scope, { inputTokens: 7, outputTokens: 5 }, now)

    const [row] = await betaDb()
      .select({
        input: chat_usage.input_tokens,
        output: chat_usage.output_tokens,
        count: chat_usage.message_count,
      })
      .from(chat_usage)
      .where(eq(chat_usage.user_id, scope.userId))

    expect(row).toMatchObject({ input: 17, output: 8, count: 0 })
  })

  it("leaves the ledger alone when the provider reported nothing", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")

    await recordAssistantUsage(scope, { inputTokens: 0, outputTokens: 0 })

    const rows = await betaDb()
      .select({ id: chat_usage.user_id })
      .from(chat_usage)
      .where(eq(chat_usage.user_id, scope.userId))
    expect(rows).toHaveLength(0)
  })

  it("keeps the reserved message count while adding tokens", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const now = new Date("2026-07-03T09:00:00Z")

    await reserveAssistantTurn(scope, GENEROUS, now)
    await recordAssistantUsage(scope, { inputTokens: 40, outputTokens: 9 }, now)

    const [row] = await betaDb()
      .select({
        count: chat_usage.message_count,
        input: chat_usage.input_tokens,
      })
      .from(chat_usage)
      .where(eq(chat_usage.user_id, scope.userId))

    expect(row).toMatchObject({ count: 1, input: 40 })
  })
})

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

describe("purgeExpiredChats — the 12-month retention", () => {
  it("computes a cutoff twelve months back", () => {
    expect(
      chatRetentionCutoff(new Date("2026-08-26T00:00:00Z")).toISOString(),
    ).toBe("2025-08-26T00:00:00.000Z")
  })

  it("deletes only what the window has passed, with its transcript", async () => {
    const org = await seedOrganization()
    const scope = await scopeFor(org, "owner")
    const fresh = await createChat(scope)

    // The stale chat is INSERTED with an old stamp rather than created and then
    // aged: `chat_touch_updated_at` is a BEFORE UPDATE trigger, so any UPDATE
    // would put `now()` straight back — which is exactly the property that
    // makes `updated_at` a trustworthy retention key in production.
    const [stale] = await betaDb()
      .insert(chat)
      .values({
        organization_id: scope.organizationId,
        user_id: scope.userId,
        prompt_version: "2020-01-01.1",
        created_at: new Date("2020-01-01T00:00:00Z"),
        updated_at: new Date("2020-01-01T00:00:00Z"),
      })
      .returning({ id: chat.id })
    await betaDb().insert(chat_message).values({
      organization_id: scope.organizationId,
      chat_id: stale!.id,
      role: "user",
      content: "starý dotaz",
    })

    const purged = await purgeExpiredChats()

    expect(purged).toBeGreaterThanOrEqual(1)
    expect(await chatForScope(scope, stale!.id)).toBeNull()
    expect(await chatForScope(scope, fresh.id)).not.toBeNull()
    expect(
      await betaDb()
        .select({ id: chat_message.id })
        .from(chat_message)
        .where(eq(chat_message.chat_id, stale!.id)),
    ).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Identity guards
// ---------------------------------------------------------------------------

describe("the database's own identity guards", () => {
  it("refuses to move a chat to another book", async () => {
    const org = await seedOrganization()
    const other = await seedOrganization()
    const created = await createChat(await scopeFor(org, "owner"))

    await expectConstraintRefusal(
      () =>
        betaDb()
          .update(chat)
          .set({ organization_id: other.organizationId })
          .where(eq(chat.id, created.id)),
      /organization_id is immutable/,
    )
  })

  it("refuses to hand a chat to another person", async () => {
    const org = await seedOrganization()
    const created = await createChat(await scopeFor(org, "admin"))

    await expectConstraintRefusal(
      () =>
        betaDb()
          .update(chat)
          .set({ user_id: org.members.member.userId })
          .where(eq(chat.id, created.id)),
      /user_id is immutable/,
    )
  })
})
