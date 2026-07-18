import { describe, expect, it } from "vitest"
import worker from "./http"

const env = { AFFRAME_API_BASE: "https://api.example.test" }

describe("hosted MCP Worker auth gate", () => {
  it("serves an unauthenticated health probe", async () => {
    const res = await worker.fetch(
      new Request("https://mcp.afframe.com/health"),
      env,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: "ok" })
  })

  it("rejects a request with no Authorization header (401)", async () => {
    const res = await worker.fetch(
      new Request("https://mcp.afframe.com/", { method: "POST" }),
      env,
    )
    expect(res.status).toBe(401)
    expect(res.headers.get("www-authenticate")).toContain("Bearer")
  })

  it("rejects an empty Bearer token (401)", async () => {
    const res = await worker.fetch(
      new Request("https://mcp.afframe.com/", {
        method: "POST",
        headers: { authorization: "Bearer " },
      }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it("rejects a non-Bearer scheme (401)", async () => {
    const res = await worker.fetch(
      new Request("https://mcp.afframe.com/", {
        method: "POST",
        headers: { authorization: "Basic Zm9vOmJhcg==" },
      }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it("does not enumerate tools to an unauthenticated GET (401, not 200)", async () => {
    const res = await worker.fetch(new Request("https://mcp.afframe.com/"), env)
    expect(res.status).toBe(401)
  })

  it("fails closed (500) when AFFRAME_API_BASE is unset", async () => {
    const res = await worker.fetch(
      new Request("https://mcp.afframe.com/", {
        method: "POST",
        headers: { authorization: "Bearer affk_test" },
      }),
      { AFFRAME_API_BASE: "" },
    )
    expect(res.status).toBe(500)
  })

  it("serves the group catalog unauthenticated at GET /groups", async () => {
    const res = await worker.fetch(
      new Request("https://mcp.afframe.com/groups"),
      env,
    )
    expect(res.status).toBe(200)
    const catalog = (await res.json()) as { slug: string; count: number }[]
    expect(Array.isArray(catalog)).toBe(true)
    expect(catalog.some((g) => g.slug === "invoices")).toBe(true)
  })
})
