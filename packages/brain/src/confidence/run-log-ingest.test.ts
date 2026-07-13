import { describe, expect, expectTypeOf, it } from "vitest"

import {
  type CalibrationSample,
  ingestReviewedRow,
  ingestReviewedRunLog,
  type ReviewedRunLogRow,
  toRunLogEntries,
} from "./run-log-ingest"
import type { HumanReviewOutcome, RunLogEntry } from "./calibration"

// M3.3 — run-log ingestion pipeline tests. Fixture rows only (no DB): every case constructs a plain
// `ReviewedRunLogRow` the way a `tool_call_log` SELECT would shape it, and asserts the pure mapper's
// fail-closed skip rules + the CalibrationSample it emits when a row qualifies.

/** A resolved row with a shadow score present, overridable per test. */
function row(overrides: Partial<ReviewedRunLogRow> = {}): ReviewedRunLogRow {
  return {
    toolCallLogId: "tcl-1",
    conversationId: "conv-1",
    createdAt: "2026-07-01T00:00:00.000Z",
    outputJson: {
      resolution: "approved",
      serverGate: { shadow: { serverLane: { cRaw: 0.72 } } },
    },
    ...overrides,
  }
}

describe("ingestReviewedRow — happy paths", () => {
  it("an approved reviewed row becomes a positive CalibrationSample", () => {
    const sample = ingestReviewedRow(row())
    expect(sample).toEqual({
      runId: "conv-1",
      predictedScore: 0.72,
      actualCorrect: true,
      outcome: "booked_correct",
      provenance: {
        toolCallLogId: "tcl-1",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    } satisfies CalibrationSample)
  })

  it("a rejected reviewed row becomes a negative CalibrationSample", () => {
    const sample = ingestReviewedRow(
      row({
        outputJson: {
          resolution: "rejected",
          serverGate: { shadow: { serverLane: { cRaw: 0.4 } } },
        },
      }),
    )
    expect(sample).toEqual({
      runId: "conv-1",
      predictedScore: 0.4,
      actualCorrect: false,
      outcome: "human_rejected",
      provenance: {
        toolCallLogId: "tcl-1",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    } satisfies CalibrationSample)
  })

  it("falls back to the toolCallLogId as runId when there is no conversation", () => {
    const sample = ingestReviewedRow(row({ conversationId: null }))
    expect(sample?.runId).toBe("tcl-1")
  })

  it("normalizes a Date createdAt to an ISO string in provenance", () => {
    const createdAt = new Date("2026-07-05T12:34:56.000Z")
    const sample = ingestReviewedRow(row({ createdAt }))
    expect(sample?.provenance.createdAt).toBe("2026-07-05T12:34:56.000Z")
  })
})

describe("ingestReviewedRow — fail-closed skip rules (never fabricate a label or score)", () => {
  it("skips a row with no resolution yet (still held)", () => {
    const sample = ingestReviewedRow(
      row({
        outputJson: {
          serverGate: { shadow: { serverLane: { cRaw: 0.9 } } },
        },
      }),
    )
    expect(sample).toBeNull()
  })

  it("skips a row whose resolution is an unrecognized value", () => {
    const sample = ingestReviewedRow(
      row({
        outputJson: {
          resolution: "corrected", // not a value this pipeline understands today
          serverGate: { shadow: { serverLane: { cRaw: 0.9 } } },
        },
      }),
    )
    expect(sample).toBeNull()
  })

  it("skips a row with no shadow score at all", () => {
    const sample = ingestReviewedRow(
      row({ outputJson: { resolution: "approved" } }),
    )
    expect(sample).toBeNull()
  })

  it("skips a row whose serverGate.shadow is missing", () => {
    const sample = ingestReviewedRow(
      row({ outputJson: { resolution: "approved", serverGate: {} } }),
    )
    expect(sample).toBeNull()
  })

  it("skips a row whose serverLane.cRaw is non-numeric", () => {
    const sample = ingestReviewedRow(
      row({
        outputJson: {
          resolution: "approved",
          serverGate: { shadow: { serverLane: { cRaw: "0.9" } } },
        },
      }),
    )
    expect(sample).toBeNull()
  })

  it("skips a row whose serverLane.cRaw is NaN/Infinity", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const sample = ingestReviewedRow(
        row({
          outputJson: {
            resolution: "approved",
            serverGate: { shadow: { serverLane: { cRaw: bad } } },
          },
        }),
      )
      expect(sample).toBeNull()
    }
  })

  it("skips a row whose output_json is null (no output persisted yet)", () => {
    const sample = ingestReviewedRow(row({ outputJson: null }))
    expect(sample).toBeNull()
  })

  it("skips a row whose output_json is not an object", () => {
    const sample = ingestReviewedRow(row({ outputJson: "not-json" }))
    expect(sample).toBeNull()
  })

  it("deliberately reads serverLane, never claimLane, as the predicted score", () => {
    const sample = ingestReviewedRow(
      row({
        outputJson: {
          resolution: "approved",
          serverGate: {
            shadow: {
              serverLane: { cRaw: 0.3 },
              claimLane: { cRaw: 0.99 },
            },
          },
        },
      }),
    )
    expect(sample?.predictedScore).toBe(0.3)
  })
})

