/**
 * The chat endpoint, driven as HTTP.
 *
 * The data layer's own suite (`lib/data/assistant.test.ts`) owns the tenancy
 * and budget rules; the provider's own suite owns the wire. This file owns the
 * things only a Response can express: the status code a client branches on, the
 * refusals that must be 404 rather than 403 or 401, the NDJSON frames the
 * component parses, and the fact that a refused turn NEVER reaches the
 * provider.
 *
 * THE PROVIDER IS MOCKED HERE — no key, no network, no cost. What is asserted
 * is our own orchestration around it: preflight order, what gets persisted, and
 * that reported usage lands in the ledger even when the turn then fails.
 */
import postgres from "postgres"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import {
  anonymousHeaders,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../tests/fixtures"
import { sharedDatabaseUrl } from "../../../../../tests/scratch-db"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

/**
 * The provider boundary, replaced wholesale. `turns` is the script the fake
 * plays back, one array of events per call.
 */
const provider = vi.hoisted(() => ({
  calls: [] as unknown[],
  script: [] as unknown[][],
}))

vi.mock("@/lib/assistant/provider", () => ({
  streamAssistantTurn: (...args: unknown[]) => {
    provider.calls.push(args[0])
    const events = provider.script.shift() ?? []
    return (async function* () {
      for (const event of events) yield event
    })()
  },
}))

const ORIGIN = "http://localhost:3200"

let route: typeof import("./route")
let assistant: typeof import("@/lib/data/assistant")
/**
 * A raw driver handle, not `betaDb()`: `db/client.ts` is import-fenced to the
 * data layer (`lib/data/db-client-fence.boundary.test.ts`), and a route's spec
 * is not the data layer. Used only to read back the ledger row the turn wrote.
 */
let sql: postgres.Sql

let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  process.env["BETTER_AUTH_URL"] ??= ORIGIN
  vi.stubEnv("BETA_ASSISTANT_ENABLED", "true")
  sql = postgres(sharedDatabaseUrl(), { max: 2, onnotice: () => {} })
  route = await import("./route")
  assistant = await import("@/lib/data/assistant")
  ;[orgA, orgB] = [await seedOrganization(), await seedOrganization()]
})

beforeEach(() => {
  provider.calls.length = 0
  provider.script.length = 0
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await sql.end({ timeout: 5 })
  await endFixtures()
})

function say(text: string, inputTokens = 100, outputTokens = 20): unknown[] {
  return [
    { type: "text", text },
    { type: "usage", inputTokens, outputTokens },
  ]
}

async function post(
  as: Headers,
  slug: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  request.headers = as

  return route.POST(
    new Request(`${ORIGIN}/api/orgs/${slug}/asistent`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        origin: ORIGIN,
        ...extraHeaders,
      },
    }),
    { params: Promise.resolve({ orgSlug: slug }) },
  )
}

