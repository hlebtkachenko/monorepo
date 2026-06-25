import { describe, expect, it } from "vitest"

import { kbVersion, loadKb, loadKbVersion, verifyKbIntegrity } from "./index"

describe("accounting-kb version manifest", () => {
  it("version.json is present with a non-empty kb_version", () => {
    const v = loadKbVersion()
    expect(typeof v.kb_version).toBe("string")
    expect(v.kb_version.length).toBeGreaterThan(0)
    expect(kbVersion()).toBe(v.kb_version)
  })

  it("manifest lists every vendored file with a sha256 and byte count", () => {
    const { files } = loadKbVersion()
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      expect(f.path).toMatch(/\.(json|md)$/)
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(f.bytes).toBeGreaterThan(0)
    }
  })
})

describe("accounting-kb load", () => {
  const kb = loadKb()

  it("loads coa, both předkontace sets, and the Q-pattern index", () => {
    expect(kb.coa).toBeTypeOf("object")
    expect(kb.predkontace.purchase).toBeTypeOf("object")
    expect(kb.predkontace.sales).toBeTypeOf("object")
    expect(kb.qPatternIndex).toContain("Q-Pattern")
  })

  it("loads every decision tree named in the manifest", () => {
    const names = kb.version.contents.decision_trees.map((p) =>
      p.replace(/^decision-trees\//, "").replace(/\.json$/, ""),
    )
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(kb.decisionTrees[name]).toBeTypeOf("object")
    }
    expect(Object.keys(kb.decisionTrees)).toHaveLength(names.length)
    // Spot-check a tree the M0/M1 fixtures lean on.
    expect(kb.decisionTrees["pdp-92ba"]).toBeDefined()
  })
})

describe("accounting-kb integrity", () => {
  it("every vendored file matches its pinned sha256 (no silent edits)", () => {
    expect(verifyKbIntegrity()).toEqual([])
  })
})
