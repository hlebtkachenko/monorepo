import { describe, expect, it } from "vitest"

import {
  isSensitiveQueryKey,
  pathWithScrubbedQuery,
  scrubSensitiveParams,
} from "./scrub-query"

describe("isSensitiveQueryKey", () => {
  it("flags credential-bearing keys case-insensitively", () => {
    for (const key of [
      "token",
      "Token",
      "CODE",
      "state",
      "access_token",
      "sig",
    ]) {
      expect(isSensitiveQueryKey(key)).toBe(true)
    }
  })

  it("leaves benign deep-link keys alone", () => {
    for (const key of ["inspect", "tab", "q", "page", "postcode"]) {
      expect(isSensitiveQueryKey(key)).toBe(false)
    }
  })
})

describe("scrubSensitiveParams", () => {
  it("removes sensitive keys and keeps the rest, without mutating the input", () => {
    const input = new URLSearchParams(
      "inspect=019f79f4&token=secret&tab=activity&state=abc",
    )
    const out = scrubSensitiveParams(input)
    expect(out.get("inspect")).toBe("019f79f4")
    expect(out.get("tab")).toBe("activity")
    expect(out.has("token")).toBe(false)
    expect(out.has("state")).toBe(false)
    // input untouched — route handlers still read the original.
    expect(input.has("token")).toBe(true)
  })
})

describe("pathWithScrubbedQuery", () => {
  it("preserves a benign deep-link query (Inspector)", () => {
    const params = new URLSearchParams("inspect=019f79f4-4c7f-7150")
    expect(
      pathWithScrubbedQuery(
        "/o/acme/debug/archetype-table/normal-table",
        params,
      ),
    ).toBe(
      "/o/acme/debug/archetype-table/normal-table?inspect=019f79f4-4c7f-7150",
    )
  })

  it("drops the query entirely when only sensitive keys were present", () => {
    const params = new URLSearchParams("token=secret&code=xyz")
    expect(pathWithScrubbedQuery("/auth/reset-password", params)).toBe(
      "/auth/reset-password",
    )
  })

  it("returns the bare pathname when there is no query", () => {
    expect(pathWithScrubbedQuery("/workspace", new URLSearchParams())).toBe(
      "/workspace",
    )
  })
})
