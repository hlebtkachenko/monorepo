"use client"

import * as React from "react"

import type {
  InspectorAttachmentFile,
  InspectorAttachmentKind,
} from "@workspace/ui/blocks/inspector-sheet"

import {
  deleteDocument,
  getDocumentUrl,
  restoreDocument,
  uploadDocument,
  type UploadedDocument,
} from "./document-attachments-client"

/**
 * Wires the Inspector Attachments section to the real S3 document store (issue
 * #751). Returns the section's handler props, driving the browser upload flow +
 * presigned preview/download + soft-delete/restore against `/api/documents/*`.
 *
 * The `files` list is owned here (seeded from the record's stored attachments):
 * a confirmed upload appends to it; delete/restore are session-local strike +
 * Undo in the section, made server-truthful by `onRemove`/`onRestore`. Which
 * attachment ids belong to a record — and persisting a new upload's id onto that
 * record — is the caller's concern (no record↔attachment link exists yet).
 */
export interface UseInspectorAttachmentsOptions {
  initialFiles?: InspectorAttachmentFile[]
  /** Called after a confirmed upload so the caller can persist the id onto the record. */
  onUploaded?: (document: UploadedDocument) => void
  onError?: (error: unknown) => void
}

export interface InspectorAttachmentsWiring {
  files: InspectorAttachmentFile[]
  setFiles: React.Dispatch<React.SetStateAction<InspectorAttachmentFile[]>>
  onUpload: (picked: File[]) => Promise<void>
  /** Resolves the presigned inline URL the section renders in its preview frame. */
  onResolvePreview: (id: string) => Promise<string | null>
  onDownload: (id: string) => void
  onCopyUrl: (id: string) => void
  onRemove: (id: string) => void
  onRestore: (id: string) => void
}

function kindFromContentType(contentType: string): InspectorAttachmentKind {
  if (contentType === "application/pdf") return "pdf"
  if (contentType.startsWith("image/")) return "image"
  if (contentType === "application/xml" || contentType === "text/xml")
    return "doc"
  return "file"
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

function toAttachmentFile(document: UploadedDocument): InspectorAttachmentFile {
  return {
    id: document.id,
    name: document.filename,
    kind: kindFromContentType(document.contentType),
    meta: formatBytes(document.size),
  }
}

export function useInspectorAttachments(
  options: UseInspectorAttachmentsOptions = {},
): InspectorAttachmentsWiring {
  const { onUploaded, onError } = options
  const [files, setFiles] = React.useState<InspectorAttachmentFile[]>(
    options.initialFiles ?? [],
  )
  const report = React.useCallback(
    (error: unknown) => onError?.(error),
    [onError],
  )

  const onUpload = React.useCallback(
    async (picked: File[]) => {
      for (const file of picked) {
        try {
          const document = await uploadDocument(file)
          setFiles((prev) =>
            prev.some((f) => f.id === document.id)
              ? prev
              : [...prev, toAttachmentFile(document)],
          )
          onUploaded?.(document)
        } catch (error) {
          report(error)
        }
      }
    },
    [onUploaded, report],
  )

  const openUrl = React.useCallback(
    (
      id: string,
      disposition: "inline" | "attachment",
      use: (url: string) => void,
    ) => {
      void getDocumentUrl(id, disposition).then(use).catch(report)
    },
    [report],
  )

  const onResolvePreview = React.useCallback(
    (id: string) =>
      getDocumentUrl(id, "inline").catch((error) => {
        report(error)
        return null
      }),
    [report],
  )
  const onDownload = React.useCallback(
    (id: string) =>
      // presignGet(disposition:"attachment") sets Content-Disposition:
      // attachment, so following the URL downloads instead of rendering.
      openUrl(id, "attachment", (url) => {
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.rel = "noopener"
        anchor.click()
      }),
    [openUrl],
  )
  const onCopyUrl = React.useCallback(
    (id: string) =>
      openUrl(id, "inline", (url) => void navigator.clipboard.writeText(url)),
    [openUrl],
  )
  const onRemove = React.useCallback(
    (id: string) => void deleteDocument(id).catch(report),
    [report],
  )
  const onRestore = React.useCallback(
    (id: string) => void restoreDocument(id).catch(report),
    [report],
  )

  return {
    files,
    setFiles,
    onUpload,
    onResolvePreview,
    onDownload,
    onCopyUrl,
    onRemove,
    onRestore,
  }
}
