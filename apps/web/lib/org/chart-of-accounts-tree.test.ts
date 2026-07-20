import { describe, expect, it } from "vitest"

import type { ChartAccountView } from "./accounting"
import { buildChartTree } from "./chart-of-accounts-tree"

/** Build a full ChartAccountView from the few fields a projection test cares about. */
function acc(
  partial: Partial<ChartAccountView> & { id: string },
): ChartAccountView {
  return {
    id: partial.id,
    number: partial.number ?? partial.id,
    name: partial.name ?? partial.id,
    nature: partial.nature ?? "ASSET",
    statementClass: partial.statementClass ?? "BALANCE_SHEET",
    accountType: partial.accountType ?? "ACTIVE",
    normalBalance: partial.normalBalance ?? "DEBIT",
    tracksOpenItems: partial.tracksOpenItems ?? false,
    taxRelevant: partial.taxRelevant ?? null,
    parentId: partial.parentId ?? null,
    class: partial.class ?? 0,
    groupCode: partial.groupCode ?? null,
    syntheticCode: partial.syntheticCode ?? "000",
    isSynthetic: partial.isSynthetic ?? true,
    specializesDirectiveCode: partial.specializesDirectiveCode ?? null,
  }
}

const className = (cls: number) => `T${cls}`

describe("buildChartTree", () => {
  it("nests Class → Group → Synthetic → Analytical from the flat rows", () => {
    const tree = buildChartTree(
      [
        acc({
          id: "a012",
          number: "012",
          class: 0,
          groupCode: "01",
          syntheticCode: "012",
        }),
        acc({
          id: "a012.001",
          number: "012.001",
          class: 0,
          groupCode: "01",
          syntheticCode: "012",
          isSynthetic: false,
          parentId: "a012",
        }),
        acc({
          id: "a311",
          number: "311",
          class: 3,
          groupCode: "31",
          syntheticCode: "311",
          tracksOpenItems: true,
          taxRelevant: false,
        }),
        acc({
          id: "a311.001",
          number: "311.001",
          class: 3,
          groupCode: "31",
          syntheticCode: "311",
          isSynthetic: false,
          parentId: "a311",
        }),
      ],
      className,
    )

    // Two class tiers, in input (number-ascending) order.
    expect(tree.map((n) => n.id)).toEqual(["class:0", "class:3"])
    const class0 = tree[0]!
    expect(class0.values).toMatchObject({ number: "0", name: "T0" })
    expect(class0.selectable).toBe(false)
    expect(class0.editable).toBe(false)

    // Class 0 → Group 01 → Synthetic 012 → Analytical 012.001.
    const group01 = class0.subRows![0]!
    expect(group01.id).toBe("group:01")
    expect(group01.selectable).toBe(false)
    expect(group01.values).toMatchObject({ number: "01" })
    const synth012 = group01.subRows![0]!
    expect(synth012.id).toBe("a012")
    // The record id rides in `values` (not a column) for the row Inspector.
    expect(synth012.values.id).toBe("a012")
    // A real account row is selectable/editable by default (both undefined).
    expect(synth012.selectable).toBeUndefined()
    expect(synth012.subRows!.map((n) => n.id)).toEqual(["a012.001"])

    // Boolean + null flags serialize to the raw codes the view localizes.
    const synth311 = tree[1]!.subRows![0]!.subRows![0]!
    expect(synth311.values).toMatchObject({
      number: "311",
      statementClass: "BALANCE_SHEET",
      tracksOpenItems: "yes",
      taxRelevant: "no",
    })
    // A null flag stays null (rendered as an em dash), a false flag is "no".
    expect(synth012.values.tracksOpenItems).toBe("no")
    expect(synth012.values.taxRelevant).toBeNull()
  })

  it("promotes an analytical whose synthetic parent is absent, never dropping it", () => {
    const tree = buildChartTree(
      [
        acc({
          id: "a321.001",
          number: "321.001",
          class: 3,
          groupCode: "32",
          syntheticCode: "321",
          isSynthetic: false,
          parentId: "missing-321",
        }),
      ],
      className,
    )
    // Attached under its own Class/Group (from `class` + `groupCode`), as a root.
    const orphan = tree[0]!.subRows![0]!.subRows![0]!
    expect(tree[0]!.id).toBe("class:3")
    expect(tree[0]!.subRows![0]!.id).toBe("group:32")
    expect(orphan.id).toBe("a321.001")
    expect(orphan.subRows).toBeUndefined()
  })

  it("falls back to the 2-digit synthetic prefix when groupCode is null", () => {
    const tree = buildChartTree(
      [
        acc({
          id: "a701",
          number: "701",
          class: 7,
          groupCode: null,
          syntheticCode: "701",
        }),
      ],
      className,
    )
    expect(tree[0]!.id).toBe("class:7")
    expect(tree[0]!.subRows![0]!.id).toBe("group:70")
  })

  it("returns an empty forest for no accounts", () => {
    expect(buildChartTree([], className)).toEqual([])
  })
})
