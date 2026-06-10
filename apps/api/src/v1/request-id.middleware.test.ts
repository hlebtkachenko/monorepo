import { describe, expect, it } from "vitest"
import type { NextFunction, Response } from "express"

import {
  RequestIdMiddleware,
  type RequestWithId,
} from "./request-id.middleware"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function run(incoming?: string): {
  req: RequestWithId
  headers: Map<string, string>
} {
  const middleware = new RequestIdMiddleware()
  const req = {
    headers: incoming === undefined ? {} : { "x-request-id": incoming },
  } as unknown as RequestWithId
  const headers = new Map<string, string>()
  const res = {
    setHeader: (name: string, value: string) => {
      headers.set(name, value)
    },
  } as unknown as Response
  middleware.use(req, res, (() => {}) as NextFunction)
  return { req, headers }
}

describe("RequestIdMiddleware", () => {
  it("honors a well-formed caller-supplied id", () => {
    const { req, headers } = run("abc-DEF_123")
    expect(req.requestId).toBe("abc-DEF_123")
    expect(headers.get("X-Request-Id")).toBe("abc-DEF_123")
  })

  it("honors a 64-char id but regenerates a 65-char one", () => {
    const ok = "a".repeat(64)
    expect(run(ok).req.requestId).toBe(ok)
    expect(run("a".repeat(65)).req.requestId).toMatch(UUID_RE)
  })

  it("regenerates when the id contains characters outside [A-Za-z0-9_-]", () => {
    for (const bad of ["abc def", "abc`def", "abc\ndef", "id;rm -rf", "äöü"]) {
      const { req, headers } = run(bad)
      expect(req.requestId).toMatch(UUID_RE)
      expect(headers.get("X-Request-Id")).toBe(req.requestId)
    }
  })

  it("generates a UUID when the header is absent or empty", () => {
    expect(run().req.requestId).toMatch(UUID_RE)
    expect(run("").req.requestId).toMatch(UUID_RE)
  })
})