describe("ingestReviewedRunLog — batch ingestion", () => {
  it("empty input yields an empty output (the fit stays correctly data-gated)", () => {
    expect(ingestReviewedRunLog([])).toEqual([])
  })

  it("drops skipped rows and keeps qualifying ones, in order", () => {
    const rows: ReviewedRunLogRow[] = [
      row({ toolCallLogId: "a", conversationId: "conv-a" }),
      row({ toolCallLogId: "b", outputJson: {} }), // skipped: no resolution
      row({
        toolCallLogId: "c",
        conversationId: "conv-c",
        outputJson: {
          resolution: "rejected",
          serverGate: { shadow: { serverLane: { cRaw: 0.1 } } },
        },
      }),
    ]
    const samples = ingestReviewedRunLog(rows)
    expect(samples).toHaveLength(2)
    expect(samples.map((s) => s.provenance.toolCallLogId)).toEqual(["a", "c"])
  })

  it("a batch of only unreviewed/malformed rows yields an empty output", () => {
    const rows: ReviewedRunLogRow[] = [
      row({ outputJson: {} }),
      row({ outputJson: null }),
      row({ outputJson: { resolution: "approved" } }), // no shadow
    ]
    expect(ingestReviewedRunLog(rows)).toEqual([])
  })
})

describe("toRunLogEntries — reshapes into refitCalibration's exact input, fits nothing", () => {
  it("maps runId/predictedScore/outcome onto RunLogEntry's runId/score/outcome", () => {
    const samples = ingestReviewedRunLog([
      row({ toolCallLogId: "a", conversationId: "conv-a" }),
      row({
        toolCallLogId: "b",
        conversationId: "conv-b",
        outputJson: {
          resolution: "rejected",
          serverGate: { shadow: { serverLane: { cRaw: 0.2 } } },
        },
      }),
    ])
    const entries = toRunLogEntries(samples)
    expect(entries).toEqual([
      { runId: "conv-a", score: 0.72, outcome: "booked_correct" },
      { runId: "conv-b", score: 0.2, outcome: "human_rejected" },
    ] satisfies RunLogEntry[])
  })

  it("empty samples yield empty entries", () => {
    expect(toRunLogEntries([])).toEqual([])
  })
})

describe("CalibrationSample.outcome — a human-review enum, not a model-belief boolean", () => {
  it("outcome is typed as HumanReviewOutcome, structurally distinct from a plain boolean", () => {
    expectTypeOf<
      CalibrationSample["outcome"]
    >().toEqualTypeOf<HumanReviewOutcome>()
    expectTypeOf<CalibrationSample["outcome"]>().not.toEqualTypeOf<boolean>()
  })
})
