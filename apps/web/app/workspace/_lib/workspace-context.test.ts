/**
 * Unit tests for `requireWorkspaceRole` — the role gate mutating
 * workspace-tier server actions call after the `activeWorkspaceId` fence.
 *
 * DEV-458 / #481 — role-gate mutating actions.
 *
 * Pure decision logic over an already-resolved `WorkspaceContext`, so no DB
 * fixture is needed: `getWorkspaceContext` (which does hit the DB) is
 * covered by its own call sites, and this test pins the role-vs-allowlist
 * decision in isolation. The `server-only` alias in vitest.config.ts makes
 * importing this module (which starts with `import "server-only"`) safe in
 * the Node test runner.
 */

import { describe, expect, it } from "vitest"
import {
  requireWorkspaceRole,
  type WorkspaceContext,
  type WorkspaceRole,
} from "./workspace-context"

function ctxWithRole(
  role: WorkspaceRole | null,
): Pick<WorkspaceContext, "current"> {
  return {
    current: role
      ? { id: "ws-1", name: "Test Workspace", role, companyCount: 0 }
      : null,
  }
}

describe("requireWorkspaceRole", () => {
  it("allows an owner", () => {
    expect(
      requireWorkspaceRole(ctxWithRole("owner"), ["owner", "admin"]),
    ).toBeNull()
  })

  it("allows an admin", () => {
    expect(
      requireWorkspaceRole(ctxWithRole("admin"), ["owner", "admin"]),
    ).toBeNull()
  })

  it("denies a member with the forbidden ActionResult shape", () => {
    expect(
      requireWorkspaceRole(ctxWithRole("member"), ["owner", "admin"]),
    ).toEqual({
      ok: false,
      errorKey: "forbidden",
    })
  })

  it("denies when there is no current workspace membership", () => {
    expect(requireWorkspaceRole(ctxWithRole(null), ["owner", "admin"])).toEqual(
      {
        ok: false,
        errorKey: "forbidden",
      },
    )
  })
})
