/**
 * login-flow.ts dual-path tests (AFF-198 D3 — lem).
 *
 * Boots a Postgres 18 testcontainer so the new opaque-token path can
 * exercise the auth_token table end-to-end. The legacy JWT path is also
 * exercised by toggling USE_AUTH_TOKEN_FOR_LEM.
 *
 * The cookieStore is a hand-rolled Map-backed jar matching the minimal
 * CookieStore contract from packages/auth/src/tokens/cookies.ts.
 */

import {
  afterAll,
  afterEach,
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
process.env["APP_TOKEN_SECRET"] = "x".repeat(64)

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

afterEach(() => {
  delete process.env["USE_AUTH_TOKEN_FOR_LEM"]
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

describe("login-flow lem dual-path (D3)", () => {
  it("legacy path: writes app-login-email JWT cookie, reads it back", async () => {
    delete process.env["USE_AUTH_TOKEN_FOR_LEM"]
    const { identifyEmail, readLoginEmailFromStore } =
      await import("./login-flow")

    const jar = makeJar()
    const result = await identifyEmail({ email: "legacy@test.invalid" }, jar)
    expect(result.ok).toBe(true)

    const cookie = jar._peek("app-login-email")
    expect(cookie?.value).toBeTruthy()
    // JWT three-part shape
    expect(cookie?.value.split(".").length).toBe(3)

    const email = await readLoginEmailFromStore(jar)
    expect(email).toBe("legacy@test.invalid")
  })

  it("new path: mints auth_token row, writes afkey-lem cookie, reads payload", async () => {
    process.env["USE_AUTH_TOKEN_FOR_LEM"] = "true"
    const { identifyEmail, readLoginEmailFromStore } =
      await import("./login-flow")

    const jar = makeJar()
    const result = await identifyEmail({ email: "newpath@test.invalid" }, jar)
    expect(result.ok).toBe(true)

    const cookie = jar._peek("afkey-lem")
    expect(cookie?.value).toMatch(/^afkey-[0-9A-Za-z]{43}-[0-9a-f]{8}$/)
    expect(jar._peek("app-login-email")).toBeUndefined()

    const email = await readLoginEmailFromStore(jar)
    expect(email).toBe("newpath@test.invalid")
  })

  it("new path: consumeLoginEmail flips the auth_token row to consumed", async () => {
    process.env["USE_AUTH_TOKEN_FOR_LEM"] = "true"
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

  it("new path: readLoginEmailFromStore is non-destructive (status stays pending)", async () => {
    process.env["USE_AUTH_TOKEN_FOR_LEM"] = "true"
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
    process.env["USE_AUTH_TOKEN_FOR_LEM"] = "true"
    const { identifyEmail } = await import("./login-flow")

    const jar = makeJar()
    const result = await identifyEmail({ email: "not-an-email" }, jar)
    expect(result.ok).toBe(false)
    expect(jar._peek("afkey-lem")).toBeUndefined()
    expect(jar._peek("app-login-email")).toBeUndefined()
  })
})
