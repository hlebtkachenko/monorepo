import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { describe, expect, it } from "vitest"
import { createAfframeClient } from "@afframe/sdk"
import {
  GENERATED_TOOL_OPERATION_IDS,
  registerGeneratedTools,
} from "./tools/generated"

describe("@afframe/mcp tool registry", () => {
  function buildServer() {
    return new McpServer({ name: "@afframe/mcp", version: "0.0.1-test" })
  }
  function buildClient() {
    return createAfframeClient({ apiKey: "affk_test_fixture" })
  }

  it("generated codegen covers every committed operationId", () => {
    // Smoke: the table emitted by `pnpm --filter @afframe/mcp gen` carries
    // every operation in `apps/api/openapi/v1.json`. If a contributor adds an
    // op to the registry without re-running `gen:all`, the list shrinks and
    // CI's `mcp-coverage` gate fails.
    expect(GENERATED_TOOL_OPERATION_IDS.length).toBeGreaterThan(0)
    expect(GENERATED_TOOL_OPERATION_IDS).toContain("ping")
    expect(GENERATED_TOOL_OPERATION_IDS).toContain("getOrganization")
  })

  it("registers every generated tool exactly once", () => {
    const server = buildServer()
    const client = buildClient()
    expect(() => registerGeneratedTools(server, client)).not.toThrow()
    // Re-registering must throw — surfaces accidental dupes.
    expect(() => registerGeneratedTools(server, client)).toThrow()
  })
})
