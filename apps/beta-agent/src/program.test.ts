import { join } from "node:path"
import { describe, expect, it } from "vitest"

import type { Fetch } from "./client"
import { run } from "./program"

const KEY = "afb_agent_fake_key_for_tests_only"
const ENV = { BETA_AGENT_URL: "https://beta.example.org", BETA_AGENT_KEY: KEY }
const examples = join(import.meta.dirname, "..", "examples")
const example = (name: string): string => join(examples, `${name}.csv`)

type Call = { url: string; init: RequestInit }

function server(
  status: number,
  body: unknown,
): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl = (async (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  }) as Fetch
  return { fetch: fetchImpl, calls }
}

/** A fetch that fails the test if it is reached at all. */
const forbidden = (() => {
  throw new Error("the network must not be touched on this path")
}) as unknown as Fetch

async function exec(
  argv: string[],
  env: NodeJS.ProcessEnv = ENV,
  fetchImpl: Fetch = forbidden,
): Promise<{ code: number; out: string }> {
  const lines: string[] = []
  const code = await run(
    argv,
    env,
    { write: (line) => lines.push(line) },
    fetchImpl,
  )
  return { code, out: lines.join("\n") }
}

describe("refusals before anything is read or sent", () => {
  it("names the missing URL variable", async () => {
    const result = await exec(
      ["publish", "predvaha", "--file", example("predvaha"), "--org", "x"],
      {},
    )
    expect(result.code).toBe(1)
    expect(result.out).toContain("BETA_AGENT_URL")
  })

  it("names the missing key variable", async () => {
    const result = await exec(
      ["publish", "predvaha", "--file", example("predvaha"), "--org", "x"],
      { BETA_AGENT_URL: "https://beta.example.org" },
    )
    expect(result.code).toBe(1)
    expect(result.out).toContain("BETA_AGENT_KEY")
  })

  it("refuses plain http against a real host", async () => {
    const result = await exec(["check"], {
      ...ENV,
      BETA_AGENT_URL: "http://beta.example.org",
    })
    expect(result.code).toBe(1)
    expect(result.out).toContain("https")
  })

  it("allows http on loopback, for a dev portal", async () => {
    const stub = server(200, {
      key: { label: "L", scope: "office" },
      organizations: [],
      datasets: [],
    })
    const result = await exec(
      ["check"],
      { ...ENV, BETA_AGENT_URL: "http://localhost:3200" },
      stub.fetch,
    )
    expect(result.code).toBe(0)
    expect(stub.calls[0]?.url).toBe("http://localhost:3200/api/agent/v1/meta")
  })

  it("refuses an unreadable period before opening the file", async () => {
    const result = await exec([
      "publish",
      "predvaha",
      "--file",
      example("predvaha"),
      "--org",
      "x",
      "--period",
      "červenec",
    ])
    expect(result.code).toBe(1)
    expect(result.out).toContain("2026-07")
  })

  it("refuses a hand-passed idempotency key the server would reject", async () => {
    const result = await exec([
      "publish",
      "predvaha",
      "--file",
      example("predvaha"),
      "--org",
      "x",
      "--period",
      "2026-07",
      "--idempotency-key",
      "měsíc 07",
    ])
    expect(result.code).toBe(1)
    expect(result.out).toContain("--idempotency-key")
  })

  it("refuses an unknown dataset by listing the real ones", async () => {
    const result = await exec([
      "publish",
      "vykaz",
      "--file",
      example("vzz"),
      "--org",
      "x",
    ])
    expect(result.code).toBe(1)
    expect(result.out).toContain("predvaha")
  })

  it("refuses a file that is not there", async () => {
    const result = await exec([
      "publish",
      "predvaha",
      "--file",
      example("neexistuje"),
      "--org",
      "x",
      "--period",
      "2026-07",
    ])
    expect(result.code).toBe(1)
    expect(result.out).toContain("nelze otevřít")
  })
})

describe("--dry-run", () => {
  it("transforms and prints the body without credentials and without a request", async () => {
    const result = await exec(
      [
        "publish",
        "predvaha",
        "--file",
        example("predvaha"),
        "--org",
        "stavby-vltava",
        "--period",
        "2026-07",
        "--dry-run",
      ],
      {},
    )
    expect(result.code).toBe(0)
    expect(result.out).toContain("Obratová předvaha — 2026-07: 3 řádky")
    expect(result.out).toContain("Neodesláno")
    expect(result.out).toContain('"accountCode": "211000"')
    expect(result.out).toContain('"closingBalance": "34279.50"')
  })

  it("does not stamp the --period flag on a registry whose rows carry their own", async () => {
    const result = await exec(
      [
        "publish",
        "filings",
        "--file",
        example("filings"),
        "--org",
        "x",
        "--period",
        "2026-07",
        "--dry-run",
      ],
      {},
    )
    expect(result.code).toBe(0)
    expect(result.out).toContain("Daňová podání: 2 řádky")
    expect(result.out).not.toContain("Daňová podání — 2026-07")
  })

  it("works for a dataset the CLI cannot publish yet, and says the route is already live", async () => {
    const result = await exec(
      [
        "publish",
        "saldokonto",
        "--file",
        example("saldokonto"),
        "--org",
        "x",
        "--period",
        "2026-07",
        "--dry-run",
      ],
      {},
    )
    expect(result.code).toBe(0)
    expect(result.out).toContain("CLI wiring not yet built")
  })

  it("prints the row-level refusal instead of a payload when the file is wrong", async () => {
    const result = await exec(
      [
        "publish",
        "filings",
        "--file",
        example("predvaha"),
        "--org",
        "x",
        "--period",
        "2026-07",
        "--dry-run",
      ],
      {},
    )
    expect(result.code).toBe(1)
    expect(result.out).toContain("Chybí povinné sloupce")
  })
})

