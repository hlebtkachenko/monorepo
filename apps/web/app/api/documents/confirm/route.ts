import { createDocumentHandlers } from "../_lib/document-handlers"
import { documentHandlerDependencies } from "../_lib/document-route-dependencies"

export const dynamic = "force-dynamic"

const handlers = createDocumentHandlers(documentHandlerDependencies)

/**
 * Confirm a direct-to-S3 upload: HEAD authoritative metadata + a bounded
 * magic-byte sniff, tag the blob confirmed (S3 200), THEN write the durable
 * inbox_attachment row (never DB-first).
 */
export function POST(request: Request): Promise<Response> {
  return handlers.confirm(request)
}
