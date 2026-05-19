/**
 * login-flow.ts tests (AFF-198 D3 — lem).
 *
 * Boots a Postgres 18 testcontainer so the opaque-token path can
 * exercise the auth_token table end-to-end.
 *
 * The cookieStore is a hand-rolled Map-backed jar matching the minimal
 * CookieStore contract from packages/auth/src/tokens/cookies.ts.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { bootPostgres18 } from "@workspace/testcontainers"
import type { BootResult } from "@workspace/testcontainers"

process.env["NODE_ENV"] = process.env["NODE_ENV"] ?? "test"
process.env["AUTH_TOKEN_ENV"] = "dev"

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

let boot: BootResult

beforeAll(async () => {
  boot = await bootPostgres18()
  process.env["DATABASE_URL"] = boot.userUrl
  process.env["DATABASE_DIRECT_URL"] = boot.adminUrl
}, 120_000)

afterAll(async () => {
  if (boot?.container) await boot.container.stop()
})

beforeEach(async () => {
  const { adminClient, truncateAll } =
    await import("@workspace/db/tests/fixtures")
  const sql = adminClient()
  try {
    await truncateAll(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
})

interface JarEntry {
  name: string
  value: string
  path?: string
}

function makeJar() {
  const store = new Map<string, JarEntry>()
  return {
    get: (name: string) => {
      const entry = store.get(name)
      return entry ? { name: entry.name, value: entry.value } : undefined
    },
    set: (opts: { name: string; value: string; path?: string }) => {
      store.set(opts.name, {
        name: opts.name,
        value: opts.value,
        path: opts.path,
      })
    },
    delete: (opts: { name: string; path?: string }) => {
      store.delete(opts.name)
    },
    _peek: (name: string) => store.get(name),
  }
}

describe("login-flow lem (auth_token)", () => {
  it("mints an auth_token row + writes afkey-lem cookie + reads payload", async () => {
    const { identifyEmail, readLoginEmailFromStore } =
      await import("./login-flow")

    const jar = makeJar()
    const result = await identifyEmail({ email: "newpath@test.invalid" }, jar)
    expect(result.ok).toBe(true)

    const cookie = jar._peek("afkey-lem")
    expect(cookie?.value).toMatch(/^afkey-[0-9A-Za-z]{43}-[0-9a-f]{8}$/)

    const email = await readLoginEmailFromStore(jar)
    expect(email).toBe("newpath@test.invalid")
  })

  it("consumeLoginEmail flips the auth_token row to consumed", async () => {
    const { identifyEmail, consumeLoginEmail } = await import("./login-flow")
    const { adminClient } = await import("@workspace/db/tests/fixtures")

    const jar = makeJar()
    await identifyEmail({ email: "consume@test.invalid" }, jar)

    await consumeLoginEmail(jar)

    const sql = adminClient()
    try {
      const [row] = await sql<
        Array<{ status: string }>
      >`SELECT status FROM auth_token WHERE kind = 'lem'`
      expect(row?.status).toBe("consumed")
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("readLoginEmailFromStore is non-destructive (status stays pending)", async () => {
    const { identifyEmail, readLoginEmailFromStore } =
      await import("./login-flow")
    const { adminClient } = await import("@workspace/db/tests/fixtures")

    const jar = makeJar()
    await identifyEmail({ email: "peek@test.invalid" }, jar)

    // Multiple reads must NOT flip status.
    expect(await readLoginEmailFromStore(jar)).toBe("peek@test.invalid")
    expect(await readLoginEmailFromStore(jar)).toBe("peek@test.invalid")

    const sql = adminClient()
    try {
      const [row] = await sql<
        Array<{ status: string }>
      >`SELECT status FROM auth_token WHERE kind = 'lem'`
      expect(row?.status).toBe("pending")
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("invalid email shape returns ok=false with no cookie written", async () => {
    const { identifyEmail } = await import("./login-flow")

    const jar = makeJar()
    const result = await identifyEmail({ email: "not-an-email" }, jar)
    expect(result.ok).toBe(false)
    expect(jar._peek("afkey-lem")).toBeUndefined()
  })
})
