import { describe, expect, it } from "vitest"
import worker, { parseSelection } from "./http"

const env = {
  AFFRAME_API_BASE: "https://api.example.test",
  OAUTH_ISSUER: "https://app.example.test/api/auth",
}

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
      { AFFRAME_API_BASE: "", OAUTH_ISSUER: env.OAUTH_ISSUER },
    )
    expect(res.status).toBe(500)
  })

  it("normalizes empty/blank groups to no selection (never a zero-tool server)", () => {
    expect(parseSelection(new URL("https://x/")).groups).toBeUndefined()
    expect(parseSelection(new URL("https://x/?groups=")).groups).toBeUndefined()
    expect(
      parseSelection(new URL("https://x/?groups=,%20,")).groups,
    ).toBeUndefined()
  })

  it("parses + trims a real group list and validates scope", () => {
    const sel = parseSelection(
      new URL("https://x/?groups=invoices,%20accounting&scope=read"),
    )
    expect(sel.groups).toEqual(["invoices", "accounting"])
    expect(sel.scope).toBe("read")
    expect(
      parseSelection(new URL("https://x/?scope=bogus")).scope,
    ).toBeUndefined()
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

  it("serves RFC 9728 protected-resource metadata unauthenticated", async () => {
    const res = await worker.fetch(
      new Request(
        "https://mcp.afframe.com/.well-known/oauth-protected-resource",
      ),
      env,
    )
    expect(res.status).toBe(200)
    const meta = (await res.json()) as {
      resource: string
      authorization_servers: string[]
    }
    // resource is the Worker's own origin (the canonical audience the client
    // echoes as RFC 8707 `resource` so the AS stamps a matching `aud`).
    expect(meta.resource).toBe("https://mcp.afframe.com")
    expect(meta.authorization_servers).toEqual([env.OAUTH_ISSUER])
  })

  it("points a 401 at the protected-resource metadata (RFC 9728 §5.1)", async () => {
    const res = await worker.fetch(
      new Request("https://mcp.afframe.com/", { method: "POST" }),
      env,
    )
    expect(res.status).toBe(401)
    expect(res.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://mcp.afframe.com/.well-known/oauth-protected-resource"',
    )
  })

  it("fails closed (500) on metadata when OAUTH_ISSUER is unset", async () => {
    const res = await worker.fetch(
      new Request(
        "https://mcp.afframe.com/.well-known/oauth-protected-resource",
      ),
      { AFFRAME_API_BASE: env.AFFRAME_API_BASE, OAUTH_ISSUER: "" },
    )
    expect(res.status).toBe(500)
  })
})
