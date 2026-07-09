// M0.2a′ — assemble the Brain login-pack safety-spine `sections` from their CANONICAL sources.
//
// The login pack (`buildLoginContext`) boots a live Brain session with a safety spine: the constitution,
// a confidence protocol, an escalation policy, a KB pointer, and a law summary. Those section texts used to
// be HAND-AUTHORED per session (the operator pasted them into a `--context` / `--inputs` JSON), so the
// highest-stakes one — the LOCKED constitution — was hand-copied on every run and could silently drift from
// (or drop) `.brain/constitution.md`. This module makes the constitution PROGRAMMATICALLY ASSEMBLED from
// that canonical file (byte-verbatim, no hand-copy → no drift), and makes the assembler the single
// FAIL-CLOSED choke point for the whole spine: a missing/blank safety section THROWS, never emits a login
// pack with a hole in the safety framing.
//
// SCOPE + the canonical-source reality (M0 discovery): the ONLY safety section with a canonical committed
// prose source is the constitution (`.brain/constitution.md`, LOCKED, human-authored). The confidence
// protocol, escalation policy, and law summary have NO canonical committed source doc today (their `.brain/`
// homes are README-only stubs, empty at M0), and the KB pointer is a runtime id+version, not authored text.
// Inventing text for the three would be authoring new safety framing — forbidden. So they stay operator-
// supplied for now, but the assembler still REFUSES to compose a pack when any of them is missing/blank. The
// gap (they lack a canonical source) is a human decision to surface, not one to paper over here.
//
// I/O boundary: this reads the committed constitution file at assemble time. That is the ONLY I/O; the
// downstream `buildLoginContext` stays PURE (it composes the already-assembled section strings). The reader
// is injectable so the fail-closed path is testable without touching the real locked file.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { LoginContextSections } from "./context-pack"

/**
 * Absolute path to the LOCKED canonical constitution (`packages/brain/.brain/constitution.md`), resolved
 * from THIS module's own location so it is correct regardless of the process CWD (the CLI runs from the
 * monorepo root; a package test runs from its own dir). Never edited here — read-only canonical source.
 */
export const CONSTITUTION_SOURCE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".brain",
  "constitution.md",
)

/**
 * The safety-spine sections the OPERATOR still supplies: everything EXCEPT the constitution (assembled from
 * canonical source) and the tool policy (pinned server-side by the login-pack construction site, never taken
 * from operator input). The assembler validates each is present and non-blank before composing the pack.
 */
export type OperatorLoginSections = Omit<
  LoginContextSections,
  "constitution" | "toolPolicy"
>

/**
 * A reader for a canonical source file. Injected so the fail-closed branch (missing / empty source) is
 * testable without deleting or truncating the real locked constitution. Defaults to a UTF-8 file read.
 */
export type SourceReader = (path: string) => string

const defaultSourceReader: SourceReader = (path) => readFileSync(path, "utf8")

/**
 * Assemble the login-pack safety-spine `sections`. The `constitution` is read VERBATIM from the LOCKED
 * canonical `.brain/constitution.md` (byte-identical to the file — no trim, no transform), so the operator
 * no longer hand-copies it and it can never drift from or silently drop the locked source. The remaining
 * spine sections (KB pointer + law summary + confidence protocol + escalation policy) are taken from the
 * operator input and NORMALIZED to exactly the known fields (any stray key — e.g. a smuggled `toolPolicy` —
 * is dropped).
 *
 * FAIL-CLOSED: throws if the constitution source is missing/empty, OR if any operator-supplied safety
 * section is missing/blank. A login pack must never ship with a hole in its safety framing — so a defect
 * that would drop a section's text is a hard error here, not a silently-degraded prompt.
 */
export function assembleLoginSections(
  operator: OperatorLoginSections,
  read: SourceReader = defaultSourceReader,
): LoginContextSections {
  const constitution = readCanonicalSection(
    "constitution",
    CONSTITUTION_SOURCE_PATH,
    read,
  )

  const kb = operator.kb ?? { id: "", version: "" }
  requireNonBlank("kb.id", kb.id)
  requireNonBlank("kb.version", kb.version)
  requireNonBlank("lawSummary", operator.lawSummary)
  requireNonBlank("confidenceProtocol", operator.confidenceProtocol)
  requireNonBlank("escalationPolicy", operator.escalationPolicy)

  return {
    constitution,
    kb: { id: kb.id, version: kb.version },
    lawSummary: operator.lawSummary,
    confidenceProtocol: operator.confidenceProtocol,
    escalationPolicy: operator.escalationPolicy,
  }
}

/**
 * Read one canonical safety section from its source file, VERBATIM. Fail-closed: an unreadable source (e.g.
 * the file was moved/deleted) OR an empty/whitespace-only source both throw — never return a blank safety
 * section. Returns the exact file bytes (no trim) so the assembled section is byte-identical to the source.
 */
function readCanonicalSection(
  name: string,
  path: string,
  read: SourceReader,
): string {
  let text: string
  try {
    text = read(path)
  } catch (cause) {
    throw new Error(
      `login-pack safety section "${name}" could not be read from its canonical source ${path}`,
      { cause },
    )
  }
  if (text.trim().length === 0) {
    throw new Error(
      `login-pack safety section "${name}" canonical source ${path} is empty — refusing to assemble a login pack with a blank safety section`,
    )
  }
  return text
}

/** Assert an operator-supplied safety section text is a present, non-blank string; throw fail-closed otherwise. */
function requireNonBlank(
  name: string,
  value: unknown,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `login-pack safety section "${name}" is missing or empty — refusing to assemble a login pack with a blank safety section`,
    )
  }
}
