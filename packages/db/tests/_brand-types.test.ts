/**
 * Compile-time brand type tests for OrganizationBoundDb, WorkspaceBoundDb,
 * and AdminBypassDb (ADR-0010 §3.2).
 *
 * Written as a regular .test.ts (not .test-d.ts) using @ts-expect-error
 * annotations. Each @ts-expect-error comment asserts that the assignment or
 * call below it is a TypeScript error — if the error disappears (meaning the
 * types became accidentally assignable), the @ts-expect-error itself becomes
 * an error and the test file fails to compile/typecheck.
 *
 * This gives equivalent compile-time coverage to vitest's expectTypeOf without
 * requiring typecheck.enabled in vitest.config.ts (which adds significant
 * overhead and requires the full project tsconfig).
 */

import { describe, it } from "vitest"
import type { Db } from "../src/client.js"
import type {
  OrganizationBoundDb,
  WorkspaceBoundDb,
  AdminBypassDb,
  AnyTx,
} from "../src/tenancy.js"

// ---------------------------------------------------------------------------
// Helper functions used only for type-checking. Never called at runtime.
// The underscore-prefixed parameter names suppress unused-variable warnings.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function acceptsOrganizationBoundDb(_: OrganizationBoundDb): void {}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function acceptsWorkspaceBoundDb(_: WorkspaceBoundDb): void {}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function acceptsAdminBypassDb(_: AdminBypassDb): void {}

// ---------------------------------------------------------------------------
// Positive cases: values that MUST be assignable (sanity check)
// ---------------------------------------------------------------------------

describe("brand types — compile-time assertions", () => {
  it("OrganizationBoundDb is a subtype of AnyTx (satisfies the transaction interface)", () => {
    // Type-only assertion: OrganizationBoundDb must extend AnyTx.
    // If this fails to compile it means the brand intersection broke.
    type _Check = OrganizationBoundDb extends AnyTx ? true : false
    const _ok: _Check = true
    void _ok
  })

  it("WorkspaceBoundDb is a subtype of AnyTx", () => {
    type _Check = WorkspaceBoundDb extends AnyTx ? true : false
    const _ok: _Check = true
    void _ok
  })

  it("AdminBypassDb is a subtype of AnyTx", () => {
    type _Check = AdminBypassDb extends AnyTx ? true : false
    const _ok: _Check = true
    void _ok
  })

  // ---------------------------------------------------------------------------
  // Negative cases: assignments that MUST fail at compile time
  // ---------------------------------------------------------------------------

  it("raw Db is NOT assignable to OrganizationBoundDb", () => {
    const rawDb = {} as Db

    // @ts-expect-error — Db lacks the organizationBrand symbol property
    acceptsOrganizationBoundDb(rawDb)
  })

  it("raw Db is NOT assignable to WorkspaceBoundDb", () => {
    const rawDb = {} as Db

    // @ts-expect-error — Db lacks the workspaceBrand symbol property
    acceptsWorkspaceBoundDb(rawDb)
  })

  it("raw Db is NOT assignable to AdminBypassDb", () => {
    const rawDb = {} as Db

    // @ts-expect-error — Db lacks the adminBypassBrand symbol property
    acceptsAdminBypassDb(rawDb)
  })

  it("WorkspaceBoundDb is NOT assignable to OrganizationBoundDb", () => {
    const wsDb = {} as WorkspaceBoundDb

    // @ts-expect-error — WorkspaceBoundDb lacks organizationBrand
    acceptsOrganizationBoundDb(wsDb)
  })

  it("OrganizationBoundDb is NOT assignable to WorkspaceBoundDb", () => {
    const orgDb = {} as OrganizationBoundDb

    // @ts-expect-error — OrganizationBoundDb lacks workspaceBrand
    acceptsWorkspaceBoundDb(orgDb)
  })

  it("OrganizationBoundDb is NOT assignable to AdminBypassDb", () => {
    const orgDb = {} as OrganizationBoundDb

    // @ts-expect-error — OrganizationBoundDb lacks adminBypassBrand
    acceptsAdminBypassDb(orgDb)
  })

  it("WorkspaceBoundDb is NOT assignable to AdminBypassDb", () => {
    const wsDb = {} as WorkspaceBoundDb

    // @ts-expect-error — WorkspaceBoundDb lacks adminBypassBrand
    acceptsAdminBypassDb(wsDb)
  })

  it("AdminBypassDb is NOT assignable to OrganizationBoundDb", () => {
    const adminDb = {} as AdminBypassDb

    // @ts-expect-error — AdminBypassDb lacks organizationBrand
    acceptsOrganizationBoundDb(adminDb)
  })

  it("AdminBypassDb is NOT assignable to WorkspaceBoundDb", () => {
    const adminDb = {} as AdminBypassDb

    // @ts-expect-error — AdminBypassDb lacks workspaceBrand
    acceptsWorkspaceBoundDb(adminDb)
  })

  it("AnyTx is NOT assignable to OrganizationBoundDb (raw transaction without GUCs)", () => {
    const anyTx = {} as AnyTx

    // @ts-expect-error — AnyTx lacks the brand symbol
    acceptsOrganizationBoundDb(anyTx)
  })

  it("AnyTx is NOT assignable to WorkspaceBoundDb", () => {
    const anyTx = {} as AnyTx

    // @ts-expect-error — AnyTx lacks workspaceBrand
    acceptsWorkspaceBoundDb(anyTx)
  })

  it("AnyTx is NOT assignable to AdminBypassDb", () => {
    const anyTx = {} as AnyTx

    // @ts-expect-error — AnyTx lacks adminBypassBrand
    acceptsAdminBypassDb(anyTx)
  })
})
