import { describe, expect, it } from "vitest"

import { ARCHETYPES } from "./archetype-catalog"

describe("ARCHETYPES", () => {
  it("lists the five content-panel archetypes", () => {
    expect(ARCHETYPES.map((archetype) => archetype.label)).toEqual([
      "Table",
      "Blank",
      "Launchpad",
      "Dashboard",
      "Single",
    ])
  })
})
