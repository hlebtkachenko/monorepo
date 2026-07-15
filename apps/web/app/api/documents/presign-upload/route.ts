import { createDocumentHandlers } from "../_lib/document-handlers"
import { documentHandlerDependencies } from "../_lib/document-route-dependencies"

export const dynamic = "force-dynamic"

const handlers = createDocumentHandlers(documentHandlerDependencies)

/**
 * Authenticated presign-upload. Workspace derived server-side; the browser
 * POSTs the file DIRECT to S3 with the returned fields. Dedup consults the
 * inbox_attachment row, not S3.
 */
export function POST(request: Request): Promise<Response> {
  return handlers.presignUpload(request)
}
