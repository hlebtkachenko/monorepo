import { afterEach, describe, expect, it } from "vitest"

import {
  _resetForTest,
  clearAttempts,
  recordAttempt,
} from "./step-up-rate-limit"

afterEach(() => _resetForTest())

describe("step-up rate limiter", () => {
  it("allows the first 5 attempts inside the window", () => {
    for (let i = 0; i < 5; i++) {
      expect(recordAttempt("s-1").allowed).toBe(true)
    }
  })

  it("blocks the 6th attempt inside the window", () => {
    for (let i = 0; i < 5; i++) recordAttempt("s-1")
    const blocked = recordAttempt("s-1")
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryInSec).toBeGreaterThan(0)
  })

  it("isolates buckets per key", () => {
    for (let i = 0; i < 5; i++) recordAttempt("s-1")
    expect(recordAttempt("s-2").allowed).toBe(true)
  })

  it("clearAttempts resets the counter (used on successful verify)", () => {
    for (let i = 0; i < 5; i++) recordAttempt("s-1")
    expect(recordAttempt("s-1").allowed).toBe(false)
    clearAttempts("s-1")
    expect(recordAttempt("s-1").allowed).toBe(true)
  })

  it("decrements remaining on each allowed attempt", () => {
    expect(recordAttempt("s-1").remaining).toBe(4)
    expect(recordAttempt("s-1").remaining).toBe(3)
    expect(recordAttempt("s-1").remaining).toBe(2)
    expect(recordAttempt("s-1").remaining).toBe(1)
    expect(recordAttempt("s-1").remaining).toBe(0)
  })
})
