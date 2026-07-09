import { Test, type TestingModule } from "@nestjs/testing"
import { beforeEach, describe, expect, it } from "vitest"

import { StructureController } from "./structure.controller"

/**
 * `GET /v1/structure` + `GET /v1/structure/archetypes` — public IA discovery
 * ops. Both serve static, tenant-agnostic data (no DB, no auth), so the tests
 * assert the snapshot shape directly off the controller.
 */

describe("StructureController", () => {
  let controller: StructureController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StructureController],
    }).compile()
    controller = module.get(StructureController)
  })

  it("getStructure returns the ten rail modules in rail order", () => {
    const { modules } = controller.getStructure()
    expect(modules).toHaveLength(10)
    expect(modules[0]?.key).toBe("") // Company index
    expect(modules.map((m) => m.key)).toEqual([
      "",
      "accounting",
      "documents",
      "finance",
      "hr",
      "assets",
      "closing",
      "reports",
      "directory",
      "settings",
    ])
  })

  it("exposes a known deep leaf with its build-status", () => {
    const closing = controller
      .getStructure()
      .modules.find((m) => m.key === "closing")
    expect(closing).toBeDefined()
    const vat = closing?.pages.find((p) => p.route === "closing/vat")
    expect(vat?.group).toBe("Obligations")
    const dap = vat?.subpages.find((s) => s.route === "closing/vat/dap")
    expect(dap?.label).toBe("VAT return")
    expect(dap?.tba).toBe(false)
    // This shipped page still carries no assigned archetype.
    expect(dap?.archetype).toBeNull()
  })

  it("every leaf route is org-slug-free (no placeholder slug leaked)", () => {
    for (const mod of controller.getStructure().modules) {
      for (const page of mod.pages) {
        expect(page.route).not.toContain("__slug__")
        for (const sub of page.subpages) {
          expect(sub.route).not.toContain("__slug__")
        }
      }
    }
  })

  it("listArchetypes returns the five layout archetypes", () => {
    const { archetypes } = controller.listArchetypes()
    expect(archetypes).toHaveLength(5)
    expect(archetypes.map((a) => a.key)).toEqual([
      "Table",
      "Blank",
      "Launchpad",
      "Dashboard",
      "Single",
    ])
    const table = archetypes.find((a) => a.key === "Table")
    expect(table?.demoRoute).toBe("demo-table")
  })
})
