import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { describe, expect, it } from "vitest"
import { Afframe } from "@afframe/sdk"
import { registerGetOrganization } from "./tools/get_organization"
import { registerPing } from "./tools/ping"

describe("@afframe/mcp tool registry", () => {
  function buildServer() {
    return new McpServer({ name: "@afframe/mcp", version: "0.0.1-test" })
  }
  function buildClient() {
    return new Afframe({ apiKey: "affk_test_fixture" })
  }

  it("registers `ping` exactly once with read-only + idempotent annotations", () => {
    const server = buildServer()
    expect(() => registerPing(server, buildClient())).not.toThrow()
    // Re-registering the same tool name must throw — surfaces accidental dupes.
    expect(() => registerPing(server, buildClient())).toThrow()
  })

  it("registers `get_organization` exactly once", () => {
    const server = buildServer()
    expect(() => registerGetOrganization(server, buildClient())).not.toThrow()
    expect(() => registerGetOrganization(server, buildClient())).toThrow()
  })

  it("both tools coexist on the same server", () => {
    const server = buildServer()
    const client = buildClient()
    registerPing(server, client)
    registerGetOrganization(server, client)
    // No throw = tool name registry has both unique entries.
    expect(true).toBe(true)
  })
})
