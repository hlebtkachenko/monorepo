import { createDocumentHandlers } from "../_lib/document-handlers"
import { documentHandlerDependencies } from "../_lib/document-route-dependencies"

export const dynamic = "force-dynamic"

const handlers = createDocumentHandlers(documentHandlerDependencies)

/**
 * Soft-delete a document: set the DB `deleted_at` FIRST, then the S3
 * `deleted-at` tag (asymmetric ordering — a tag-write failure leaves the doc
 * alive + undoable). The reaper purges the bytes 60 days later unless undone.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return handlers.remove(id)
}
