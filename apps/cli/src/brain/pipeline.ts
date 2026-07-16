// [WP2 Task 2.5] `brain pipeline <pdf>` — the single-command autonomy glue that chains the three existing
// Brain steps for ONE document: extract (vision-OCR → machine IR) → event (propose the accounting case) →
// [human approves] → book (propose the capture). It is INSTRUCT-AND-EXIT, not a resident poller: at each
// human-review gate it prints the held-write reviewId + the approval URL + the exact resume command, then
// EXITS. The operator approves in the UI, copies the applied eventId, and re-invokes — completed stages are
// skipped via the on-disk checkpoint. This matches the repo's push-not-poll HITL doctrine: the CLI never
// polls `list_accounting_held_writes` (the agent key is 403 on the held-writes surface, and a pending row
// carries no applied eventId anyway). NO server change — it only composes the existing commands' cores.
//
// The checkpoint is a SEPARATE small state from the bulk `book-batch` `CheckpointState` (this is a 3-stage
// single-document flow, not a many-document set), so `checkpoint-store.ts`'s `FileCheckpointStore` stays an
// unchanged primitive and this doesn't overload its shape.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { dirname } from "node:path"

/**
 * The next stage a pipeline run must execute. A fresh run (no checkpoint) always begins by extracting, so
 * `"extract"` is only ever the IMPLICIT start; once extract lands the checkpoint records the next gate-bearing
 * stage. `"event"` proposes the case (first human gate); `"book"` proposes the capture (second human gate);
 * `"done"` means both were proposed and the operator need only finish approving.
 */
type PipelineStage = "event" | "book" | "done"

/**
 * The crash-safe resume state for ONE `brain pipeline` document. `pdf` is a guard: a checkpoint from a
 * different source file is ignored (start fresh) so a stale file can never silently skip an unrelated
 * document. `irPath` is the extracted IR the later stages read (so a resume never re-runs the costly extract
 * session). The reviewIds are recorded for the operator's audit trail; `eventId` is the APPLIED event uuid the
 * operator supplied on the resume that ran the book stage.
 */
export interface PipelineCheckpoint {
  version: 1
  /** The source PDF/image path this checkpoint tracks (resume guard). */
  pdf: string
  /** The next stage to run. */
  next: PipelineStage
  /** The extracted machine IR Invoice file the event/book stages consume. */
  irPath: string
  /** The event held-write reviewId (recorded when the event stage HELD). */
  eventReviewId?: string
  /** The APPLIED accounting-event uuid the operator supplied to resume into the book stage. */
  eventId?: string
  /** The capture held-write reviewId (recorded when the book stage HELD). */
  bookReviewId?: string
}

/**
 * A JSON-file-backed store for the pipeline checkpoint. Writes ATOMICALLY (sibling `.tmp` + rename), so a kill
 * mid-write leaves either the previous good file or the fully-written new one — never a half-written one. A
 * malformed / wrong-shape / wrong-version file loads as `null` (start fresh) rather than throwing. Mirrors
 * `FileCheckpointStore`'s atomic pattern without reusing its bulk-batch `CheckpointState` type.
 */
export class PipelineCheckpointStore {
  constructor(private readonly path: string) {}

  load(): PipelineCheckpoint | null {
    if (!existsSync(this.path)) return null
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, "utf8"))
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as PipelineCheckpoint).version === 1 &&
        typeof (parsed as PipelineCheckpoint).pdf === "string" &&
        typeof (parsed as PipelineCheckpoint).irPath === "string" &&
        isPipelineStage((parsed as PipelineCheckpoint).next)
      ) {
        return parsed as PipelineCheckpoint
      }
      return null
    } catch {
      return null
    }
  }

  save(state: PipelineCheckpoint): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2))
    renameSync(tmp, this.path)
  }
}

/** True when `value` is one of the known pipeline stages (guards a loaded checkpoint's `next`). */
function isPipelineStage(value: unknown): value is PipelineStage {
  return value === "event" || value === "book" || value === "done"
}

/**
 * Resolve the checkpoint a run should start from, applying the `pdf` guard: a checkpoint whose `pdf` does not
 * match this invocation's source file is DISCARDED (returns `null` → start fresh from extract), so a stale
 * checkpoint left next to a different document can never make the pipeline skip the wrong file's stages. A
 * matching checkpoint is returned verbatim so completed stages are skipped. PURE.
 */
export function resumeFrom(
  loaded: PipelineCheckpoint | null,
  pdf: string,
): PipelineCheckpoint | null {
  if (loaded === null) return null
  return loaded.pdf === pdf ? loaded : null
}

/** The gate message + resume instruction a stage prints when it HELDs a write and exits (instruct-and-exit). */
export interface PipelineGate {
  /** The held-write reviewId the operator approves. */
  reviewId: string
  /** The rendered, ready-to-read gate text. */
  text: string
}

/**
 * Render the EVENT-stage gate: the event HELD for review, so the operator must approve it, copy the applied
 * eventId off `/approvals`, and re-invoke the pipeline with `--after-event`. Instruct-and-exit — the CLI does
 * NOT poll for the approval (push-not-poll; the agent key can't read the held row anyway). `resumeCommand` is
 * the exact command the operator runs next.
 */
export function renderEventGate(
  reviewId: string,
  resumeCommand: string,
): PipelineGate {
  const text = [
    "",
    `── pipeline gate 1/2: accounting EVENT HELD for review ──`,
    `  reviewId = ${reviewId}`,
    "  1. Approve it at /{orgSlug}/accounting/approvals (a human verifies the extracted counterparty).",
    "  2. Copy the APPLIED event id shown after approval.",
    "  3. Resume the pipeline with that id:",
    `       ${resumeCommand}`,
    "  (The pipeline exits now — it does not poll; you drive the approval.)",
    "",
  ].join("\n")
  return { reviewId, text }
}

/**
 * Render the BOOK-stage gate: the capture HELD for review — the final human gate. Once approved the document
 * is fully booked; there is no further pipeline step, so no resume command is printed.
 */
export function renderBookGate(reviewId: string): PipelineGate {
  const text = [
    "",
    `── pipeline gate 2/2: accounting CAPTURE HELD for review ──`,
    `  reviewId = ${reviewId}`,
    "  Approve it at /{orgSlug}/accounting/approvals to finish booking the document.",
    "  Pipeline complete after this approval — nothing more to run.",
    "",
  ].join("\n")
  return { reviewId, text }
}
