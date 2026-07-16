import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  PipelineCheckpointStore,
  renderBookGate,
  renderEventGate,
  resumeFrom,
  type PipelineCheckpoint,
} from "./pipeline"

// [WP2 Task 2.5] The pure, creds-free core of `brain pipeline`: the crash-safe checkpoint store, the pdf-guard
// resume decision, and the instruct-and-exit gate rendering. The live stages (extract / event / book) drive
// the SDK + REST client and are covered by the underlying commands' own tests; here we lock the state machine.

describe("PipelineCheckpointStore (atomic, crash-safe)", () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brain-pipeline-cp-"))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const sample = (): PipelineCheckpoint => ({
    version: 1,
    pdf: "/docs/FP-0042.pdf",
    next: "book",
    irPath: "/docs/FP-0042.pdf.ir.json",
    eventReviewId: "review-1",
  })

  it("returns null when no checkpoint file exists (fresh run)", () => {
    const store = new PipelineCheckpointStore(join(dir, "cp.json"))
    expect(store.load()).toBeNull()
  })

  it("round-trips a saved checkpoint", () => {
    const store = new PipelineCheckpointStore(join(dir, "cp.json"))
    const cp = sample()
    store.save(cp)
    expect(store.load()).toEqual(cp)
  })

  it("writes atomically (leaves no .tmp sibling behind)", () => {
    const path = join(dir, "cp.json")
    const store = new PipelineCheckpointStore(path)
    store.save(sample())
    expect(() => readFileSync(`${path}.tmp`)).toThrow()
  })

  it("loads null on a malformed (non-JSON) file — degrades to a fresh run, never throws", () => {
    const path = join(dir, "cp.json")
    writeFileSync(path, "{ not json")
    expect(new PipelineCheckpointStore(path).load()).toBeNull()
  })

  it("loads null on a wrong-version / wrong-shape file", () => {
    const path = join(dir, "cp.json")
    writeFileSync(path, JSON.stringify({ version: 2, pdf: "x", next: "book" }))
    expect(new PipelineCheckpointStore(path).load()).toBeNull()
  })

  it("loads null when `next` is not a known stage", () => {
    const path = join(dir, "cp.json")
    writeFileSync(
      path,
      JSON.stringify({ version: 1, pdf: "x", next: "extract", irPath: "y" }),
    )
    expect(new PipelineCheckpointStore(path).load()).toBeNull()
  })
})

describe("resumeFrom (pdf-guard resume decision)", () => {
  const cp = (pdf: string): PipelineCheckpoint => ({
    version: 1,
    pdf,
    next: "book",
    irPath: `${pdf}.ir.json`,
  })

  it("returns null when there is no loaded checkpoint (start fresh)", () => {
    expect(resumeFrom(null, "/docs/a.pdf")).toBeNull()
  })

  it("resumes a checkpoint whose pdf matches", () => {
    const loaded = cp("/docs/a.pdf")
    expect(resumeFrom(loaded, "/docs/a.pdf")).toBe(loaded)
  })

  it("DISCARDS a checkpoint left next to a different document (guard against skipping the wrong file)", () => {
    expect(resumeFrom(cp("/docs/other.pdf"), "/docs/a.pdf")).toBeNull()
  })
})

describe("gate rendering (instruct-and-exit)", () => {
  it("event gate names the reviewId, the approvals path, and the exact resume command", () => {
    const gate = renderEventGate(
      "review-abc",
      "brain pipeline a.pdf --context c.json --after-event <APPLIED_EVENT_ID>",
    )
    expect(gate.reviewId).toBe("review-abc")
    expect(gate.text).toContain("review-abc")
    expect(gate.text).toContain("/accounting/approvals")
    expect(gate.text).toContain("--after-event <APPLIED_EVENT_ID>")
    // It must instruct-and-exit, not promise polling.
    expect(gate.text).toContain("does not poll")
  })

  it("book gate names the reviewId + approvals path and prints NO resume command (final gate)", () => {
    const gate = renderBookGate("review-xyz")
    expect(gate.reviewId).toBe("review-xyz")
    expect(gate.text).toContain("review-xyz")
    expect(gate.text).toContain("/accounting/approvals")
    expect(gate.text).toContain("Pipeline complete")
    expect(gate.text).not.toContain("--after-event")
  })
})
