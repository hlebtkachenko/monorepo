import { describe, expect, it } from "vitest"

import { safeNextPath } from "./safe-next-path"

describe("safeNextPath", () => {
  it("returns / for empty / undefined / null", () => {
    expect(safeNextPath(undefined)).toBe("/")
    expect(safeNextPath(null)).toBe("/")
    expect(safeNextPath("")).toBe("/")
  })

  it("returns / for non-/ start", () => {
    expect(safeNextPath("orgs")).toBe("/")
    expect(safeNextPath("http://evil.com")).toBe("/")
  })

  it("rejects protocol-relative URLs", () => {
    expect(safeNextPath("//evil.com")).toBe("/")
    expect(safeNextPath("//evil.com/path")).toBe("/")
  })

  it("rejects backslash escapes", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/")
  })

  it("rejects javascript: / data: / vbscript: schemes after /", () => {
    expect(safeNextPath("/javascript:alert(1)")).toBe("/")
    expect(safeNextPath("/data:text/html,<script>")).toBe("/")
    expect(safeNextPath("/vbscript:msgbox")).toBe("/")
  })

  it("passes through normal admin paths", () => {
    expect(safeNextPath("/")).toBe("/")
    expect(safeNextPath("/orgs")).toBe("/orgs")
    expect(safeNextPath("/dev/sql")).toBe("/dev/sql")
    expect(safeNextPath("/users/abc-123/sessions")).toBe(
      "/users/abc-123/sessions",
    )
  })

  it("preserves query + hash", () => {
    expect(safeNextPath("/orgs?page=2")).toBe("/orgs?page=2")
    expect(safeNextPath("/users#top")).toBe("/users#top")
  })
})
