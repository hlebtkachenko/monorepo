// M0.6 — the on-disk checkpoint store for the bulk book orchestrator. Filesystem-only (NO creds, NO Agent
// SDK), so it is injected into the pure `runBatch` engine and unit-testable on its own. Atomic writes make it
// crash-safe: a kill mid-write leaves either the previous good file or the fully-written new one, never a
// half-written, unparseable one.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { dirname } from "node:path"
import type { CheckpointState, CheckpointStore } from "./batch"

/**
 * A JSON-file-backed {@link CheckpointStore}. Writes ATOMICALLY (write a sibling `.tmp`, then rename over the
 * target). A malformed / unreadable / wrong-shape file loads as `null` (start fresh) rather than throwing, so
 * a corrupt checkpoint degrades to a clean run instead of crashing the batch.
 */
export class FileCheckpointStore implements CheckpointStore {
  constructor(private readonly path: string) {}

  load(): CheckpointState | null {
    if (!existsSync(this.path)) return null
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, "utf8"))
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed as CheckpointState).version === 1 &&
        typeof (parsed as CheckpointState).folder === "string" &&
        typeof (parsed as CheckpointState).docs === "object"
      ) {
        return parsed as CheckpointState
      }
      return null
    } catch {
      return null
    }
  }

  save(state: CheckpointState): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(state, null, 2))
    renameSync(tmp, this.path)
  }
}
