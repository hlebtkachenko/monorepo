import { createDocumentHandlers } from "../../_lib/document-handlers"
import { documentHandlerDependencies } from "../../_lib/document-route-dependencies"

export const dynamic = "force-dynamic"

const handlers = createDocumentHandlers(documentHandlerDependencies)

/**
 * Mint a short-lived presigned GET URL for a document. Loads the owning row,
 * rejects a soft-deleted row, reasserts the caller's workspace, THEN signs.
 * `?disposition=inline` (preview, default) or `attachment` (download).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return handlers.getUrl(request, id)
}
