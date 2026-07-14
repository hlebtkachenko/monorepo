import "server-only"

import { headers } from "next/headers"
import { auth } from "@workspace/auth/server"
import { S3DocumentStore } from "@workspace/storage"

import { inboxAttachmentRepo } from "../../../_lib/inbox-attachment-repo"
import { getWorkspaceContext } from "../../../workspace/_lib/workspace-context"
import type { DocumentHandlerDependencies } from "./document-handlers"

let documentStore: S3DocumentStore | undefined

export const documentHandlerDependencies: DocumentHandlerDependencies = {
  async getSessionUserId() {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user?.id ?? null
  },
  async getActiveWorkspaceId(userId) {
    const context = await getWorkspaceContext(userId)
    return context.activeWorkspaceId
  },
  getStore() {
    documentStore ??= new S3DocumentStore()
    return documentStore
  },
  repo: inboxAttachmentRepo,
}