describe("publish", () => {
  it("sends the transformed body with a derived Idempotency-Key", async () => {
    const stub = server(200, {
      status: "applied",
      organization: "stavby-vltava",
      summary: { rowCount: 3 },
    })
    const result = await exec(
      [
        "publish",
        "predvaha",
        "--file",
        example("predvaha"),
        "--org",
        "stavby-vltava",
        "--period",
        "2026-07",
      ],
      ENV,
      stub.fetch,
    )

    expect(result.code).toBe(0)
    expect(result.out).toContain("Publikováno do stavby-vltava")
    const headers = stub.calls[0]?.init.headers as Record<string, string>
    expect(headers["idempotency-key"]).toMatch(/^beta-agent\.v1\.[0-9a-f]{40}$/)
    expect(stub.calls[0]?.url).toContain(
      "/orgs/stavby-vltava/publish/trial-balance",
    )
  })

  it("derives DIFFERENT keys for two datasets in one month-end run", async () => {
    const stub = server(200, {
      status: "applied",
      organization: "o",
      summary: {},
    })
    await exec(
      [
        "publish",
        "rozvaha",
        "--file",
        example("rozvaha"),
        "--org",
        "o",
        "--period",
        "2026-07",
      ],
      ENV,
      stub.fetch,
    )
    await exec(
      [
        "publish",
        "vzz",
        "--file",
        example("vzz"),
        "--org",
        "o",
        "--period",
        "2026-07",
      ],
      ENV,
      stub.fetch,
    )

    const keys = stub.calls.map(
      (call) =>
        (call.init.headers as Record<string, string>)["idempotency-key"],
    )
    expect(keys[0]).not.toBe(keys[1])
  })

  it("refuses a dataset with no endpoint AFTER proving the file reads", async () => {
    const result = await exec(
      [
        "publish",
        "payroll",
        "--file",
        example("payroll"),
        "--org",
        "o",
        "--period",
        "2026-07",
      ],
      ENV,
      forbidden,
    )
    expect(result.code).toBe(1)
    expect(result.out).toContain("CLI wiring not yet built")
    expect(result.out).toContain("--dry-run")
  })

  it("maps a 409 idempotency reuse to an actionable Czech sentence", async () => {
    const stub = server(409, { error: "idempotency_key_reused" })
    const result = await exec(
      [
        "publish",
        "predvaha",
        "--file",
        example("predvaha"),
        "--org",
        "o",
        "--period",
        "2026-07",
      ],
      ENV,
      stub.fetch,
    )
    expect(result.code).toBe(1)
    expect(result.out).toContain("JINOU operaci")
  })

  it("exits 2 when the portal, not the office, is at fault", async () => {
    const stub = server(503, { error: "unknown" })
    const result = await exec(
      [
        "publish",
        "predvaha",
        "--file",
        example("predvaha"),
        "--org",
        "o",
        "--period",
        "2026-07",
      ],
      ENV,
      stub.fetch,
    )
    expect(result.code).toBe(2)
  })
})

describe("check + datasets", () => {
  it("prints the key's reach without printing the key", async () => {
    const stub = server(200, {
      key: { label: "Kancelář Vltava", scope: "office" },
      organizations: [
        { slug: "stavby-vltava", legalName: "Stavby Vltava s.r.o." },
      ],
      datasets: [
        { path: "filings", implemented: true },
        { path: "publish/payroll", implemented: false, note: "PR 29" },
      ],
    })
    const result = await exec(["check"], ENV, stub.fetch)

    expect(result.code).toBe(0)
    expect(result.out).toContain("Kancelář Vltava")
    expect(result.out).toContain("celá kancelář")
    expect(result.out).toContain("zatím nedostupné — PR 29")
    expect(result.out).not.toContain(KEY)
  })

  it("lists the local dataset matrix with no credentials at all", async () => {
    const result = await exec(["datasets"], {})
    expect(result.code).toBe(0)
    expect(result.out).toContain("publish/trial-balance")
    expect(result.out).toContain("zatím bez koncového bodu")
  })
})

describe("the key never reaches the output", () => {
  it.each([
    [401, "unauthorized"],
    [404, "not_found"],
    [409, "idempotency_key_reused"],
    [500, "unknown"],
  ])("not on a %i %s", async (status, code) => {
    const stub = server(status, { error: code })
    const result = await exec(
      [
        "publish",
        "predvaha",
        "--file",
        example("predvaha"),
        "--org",
        "o",
        "--period",
        "2026-07",
      ],
      ENV,
      stub.fetch,
    )
    expect(result.out).not.toContain(KEY)
  })
})