/** Read the NDJSON body into its frames. */
async function frames(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text()
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

async function newChat(
  org: TestOrganization,
  role: "owner" | "admin" | "member" = "owner",
): Promise<string> {
  request.headers = org.members[role].headers
  const scope = await (await import("@/lib/data/scope")).requireScope(org.slug)
  return (await assistant.createChat(scope)).id
}

describe("refusals — everything that is not this caller's to reach", () => {
  it("answers 404 with no session", async () => {
    const chatId = await newChat(orgA)
    const response = await post(anonymousHeaders(), orgA.slug, {
      chatId,
      message: "Dobrý den",
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "not_found" })
    expect(provider.calls).toHaveLength(0)
  })

  it("answers 404 for another book's slug", async () => {
    const chatId = await newChat(orgA)
    const response = await post(orgA.members.owner.headers, orgB.slug, {
      chatId,
      message: "Dobrý den",
    })

    expect(response.status).toBe(404)
    expect(provider.calls).toHaveLength(0)
  })

  it("answers 404 for a guest — the same shape as a missing organization", async () => {
    const chatId = await newChat(orgA)
    const response = await post(orgA.members.guest.headers, orgA.slug, {
      chatId,
      message: "Dobrý den",
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "not_found" })
    expect(provider.calls).toHaveLength(0)
  })

  it("answers 404 while the surface flag is off, for a member who could otherwise use it", async () => {
    const chatId = await newChat(orgA)
    vi.stubEnv("BETA_ASSISTANT_ENABLED", "")

    const response = await post(orgA.members.owner.headers, orgA.slug, {
      chatId,
      message: "Dobrý den",
    })

    vi.stubEnv("BETA_ASSISTANT_ENABLED", "true")
    expect(response.status).toBe(404)
    expect(provider.calls).toHaveLength(0)
  })

  it("answers 404 for a colleague's chat", async () => {
    const org = await seedOrganization()
    const chatId = await newChat(org, "admin")

    const response = await post(org.members.member.headers, org.slug, {
      chatId,
      message: "Dobrý den",
    })

    expect(response.status).toBe(404)
    expect(provider.calls).toHaveLength(0)
  })

  it("answers 403 for a cross-site write", async () => {
    const chatId = await newChat(orgA)
    const response = await post(
      orgA.members.owner.headers,
      orgA.slug,
      { chatId, message: "Dobrý den" },
      { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "cross_site" })
  })
})

describe("the body this endpoint will accept", () => {
  it("refuses a body that names a tenant, in any spelling", async () => {
    const chatId = await newChat(orgA)

    for (const smuggled of [
      { chatId, message: "ahoj", organizationId: orgB.organizationId },
      { chatId, message: "ahoj", organization_id: orgB.organizationId },
      { chatId, message: "ahoj", userId: "someone" },
      { chatId, message: "ahoj", role: "owner" },
    ]) {
      const response = await post(
        orgA.members.owner.headers,
        orgA.slug,
        smuggled,
      )
      expect(response.status, JSON.stringify(smuggled)).toBe(400)
      expect(await response.json()).toEqual({
        error: "tenancy_keys_forbidden",
      })
    }
    expect(provider.calls).toHaveLength(0)
  })

  it("refuses malformed JSON, a missing field and an empty message", async () => {
    const chatId = await newChat(orgA)

    expect(
      (await post(orgA.members.owner.headers, orgA.slug, "{")).status,
    ).toBe(400)
    expect(
      (await post(orgA.members.owner.headers, orgA.slug, { chatId })).status,
    ).toBe(400)
    expect(
      (
        await post(orgA.members.owner.headers, orgA.slug, {
          chatId,
          message: "   ",
        })
      ).status,
    ).toBe(400)
    expect(provider.calls).toHaveLength(0)
  })

  it("refuses an over-long message with 413", async () => {
    const chatId = await newChat(orgA)
    const response = await post(orgA.members.owner.headers, orgA.slug, {
      chatId,
      message: "x".repeat(4001),
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: "message_too_long" })
    expect(provider.calls).toHaveLength(0)
  })
})

describe("the streamed turn", () => {
  it("streams deltas as NDJSON and stores both halves of the exchange", async () => {
    const org = await seedOrganization()
    const chatId = await newChat(org)
    provider.script.push(say("DPH je daň z přidané hodnoty."))

    const response = await post(org.members.owner.headers, org.slug, {
      chatId,
      message: "Co je DPH?",
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    )
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(await frames(response)).toEqual([
      { type: "delta", text: "DPH je daň z přidané hodnoty." },
      { type: "done" },
    ])

    request.headers = org.members.owner.headers
    const scope = await (
      await import("@/lib/data/scope")
    ).requireScope(org.slug)
    const detail = await assistant.chatForScope(scope, chatId)
    expect(detail?.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "Co je DPH?"],
      ["assistant", "DPH je daň z přidané hodnoty."],
    ])
  })

  it("sends the system prompt and the truncated history, and no tenant id", async () => {
    const org = await seedOrganization()
    const chatId = await newChat(org)
    provider.script.push(say("Ano."))

    await post(org.members.owner.headers, org.slug, {
      chatId,
      message: "Jsme plátci DPH?",
    })

    const sent = provider.calls[0] as {
      system: string
      messages: { role: string; content: string }[]
      model: string
      maxTokens: number
    }
    expect(sent.system).toContain("Jsi informační asistent")
    expect(sent.messages).toEqual([
      { role: "user", content: "Jsme plátci DPH?" },
    ])
    expect(sent.maxTokens).toBeGreaterThan(0)
    expect(JSON.stringify(sent)).not.toContain(org.organizationId)
  })

  it("records the provider's reported usage in the ledger", async () => {
    const org = await seedOrganization()
    const chatId = await newChat(org)
    provider.script.push(say("Krátká odpověď.", 321, 45))

    // The body has to be drained before the ledger is read: the response
    // stream's `start` callback IS the turn, and it is still running until the
    // last frame arrives.
    await frames(
      await post(org.members.owner.headers, org.slug, {
        chatId,
        message: "Dotaz",
      }),
    )

    const [row] = await sql<
      { input_tokens: string; output_tokens: string; message_count: number }[]
    >`
      SELECT input_tokens, output_tokens, message_count
        FROM chat_usage WHERE user_id = ${org.members.owner.userId}
    `

    expect(Number(row?.input_tokens)).toBe(321)
    expect(Number(row?.output_tokens)).toBe(45)
    expect(row?.message_count).toBe(1)
  })

  it("passes a provider failure through as an error frame and stores nothing extra", async () => {
    const org = await seedOrganization()
    const chatId = await newChat(org)
    provider.script.push([{ type: "failure", reason: "provider_unconfigured" }])

    const response = await post(org.members.owner.headers, org.slug, {
      chatId,
      message: "Dotaz",
    })

    expect(await frames(response)).toEqual([
      { type: "error", code: "provider_unconfigured" },
      { type: "done" },
    ])

    request.headers = org.members.owner.headers
    const scope = await (
      await import("@/lib/data/scope")
    ).requireScope(org.slug)
    const detail = await assistant.chatForScope(scope, chatId)
    // The question is on record; there is no empty assistant turn beside it.
    expect(detail?.messages.map((m) => m.role)).toEqual(["user"])
  })

  it("keeps a partial answer that failed mid-stream, and charges its tokens", async () => {
    const org = await seedOrganization()
    const chatId = await newChat(org)
    provider.script.push([
      { type: "text", text: "Obecně platí" },
      { type: "usage", inputTokens: 50, outputTokens: 7 },
      { type: "failure", reason: "provider_unreachable" },
    ])

    const response = await post(org.members.owner.headers, org.slug, {
      chatId,
      message: "Dotaz",
    })

    expect(await frames(response)).toEqual([
      { type: "delta", text: "Obecně platí" },
      { type: "error", code: "provider_unreachable" },
      { type: "done" },
    ])

    request.headers = org.members.owner.headers
    const scope = await (
      await import("@/lib/data/scope")
    ).requireScope(org.slug)
    const detail = await assistant.chatForScope(scope, chatId)
    expect(detail?.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Obecně platí",
    })
  })
})

