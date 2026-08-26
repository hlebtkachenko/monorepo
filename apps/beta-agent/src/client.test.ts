import { describe, expect, it } from "vitest"

import { AgentError, getMeta, publish, type Fetch } from "./client"
import type { AgentConfig } from "./config"

const CONFIG: AgentConfig = {
  baseUrl: "https://beta.example.org",
  // Obviously not a credential: this string is the point of the last test here.
  key: "afb_agent_fake_key_for_tests_only",
}

/** A stub server. Records the request, answers with whatever the case needs. */
function stub(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): { fetch: Fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    })
  }) as Fetch
  return { fetch: fetchImpl, calls }
}

const PUBLISH = {
  orgSlug: "stavby-vltava",
  path: "publish/trial-balance",
  payload: { lines: [] },
  idempotencyKey: "beta-agent.v1.abc",
}

describe("getMeta", () => {
  it("sends the key as a bearer token and returns the handshake", async () => {
    const server = stub(200, {
      key: { label: "Kancelář", scope: "office" },
      organizations: [
        { slug: "stavby-vltava", legalName: "Stavby Vltava s.r.o." },
      ],
      datasets: [{ path: "filings", implemented: true }],
    })
    const meta = await getMeta(CONFIG, server.fetch)

    expect(meta.organizations[0]?.slug).toBe("stavby-vltava")
    expect(server.calls[0]?.url).toBe(
      "https://beta.example.org/api/agent/v1/meta",
    )
    expect(
      (server.calls[0]?.init.headers as Record<string, string>)[
        "authorization"
      ],
    ).toBe(`Bearer ${CONFIG.key}`)
  })
})

describe("publish", () => {
  it("posts JSON with the idempotency header to the org-scoped URL", async () => {
    const server = stub(200, {
      status: "applied",
      organization: "stavby-vltava",
      summary: { rowCount: 3 },
    })
    const response = await publish(CONFIG, PUBLISH, server.fetch)

    expect(response.status).toBe("applied")
    expect(server.calls[0]?.url).toBe(
      "https://beta.example.org/api/agent/v1/orgs/stavby-vltava/publish/trial-balance",
    )
    const headers = server.calls[0]?.init.headers as Record<string, string>
    expect(headers["idempotency-key"]).toBe("beta-agent.v1.abc")
    expect(headers["content-type"]).toBe("application/json")
  })

  it("reports a replay as a replay, not as a fresh write", async () => {
    const server = stub(200, {
      status: "replayed",
      organization: "stavby-vltava",
      summary: { rowCount: 3 },
    })
    expect((await publish(CONFIG, PUBLISH, server.fetch)).status).toBe(
      "replayed",
    )
  })
})

describe("error mapping", () => {
  const cases: readonly [number, string, RegExp, 1 | 2][] = [
    [401, "unauthorized", /BETA_AGENT_KEY/, 1],
    [404, "not_found", /stavby-vltava/, 1],
    [400, "invalid_body", /Neplatná pole/, 1],
    [400, "tenancy_key_in_payload", /klíč organizace/, 1],
    [400, "invalid_idempotency_key", /--idempotency-key/, 1],
    [400, "invalid_json", /chybu agenta/, 1],
    [409, "idempotency_key_reused", /JINOU operaci/, 1],
    [409, "identity_changed", /nové ID/, 1],
    [409, "conflict", /Měsíční uzávěrka/, 1],
    [413, "payload_too_large", /příliš velký/, 1],
    [415, "unsupported_media_type", /application\/json/, 1],
    [500, "unknown", /výpadek portálu/, 2],
  ]

  it.each(cases)(
    "%i %s becomes a Czech sentence",
    async (status, code, pattern, exit) => {
      const server = stub(status, {
        error: code,
        issues: [{ path: "items.0", code: "x" }],
      })
      await expect(
        publish(CONFIG, PUBLISH, server.fetch),
      ).rejects.toMatchObject({
        message: expect.stringMatching(pattern),
        exitCode: exit,
      })
    },
  )

  it("carries retry-after through a 429", async () => {
    const server = stub(429, { error: "rate_limited" }, { "retry-after": "17" })
    await expect(publish(CONFIG, PUBLISH, server.fetch)).rejects.toThrow(/17 s/)
  })

  it("treats an unreachable portal as a portal problem, not an office one", async () => {
    const fetchImpl = (() => {
      throw new Error("ECONNREFUSED")
    }) as unknown as Fetch
    await expect(publish(CONFIG, PUBLISH, fetchImpl)).rejects.toMatchObject({
      exitCode: 2,
    })
  })

  it("never puts the key into an error message", async () => {
    for (const [status, code] of cases) {
      const server = stub(status, { error: code })
      const error = await publish(CONFIG, PUBLISH, server.fetch).catch(
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(AgentError)
      expect((error as AgentError).message).not.toContain(CONFIG.key)
    }
  })
})
