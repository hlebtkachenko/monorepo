import { createDocumentHandlers } from "../../_lib/document-handlers"
import { documentHandlerDependencies } from "../../_lib/document-route-dependencies"

export const dynamic = "force-dynamic"

const handlers = createDocumentHandlers(documentHandlerDependencies)

/**
 * Undo a soft-delete within the 60-day window: clear the S3 `deleted-at` tag
 * FIRST, then the DB `deleted_at` (asymmetric ordering — so "DB live" always
 * implies "S3 not reaping"). Idempotent: a not-deleted row returns ok.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return handlers.restore(id)
}