describe("the budget refuses before the provider is reached", () => {
  it("answers 429 with the reason once the daily allowance is gone", async () => {
    const org = await seedOrganization()
    const chatId = await newChat(org)
    vi.stubEnv("BETA_ASSISTANT_USER_DAILY_MESSAGES", "1")

    provider.script.push(say("První."))
    expect(
      (
        await post(org.members.owner.headers, org.slug, {
          chatId,
          message: "První dotaz",
        })
      ).status,
    ).toBe(200)

    const second = await post(org.members.owner.headers, org.slug, {
      chatId,
      message: "Druhý dotaz",
    })

    vi.stubEnv("BETA_ASSISTANT_USER_DAILY_MESSAGES", "")
    expect(second.status).toBe(429)
    expect(await second.json()).toEqual({ error: "daily_limit" })
    // One call for the first turn, none for the refused one.
    expect(provider.calls).toHaveLength(1)
  })

  it("answers 429 with monthly_budget once the install's month is spent", async () => {
    const org = await seedOrganization()
    const chatId = await newChat(org)
    request.headers = org.members.owner.headers
    const scope = await (
      await import("@/lib/data/scope")
    ).requireScope(org.slug)
    await assistant.recordAssistantUsage(scope, {
      inputTokens: 10_000,
      outputTokens: 0,
    })

    vi.stubEnv("BETA_ASSISTANT_MONTHLY_TOKEN_BUDGET", "100")
    const response = await post(org.members.owner.headers, org.slug, {
      chatId,
      message: "Dotaz",
    })
    vi.stubEnv("BETA_ASSISTANT_MONTHLY_TOKEN_BUDGET", "")

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: "monthly_budget" })
    expect(provider.calls).toHaveLength(0)
  })

  it("does not store the client's message on a refused turn", async () => {
    const org = await seedOrganization()
    const chatId = await newChat(org)
    request.headers = org.members.owner.headers
    const scope = await (
      await import("@/lib/data/scope")
    ).requireScope(org.slug)
    await assistant.recordAssistantUsage(scope, {
      inputTokens: 10_000,
      outputTokens: 0,
    })

    vi.stubEnv("BETA_ASSISTANT_MONTHLY_TOKEN_BUDGET", "100")
    await post(org.members.owner.headers, org.slug, {
      chatId,
      message: "Neprojde",
    })
    vi.stubEnv("BETA_ASSISTANT_MONTHLY_TOKEN_BUDGET", "")

    expect(
      (await assistant.chatForScope(scope, chatId))?.messages,
    ).toHaveLength(0)
  })
})
