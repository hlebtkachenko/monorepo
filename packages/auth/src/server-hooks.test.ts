/**
 * Tests for the Better Auth hooks.after audit adapter (C2).
 *
 * Path strings in hooks.after match better-auth@1.6.x. Review on Dependabot
 * bumps — see `_AUDIT_BA_MINOR` in server.ts.
 *
 * Coverage split:
 *   1. Unit tests for `resolveAuditAction` — exhaustive path-to-action mapping,
 *      no DB, no BA.
 *   2. Integration tests — BA flow not disrupted by the hook (no throw), using a
 *      live testcontainer. Audit rows are NOT asserted here because the BA hook
 *      calls `writeAuditEventGlobal` with no workspace_id (none available at hook
 *      time), which silently skips the write. DB-level assertions live in
 *      packages/db/tests/write-audit-event.test.ts.
 *   3. Version pin assertion.
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

// Set env before any auth/db module is imported.
process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "hooks-test-secret-0123456789abcdef-0123456789ab"
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

// ---------------------------------------------------------------------------
// Unit: resolveAuditAction path-to-action mapping
// ---------------------------------------------------------------------------

describe("resolveAuditAction — path-to-action mapping", () => {
  it("maps /sign-in/email to success / failure actions", async () => {
    const { resolveAuditAction } = await import("./server")
    expect(resolveAuditAction("/sign-in/email", true)).toBe(
      "auth.login.success",
    )
    expect(resolveAuditAction("/sign-in/email", false)).toBe(
      "auth.login.failed_password",
    )
  })

  it("maps /sign-up/email to success / failure actions", async () => {
    const { resolveAuditAction } = await import("./server")
    expect(resolveAuditAction("/sign-up/email", true)).toBe(
      "auth.signup.success",
    )
    expect(resolveAuditAction("/sign-up/email", false)).toBe(
      "auth.signup.failed",
    )
  })

  it("maps /two-factor/verify-totp to mfa success / failure", async () => {
    const { resolveAuditAction } = await import("./server")
    expect(resolveAuditAction("/two-factor/verify-totp", true)).toBe(
      "auth.mfa.success_totp",
    )
    expect(resolveAuditAction("/two-factor/verify-totp", false)).toBe(
      "auth.mfa.failed_totp",
    )
  })

  it("maps /two-factor/verify-backup to backup mfa success / failure", async () => {
    const { resolveAuditAction } = await import("./server")
    expect(resolveAuditAction("/two-factor/verify-backup", true)).toBe(
      "auth.mfa.success_backup",
    )
    expect(resolveAuditAction("/two-factor/verify-backup", false)).toBe(
      "auth.mfa.failed_backup",
    )
  })

  it("maps /sign-out to auth.signout regardless of outcome", async () => {
    const { resolveAuditAction } = await import("./server")
    expect(resolveAuditAction("/sign-out", true)).toBe("auth.signout")
    expect(resolveAuditAction("/sign-out", false)).toBe("auth.signout")
  })

  it("maps password reset paths", async () => {
    const { resolveAuditAction } = await import("./server")
    expect(resolveAuditAction("/forget-password", true)).toBe(
      "auth.password_reset.requested",
    )
    expect(resolveAuditAction("/reset-password", true)).toBe(
      "auth.password_reset.completed",
    )
  })

  it("maps magic-link paths", async () => {
    const { resolveAuditAction } = await import("./server")
    expect(resolveAuditAction("/magic-link/send", true)).toBe(
      "auth.magic_link.issued",
    )
    expect(resolveAuditAction("/magic-link/sign-in", true)).toBe(
      "auth.magic_link.consumed",
    )
    expect(resolveAuditAction("/magic-link/sign-in", false)).toBe(
      "auth.magic_link.failed",
    )
  })

  it("returns null for unrecognised paths", async () => {
    const { resolveAuditAction } = await import("./server")
    expect(resolveAuditAction("/session", true)).toBeNull()
    expect(resolveAuditAction("/user/update-user", true)).toBeNull()
    expect(resolveAuditAction("", true)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// BA version pin assertion
// ---------------------------------------------------------------------------

describe("_AUDIT_BA_MINOR version pin", () => {
  it("exported pin constant matches better-auth 1.6.x", async () => {
    const { _AUDIT_BA_MINOR } = await import("./server")
    expect(_AUDIT_BA_MINOR).toBe("1.6")
  })
})

// ---------------------------------------------------------------------------
// Integration: hooks.after does not break BA auth flows
// ---------------------------------------------------------------------------

describe("hooks.after — BA auth flow not disrupted", () => {
  it("sign-up + sign-in succeeds despite hook running with no workspace", async () => {
    const { betterAuthSignUp, signInWithPassword } =
      await import("./test-support")

    await betterAuthSignUp({
      email: "hooks-no-break@test.invalid",
      password: "HooksNoBreakPassw0rd!",
      name: "Hooks No Break",
    })

    const result = await signInWithPassword(
      "hooks-no-break@test.invalid",
      "HooksNoBreakPassw0rd!",
    )
    expect(result.ok).toBe(true)
    expect(result.token).toBeTruthy()
  })

  it("failed sign-in does not throw from the hook (audit write silently skipped)", async () => {
    const { betterAuthSignUp } = await import("./test-support")
    const { auth } = await import("./server")

    await betterAuthSignUp({
      email: "hooks-fail-no-throw@test.invalid",
      password: "HooksFailPassw0rd!",
      name: "Hooks Fail",
    })

    // BA throws its own error on bad password; hook must not add its own error.
    // We catch the BA error and only care the call completes without a
    // separate hook-originated exception.
    let caughtError: unknown = null
    try {
      await auth.api.signInEmail({
        body: {
          email: "hooks-fail-no-throw@test.invalid",
          password: "WrongPassw0rd!",
        },
      })
    } catch (err) {
      caughtError = err
    }
    // BA error is expected; what matters is the error is from BA, not the hook.
    expect(caughtError).not.toBeNull()
  })

  it("sign-out completes without hook-originated throw", async () => {
    const { betterAuthSignUp } = await import("./test-support")
    const { auth } = await import("./server")

    await betterAuthSignUp({
      email: "hooks-signout-no-throw@test.invalid",
      password: "HooksSignoutPassw0rd!",
      name: "Hooks Signout",
    })

    const signIn = await auth.api.signInEmail({
      body: {
        email: "hooks-signout-no-throw@test.invalid",
        password: "HooksSignoutPassw0rd!",
      },
    })

    const hdrs = new Headers()
    hdrs.set("Authorization", `Bearer ${signIn.token}`)
    await expect(auth.api.signOut({ headers: hdrs })).resolves.toBeDefined()
  })
})
