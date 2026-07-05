// #518 (WS) — the creds-free "file → extract session plan" assembly for `afframe brain extract <path>`.
//
// This is the SDK-FREE, unit-tested half of the `extract` command. It resolves the operator-named PDF/image
// into the content-block descriptor the LOCAL vision-OCR pre-pass will feed the model, and assembles the
// exact extract-session config (system prompt + default-deny tool lists + the fixed kickoff) a live run would
// use. It contacts NOTHING (no creds, no network): `extract --dry-run` stops after printing what this
// produces; the live path in `command.ts` hands the same descriptor + config to the SDK-backed launcher.
//
// SAFETY: the file the operator named is turned into an image/document CONTENT BLOCK HERE (trusted CLI code),
// never handed to a `Read` tool — the extract session's `allowedBuiltinTools` is empty and `Read` is denied.
// A hostile document therefore cannot steer a read of `~/.aws` / `.env` / the API key. The extract policy
// (`BRAIN_EXTRACT_POLICY`) allows ONLY the ocr-template read + propose pair; every accounting write, every
// held-write op, and the human-only `confirm_ocr_template` are denied.

import { basename, extname } from "node:path"
import type { LoginContextSections } from "@workspace/brain"
import {
  buildExtractKickoff,
  buildExtractLoginPack,
  type ExtractDocumentBlock,
  type ExtractSessionInputs,
} from "./extract-config"
import { indent } from "./render"

/** The operator-supplied context an `extract` run needs: JUST the login-pack safety spine — NO tenancy keys. */
export interface ExtractContext {
  /** The login-pack section texts (constitution / KB pointer / law / confidence / escalation). */
  sections: LoginContextSections
}

/** The supported vision-OCR input media, keyed by lowercased file extension → the Agent-SDK block descriptor. */
const SUPPORTED_MEDIA: Record<
  string,
  { kind: "image" | "document"; mediaType: string }
> = {
  pdf: { kind: "document", mediaType: "application/pdf" },
  png: { kind: "image", mediaType: "image/png" },
  jpg: { kind: "image", mediaType: "image/jpeg" },
  jpeg: { kind: "image", mediaType: "image/jpeg" },
  gif: { kind: "image", mediaType: "image/gif" },
  webp: { kind: "image", mediaType: "image/webp" },
}

/**
 * Resolve the operator-named file's bytes → the content-block descriptor the extract session feeds the model.
 * PURE of the filesystem: the caller reads the bytes (trusted CLI code) and passes them in; this maps the
 * extension to the SDK media type and base64-encodes. Throws on an unsupported type (a `.docx` / `.xlsx` is
 * not a vision-OCR input — book those through `brain book`), so a wrong file fails loud, never silently.
 */
export function toDocumentBlock(
  path: string,
  bytes: Uint8Array,
): ExtractDocumentBlock {
  const ext = extname(path).slice(1).toLowerCase()
  const media = SUPPORTED_MEDIA[ext]
  if (!media) {
    throw new Error(
      `extract: unsupported file type ".${ext}" for ${basename(path)}. ` +
        `Supported: ${Object.keys(SUPPORTED_MEDIA).join(", ")} (a PDF or a raster scan). ` +
        `Structured exports (csv/xlsx/Pohoda XML) go through \`afframe brain book\`.`,
    )
  }
  return {
    kind: media.kind,
    mediaType: media.mediaType,
    base64: Buffer.from(bytes).toString("base64"),
    sourceLabel: basename(path),
  }
}

/** The full inspectable result of an `extract` assembly — the document descriptor + the session config. */
export interface ExtractPlan {
  /** The resolved content-block descriptor (kind + media type + source label + byte count). Bytes elided. */
  document: {
    kind: ExtractDocumentBlock["kind"]
    mediaType: string
    sourceLabel: string
    byteCount: number
  }
  /** The optional (unverified) supplier hint the session narrows its template lookup by. */
  supplierHint?: string
  /** The extract-session system prompt (login pack under the extract policy). */
  systemPrompt: string
  /** The per-TOOL allowlist — exactly the ocr-template read + propose pair. */
  allowedTools: string[]
  /** The denied built-ins (the exfiltration / self-modification surface — includes `Read`). */
  disallowedTools: string[]
  /** The fixed kickoff the session runs (extraction task pinned here; document content is untrusted data). */
  kickoff: string
}

/**
 * Assemble the creds-free extract plan for one document. PURE given `document`: it builds the extract login
 * pack (under `BRAIN_EXTRACT_POLICY`) and the fixed kickoff, and echoes the sandbox lists + the document
 * descriptor (with the raw bytes ELIDED — only the byte count is surfaced). No live session is launched and
 * no MCP endpoint is contacted — this is the plan, not the run.
 */
export function assembleExtractPlan(
  document: ExtractDocumentBlock,
  ctx: ExtractContext,
  supplierHint?: string,
): ExtractPlan {
  const session: ExtractSessionInputs = { sections: ctx.sections, supplierHint }
  const loginPack = buildExtractLoginPack(session)
  return {
    document: {
      kind: document.kind,
      mediaType: document.mediaType,
      sourceLabel: document.sourceLabel,
      byteCount: Buffer.from(document.base64, "base64").length,
    },
    supplierHint,
    systemPrompt: loginPack.system,
    allowedTools: [...loginPack.allowedTools],
    disallowedTools: [...loginPack.disallowedTools],
    kickoff: buildExtractKickoff(supplierHint),
  }
}

/**
 * Render the assembled extract plan for operator inspection. It states plainly that the file is fed as a
 * content block (NOT via a Read tool), prints the default-deny tool lists (so an operator can see the write
 * tools + `Read` are absent), the supplier hint, and the fixed kickoff. This is the exact text `--dry-run`
 * prints — creds-free.
 */
export function renderExtractPlan(plan: ExtractPlan): string {
  const lines: string[] = []
  lines.push(
    "Afframe brain extract — LOCAL vision-OCR pre-pass (inspect before running live).",
  )
  lines.push("")
  lines.push(
    "This session NEVER books. It extracts an IR Invoice + field-level",
  )
  lines.push(
    "provenance + a layout fingerprint, and may propose an UNCONFIRMED template.",
  )
  lines.push("")
  lines.push(
    "Document (fed to the model as an image/document CONTENT BLOCK — NOT via a Read tool):",
  )
  lines.push(`  source     = ${plan.document.sourceLabel}`)
  lines.push(`  block kind = ${plan.document.kind}`)
  lines.push(`  media type = ${plan.document.mediaType}`)
  lines.push(`  bytes      = ${plan.document.byteCount}`)
  lines.push(
    `  supplier   = ${plan.supplierHint ? `${plan.supplierHint} (UNVERIFIED hint)` : "(none — resolve from the document)"}`,
  )
  lines.push("")
  lines.push(`Allowed tools (default-deny — ocr-template read/propose ONLY):`)
  for (const tool of plan.allowedTools) lines.push(`  + ${tool}`)
  lines.push("")
  lines.push(
    `Denied built-ins (never available — includes Read; no filesystem read):`,
  )
  for (const tool of plan.disallowedTools) lines.push(`  - ${tool}`)
  lines.push("")
  lines.push(
    "Accounting WRITE tools (capture_accounting_document / create_* / resolve_* /",
  )
  lines.push(
    "list_*_held_writes) and the human-only confirm_ocr_template are DENIED by default-deny.",
  )
  lines.push("")
  lines.push("Kickoff (fixed task — document content is untrusted data):")
  lines.push(indent(plan.kickoff, 2))
  return lines.join("\n") + "\n"
}
