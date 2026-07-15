import { beforeEach, describe, expect, it } from "vitest"

import {
  _resetDocumentRateLimitForTesting,
  checkDocumentRateLimit,
} from "./document-rate-limit"

const USER_LIMIT = 90
const WORKSPACE_LIMIT = 900
const IP_LIMIT = 180

beforeEach(() => {
  _resetDocumentRateLimitForTesting()
})

describe("checkDocumentRateLimit", () => {
  it("allows up to the per-user limit then blocks with the user scope", () => {
    const input = { userId: "u1", workspaceId: "w1", ip: null, now: 1_000 }
    for (let i = 0; i < USER_LIMIT; i++) {
      expect(checkDocumentRateLimit(input).blocked).toBe(false)
    }
    const decision = checkDocumentRateLimit(input)
    expect(decision.blocked).toBe(true)
    expect(decision.scope).toBe("user")
    expect(decision.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("resets the per-user window after it elapses", () => {
    for (let i = 0; i < USER_LIMIT; i++) {
      checkDocumentRateLimit({
        userId: "u1",
        workspaceId: "w1",
        ip: null,
        now: 0,
      })
    }
    // Still inside the 60s window — blocked.
    expect(
      checkDocumentRateLimit({
        userId: "u1",
        workspaceId: "w1",
        ip: null,
        now: 59_000,
      }).blocked,
    ).toBe(true)
    // Window elapsed — a fresh window allows again.
    expect(
      checkDocumentRateLimit({
        userId: "u1",
        workspaceId: "w1",
        ip: null,
        now: 60_000,
      }).blocked,
    ).toBe(false)
  })

  it("blocks on the per-workspace window even when each user is under its cap", () => {
    // Distinct users so the per-user window never trips first; they share w1.
    for (let i = 0; i < WORKSPACE_LIMIT; i++) {
      expect(
        checkDocumentRateLimit({
          userId: `u${i}`,
          workspaceId: "w1",
          ip: null,
          now: 1_000,
        }).blocked,
      ).toBe(false)
    }
    const decision = checkDocumentRateLimit({
      userId: "u-last",
      workspaceId: "w1",
      ip: null,
      now: 1_000,
    })
    expect(decision.blocked).toBe(true)
    expect(decision.scope).toBe("workspace")
  })

  it("blocks on the per-IP window across distinct users/workspaces", () => {
    for (let i = 0; i < IP_LIMIT; i++) {
      expect(
        checkDocumentRateLimit({
          userId: `u${i}`,
          workspaceId: `w${i}`,
          ip: "203.0.113.0",
          now: 1_000,
        }).blocked,
      ).toBe(false)
    }
    const decision = checkDocumentRateLimit({
      userId: "u-last",
      workspaceId: "w-last",
      ip: "203.0.113.0",
      now: 1_000,
    })
    expect(decision.blocked).toBe(true)
    expect(decision.scope).toBe("ip")
  })

  it("skips the per-IP window when ip is null", () => {
    // Would trip the IP window if ip were set; null must not block here.
    for (let i = 0; i < IP_LIMIT + 5; i++) {
      expect(
        checkDocumentRateLimit({
          userId: `u${i}`,
          workspaceId: `w${i}`,
          ip: null,
          now: 1_000,
        }).blocked,
      ).toBe(false)
    }
  })
})
