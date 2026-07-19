import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { describe, expect, it } from "vitest"
import { buildClient } from "./client"
import {
  GENERATED_TOOL_OPERATION_IDS,
  registerGeneratedTools,
  TOOL_GROUP_CATALOG,
  type ToolSelection,
} from "./tools/generated"

/** Register onto a spy server and return the tool names that were registered. */
function registeredNames(selection?: ToolSelection): string[] {
  const names: string[] = []
  const server = {
    registerTool: (name: string) => {
      names.push(name)
    },
  } as unknown as McpServer
  registerGeneratedTools(server, buildClient("affk_test"), selection)
  return names
}

describe("registerGeneratedTools selection", () => {
  it("registers every tool with no selection (backward compatible)", () => {
    expect(registeredNames()).toHaveLength(GENERATED_TOOL_OPERATION_IDS.length)
  })

  it("registers only the invoices group when scoped by group", () => {
    expect(registeredNames({ groups: ["invoices"] })).toHaveLength(3)
  })

  it("registers only read-only tools with scope=read", () => {
    const names = registeredNames({ scope: "read" })
    expect(names).toHaveLength(26)
    expect(names.length).toBeLessThan(GENERATED_TOOL_OPERATION_IDS.length)
  })

  it("intersects group and scope (invoices read-only = list + get)", () => {
    expect(
      registeredNames({ groups: ["invoices"], scope: "read" }),
    ).toHaveLength(2)
  })

  it("registers nothing for an unknown group", () => {
    expect(registeredNames({ groups: ["does-not-exist"] })).toHaveLength(0)
  })

  it("group catalog counts sum to the full tool set", () => {
    const total = TOOL_GROUP_CATALOG.reduce((n, g) => n + g.count, 0)
    expect(total).toBe(GENERATED_TOOL_OPERATION_IDS.length)
  })
})
