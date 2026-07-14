"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { Button } from "@workspace/ui/components/button"

// react-pdf (pdf.js) evaluates browser-only globals (DOMMatrix) at module load,
// so it must never be imported into the server/SSR pass. Load it client-only.
const PdfViewer = dynamic(
  () =>
    import("@workspace/ui/components/pdf-viewer").then((m) => ({
      default: m.PdfViewer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
        Loading PDF viewer…
      </div>
    ),
  },
)

import {
  DocumentClientError,
  deleteDocument,
  getDocumentUrl,
  restoreDocument,
  uploadDocument,
} from "../../_lib/documents-client"

interface DebugDoc {
  id: string
  key: string
  filename: string
  contentType: string
  deduped: boolean
  deleted: boolean
}

type Preview = {
  url: string
  kind: "pdf" | "image" | "other"
  filename: string
}

function previewKind(contentType: string): Preview["kind"] {
  if (contentType === "application/pdf") return "pdf"
  if (contentType.startsWith("image/")) return "image"
  return "other"
}

/**
 * Dev harness UI. All storage behavior comes from the generic
 * `documents-client` functions — this component only renders state and wires
 * buttons to them, so it proves the reusable capability end-to-end without
 * being the real product surface.
 */
export function DocumentsDebug({ workspaceName }: { workspaceName: string }) {
  const [docs, setDocs] = React.useState<DebugDoc[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<Preview | null>(null)

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      const msg =
        e instanceof DocumentClientError
          ? `[${e.stage} ${e.status}] ${e.message}`
          : String(e)
      setError(`${label} failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    void run("upload", async () => {
      const uploaded = await uploadDocument(file)
      setDocs((prev) => [
        {
          id: uploaded.id,
          key: uploaded.key,
          filename: file.name,
          contentType: file.type,
          deduped: uploaded.deduped,
          deleted: false,
        },
        ...prev.filter((d) => d.id !== uploaded.id),
      ])
      setStatus(
        uploaded.deduped
          ? `deduped: ${file.name} already stored (${uploaded.id})`
          : `uploaded ${file.name} → ${uploaded.id}`,
      )
    })
  }

  const onPreview = (doc: DebugDoc) =>
    void run("preview", async () => {
      const url = await getDocumentUrl(doc.id, "inline")
      setPreview({
        url,
        kind: previewKind(doc.contentType),
        filename: doc.filename,
      })
      setStatus(`preview URL minted for ${doc.filename}`)
    })

  const onDownload = (doc: DebugDoc) =>
    void run("download", async () => {
      const url = await getDocumentUrl(doc.id, "attachment")
      window.open(url, "_blank", "noopener,noreferrer")
      setStatus(`download URL opened for ${doc.filename}`)
    })

  const onDelete = (doc: DebugDoc) =>
    void run("delete", async () => {
      await deleteDocument(doc.id)
      setDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, deleted: true } : d)),
      )
      if (preview?.filename === doc.filename) setPreview(null)
      setStatus(`soft-deleted ${doc.filename}`)
    })

  const onRestore = (doc: DebugDoc) =>
    void run("restore", async () => {
      await restoreDocument(doc.id)
      setDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, deleted: false } : d)),
      )
      setStatus(`restored ${doc.filename}`)
    })

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">S3 document store — debug</h1>
        <p className="text-sm text-muted-foreground">
          Dev-only harness for <code>{workspaceName}</code>. Upload → confirm →
          preview → download → soft-delete → undo, all through the reusable{" "}
          <code>documents-client</code> functions.
        </p>
      </header>

      <div className="flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
          <input
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.xml,.isdoc,application/pdf,image/png,image/jpeg"
            disabled={busy}
            onChange={onFile}
          />
          {busy ? "Working…" : "Choose a document to upload"}
        </label>
        {status ? (
          <span className="text-sm text-muted-foreground">{status}</span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col divide-y divide-border rounded-md border border-border">
        {docs.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No uploads yet. Pick a supported file (pdf / png / jpg / xlsx / csv
            / xml / isdoc).
          </p>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center gap-3 p-3 text-sm"
            >
              <span
                className={
                  doc.deleted
                    ? "font-medium text-muted-foreground line-through"
                    : "font-medium"
                }
              >
                {doc.filename}
              </span>
              <code className="text-xs text-muted-foreground">{doc.id}</code>
              {doc.deduped ? (
                <span className="text-xs text-muted-foreground">(dedup)</span>
              ) : null}
              {doc.deleted ? (
                <span className="text-xs text-destructive">soft-deleted</span>
              ) : null}
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || doc.deleted}
                  onClick={() => onPreview(doc)}
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || doc.deleted}
                  onClick={() => onDownload(doc)}
                >
                  Download
                </Button>
                {doc.deleted ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onRestore(doc)}
                  >
                    Undo
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onDelete(doc)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {preview ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              Preview — {preview.filename}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPreview(null)}
              className="ml-auto"
            >
              Close
            </Button>
          </div>
          {preview.kind === "pdf" ? (
            <PdfViewer file={preview.url} mode="scroll" />
          ) : preview.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.filename}
              className="max-h-[70vh] rounded-md border border-border object-contain"
            />
          ) : (
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              Open {preview.filename} in a new tab
            </a>
          )}
        </div>
      ) : null}
    </div>
  )
}
