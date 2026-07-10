import { describe, expect, it } from "vitest"

import {
  resolveEffectiveTimeline,
  singleEffectiveValue,
} from "../src/obligations/effective-timeline"

describe("resolveEffectiveTimeline", () => {
  it("preserves unknown gaps instead of inventing a default", () => {
    expect(
      resolveEffectiveTimeline({
        from: "2026-01-01",
        to: "2026-12-31",
        facts: [
          {
            sourceId: "vat-july",
            validFrom: "2026-07-01",
            validTo: null,
            value: "PAYER",
          },
        ],
      }),
    ).toEqual([
      {
        status: "UNKNOWN",
        from: "2026-01-01",
        to: "2026-06-30",
      },
      {
        status: "KNOWN",
        from: "2026-07-01",
        to: "2026-12-31",
        fact: {
          sourceId: "vat-july",
          validFrom: "2026-07-01",
          validTo: null,
          value: "PAYER",
        },
      },
    ])
  })

  it("clips facts to the requested interval and keeps adjacent changes", () => {
    const timeline = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [
        {
          sourceId: "monthly",
          validFrom: "2025-01-01",
          validTo: "2026-06-30",
          value: "MONTHLY",
        },
        {
          sourceId: "quarterly",
          validFrom: "2026-07-01",
          validTo: null,
          value: "QUARTERLY",
        },
      ],
    })

    expect(
      timeline.map(({ status, from, to }) => ({ status, from, to })),
    ).toEqual([
      { status: "KNOWN", from: "2026-01-01", to: "2026-06-30" },
      { status: "KNOWN", from: "2026-07-01", to: "2026-12-31" },
    ])
  })

  it("rejects overlaps instead of choosing a latest row", () => {
    expect(() =>
      resolveEffectiveTimeline({
        from: "2026-01-01",
        to: "2026-12-31",
        facts: [
          {
            sourceId: "first",
            validFrom: "2026-01-01",
            validTo: "2026-08-31",
            value: true,
          },
          {
            sourceId: "second",
            validFrom: "2026-08-01",
            validTo: null,
            value: false,
          },
        ],
      }),
    ).toThrow(/Overlapping effective facts second/)
  })
})

describe("singleEffectiveValue", () => {
  const sameString = (a: string, b: string) => a === b

  it("returns a value only for a complete invariant timeline", () => {
    const timeline = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [
        {
          sourceId: "full-year",
          validFrom: "2026-01-01",
          validTo: null,
          value: "PAYER",
        },
      ],
    })
    expect(singleEffectiveValue(timeline, sameString)).toBe("PAYER")
  })

  it("returns undefined for gaps or value changes", () => {
    const gap = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [],
    })
    const changed = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [
        {
          sourceId: "first",
          validFrom: "2026-01-01",
          validTo: "2026-06-30",
          value: "NON_PAYER",
        },
        {
          sourceId: "second",
          validFrom: "2026-07-01",
          validTo: null,
          value: "PAYER",
        },
      ],
    })

    expect(singleEffectiveValue(gap, sameString)).toBeUndefined()
    expect(singleEffectiveValue(changed, sameString)).toBeUndefined()
  })
})
