import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"

/**
 * Per-operation curation overrides for generated MCP tool registrations.
 *
 * The codegen in `scripts/gen-tools.ts` reads `apps/api/openapi/v1.json` and
 * emits one tool file per `operationId` under `tools/generated/`. The
 * generator can derive a reasonable default annotation set from the HTTP
 * method alone (GET → read-only + idempotent; POST → write; DELETE →
 * destructive); but the LLM client cares about nuance the spec doesn't
 * encode — "this POST creates a draft (safe to retry)" vs. "this POST
 * triggers an external email (do NOT retry without confirmation)".
 *
 * This file is the single seam where humans annotate that nuance. The
 * codegen reads `getAnnotations(operationId)` and merges with the
 * method-derived defaults; missing entries fall back to defaults.
 */

// Curated overrides. Empty by default — the `defaultAnnotationsForMethod`
// table below covers every GET / POST / PUT / PATCH / DELETE op correctly.
// Add an entry here only when an operation needs to override a default:
//
//   sendInvoiceEmail: { destructiveHint: true, idempotentHint: false },
//   createInvoiceDraft: { destructiveHint: false, idempotentHint: true },
//
// (Destructive = irreversible side-effect like a sent email; idempotent =
// safe to retry without an `Idempotency-Key`.)
const ANNOTATIONS: Record<string, ToolAnnotations> = {}

export function getAnnotations(operationId: string): ToolAnnotations {
  return ANNOTATIONS[operationId] ?? {}
}

/**
 * Derives default annotations from the OpenAPI verb. The codegen uses this
 * when an operation has no entry in the table above.
 */
export function defaultAnnotationsForMethod(method: string): ToolAnnotations {
  const m = method.toLowerCase()
  if (m === "get" || m === "head") {
    return {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    }
  }
  if (m === "delete") {
    return {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    }
  }
  if (m === "put" || m === "patch") {
    return {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: m === "put",
      openWorldHint: true,
    }
  }
  // POST: assume not safe to retry by default. Lift to idempotent only when
  // the operation accepts an `Idempotency-Key` header, which the curation
  // table above can override.
  return {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  }
}
