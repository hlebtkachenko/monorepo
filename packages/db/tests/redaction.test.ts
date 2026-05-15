/**
 * Redaction registry + primitives tests.
 *
 * Covers:
 *   1. Two-pass order: baseline key-walk first, then per-tool dot-path
 *   2. registerToolRedactions idempotency (same set = no-op)
 *   3. registerToolRedactions set-equality (different set = throw)
 *   4. _resetForTests refuses production NODE_ENV
 *   5. applyRedactions path variants (dot-path, wildcard)
 *   6. toPinoRedactPaths shape
 *
 * No DB connection required — all assertions are pure in-process.
 */

import { afterEach, describe, expect, it } from "vitest"
import {
  registerToolRedactions,
  getToolRedactions,
  getAllRedactions,
  _resetForTests,
} from "../src/audit/redaction-registry.js"
import {
  applyRedactions,
  applyBaselineKeyRedactions,
  toPinoRedactPaths,
  TOOL_CALL_LOG_BASELINE_KEYS,
} from "../src/audit/redact.js"

afterEach(() => {
  _resetForTests()
})

describe("registerToolRedactions", () => {
  it("registers a tool and returns its paths via getToolRedactions", () => {
    registerToolRedactions("my_tool", ["input.password", "input.token"])
    expect(getToolRedactions("my_tool")).toEqual([
      "input.password",
      "input.token",
    ])
  })

  it("is idempotent: same set in different order is a no-op", () => {
    registerToolRedactions("tool_a", ["b", "a"])
    expect(() => registerToolRedactions("tool_a", ["a", "b"])).not.toThrow()
  })

  it("throws when re-registering with a different set", () => {
    registerToolRedactions("tool_b", ["x"])
    expect(() => registerToolRedactions("tool_b", ["x", "y"])).toThrow(
      /different paths/,
    )
  })

  it("returns empty array for unregistered tool", () => {
    expect(getToolRedactions("nonexistent")).toEqual([])
  })

  it("getAllRedactions returns all registered tools", () => {
    registerToolRedactions("t1", ["a"])
    registerToolRedactions("t2", ["b", "c"])
    const all = getAllRedactions()
    expect(all["t1"]).toEqual(["a"])
    expect(all["t2"]).toEqual(["b", "c"])
  })
})

describe("_resetForTests", () => {
  it("clears the registry", () => {
    registerToolRedactions("tool_to_clear", ["path"])
    _resetForTests()
    expect(getToolRedactions("tool_to_clear")).toEqual([])
  })

  it("throws when NODE_ENV is not 'test' (and VITEST unset)", () => {
    const originalNode = process.env["NODE_ENV"]
    const originalVitest = process.env["VITEST"]
    try {
      process.env["NODE_ENV"] = "production"
      delete process.env["VITEST"]
      expect(() => _resetForTests()).toThrow(/test/)
    } finally {
      process.env["NODE_ENV"] = originalNode
      if (originalVitest !== undefined) {
        process.env["VITEST"] = originalVitest
      }
    }
  })
})

describe("applyRedactions (dot-path)", () => {
  it("redacts a top-level field", () => {
    const result = applyRedactions({ password: "secret", name: "Alice" }, [
      "password",
    ])
    expect(result).toEqual({ password: "[REDACTED]", name: "Alice" })
  })

  it("redacts a nested field via dot-path", () => {
    const result = applyRedactions({ input: { token: "abc", value: 42 } }, [
      "input.token",
    ])
    expect(result).toEqual({ input: { token: "[REDACTED]", value: 42 } })
  })

  it("redacts via wildcard on array elements", () => {
    const result = applyRedactions(
      { items: [{ secret: "a" }, { secret: "b" }] },
      ["items.*.secret"],
    )
    expect(result).toEqual({
      items: [{ secret: "[REDACTED]" }, { secret: "[REDACTED]" }],
    })
  })

  it("does not mutate the original value", () => {
    const original = { pw: "keep" }
    applyRedactions(original, ["pw"])
    expect(original.pw).toBe("keep")
  })

  it("is a no-op when path does not match", () => {
    const result = applyRedactions({ a: 1 }, ["b.c"])
    expect(result).toEqual({ a: 1 })
  })
})

describe("applyBaselineKeyRedactions (key-walk)", () => {
  it("redacts password at any depth", () => {
    const result = applyBaselineKeyRedactions({
      outer: { password: "secret", safe: "ok" },
    })
    expect((result as { outer: { password: string } }).outer.password).toBe(
      "[REDACTED]",
    )
  })

  it("does not mutate the original", () => {
    const obj = { email: "test@example.com" }
    applyBaselineKeyRedactions(obj)
    expect(obj.email).toBe("test@example.com")
  })

  it("TOOL_CALL_LOG_BASELINE_KEYS includes session_id", () => {
    expect(TOOL_CALL_LOG_BASELINE_KEYS.has("session_id")).toBe(true)
  })
})

describe("two-pass order: baseline first, then per-tool", () => {
  it("baseline strips password before per-tool path runs", () => {
    // If baseline runs first, password is already REDACTED.
    // Per-tool path 'a.password' on a REDACTED string is harmless (string, not object).
    const payload = { a: { password: "secret", other: "ok" } }

    // Pass 1: baseline key-walk
    const afterBaseline = applyBaselineKeyRedactions(payload)
    expect((afterBaseline as { a: { password: string } }).a.password).toBe(
      "[REDACTED]",
    )

    // Pass 2: per-tool dot-path (on already-redacted clone)
    const afterPerTool = applyRedactions(afterBaseline, ["a.other"])
    expect((afterPerTool as { a: { other: string } }).a.other).toBe(
      "[REDACTED]",
    )
  })
})

describe("toPinoRedactPaths", () => {
  it("includes baseline paths", () => {
    const paths = toPinoRedactPaths({})
    expect(paths.some((p) => p.includes("password"))).toBe(true)
  })

  it("includes per-tool paths with *. prefix", () => {
    const paths = toPinoRedactPaths({ my_tool: ["my_secret"] })
    expect(paths).toContain("*.my_secret")
  })

  it("deduplicates paths", () => {
    const paths = toPinoRedactPaths({ t1: ["password"], t2: ["password"] })
    const count = paths.filter((p) => p === "*.password").length
    expect(count).toBeLessThanOrEqual(1)
  })
})
