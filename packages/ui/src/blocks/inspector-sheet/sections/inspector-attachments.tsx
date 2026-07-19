"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadTrigger,
} from "@workspace/ui/components/file-upload"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useIcons, type IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { InspectorSection } from "./inspector-section"

export type InspectorAttachmentKind =
  "link" | "image" | "pdf" | "doc" | "signature" | "file"

const KIND_ICON: Record<InspectorAttachmentKind, IconName> = {
  link: "LinkIcon",
  image: "FileImage",
  pdf: "FileText",
  doc: "FileText",
  signature: "Pencil",
  file: "Paperclip",
}

export interface InspectorAttachmentFile {
  id: string
  name: string
  kind?: InspectorAttachmentKind
  /** Muted right-side hint (size, "2 controls", …). */
  meta?: string
  /** For `kind: "link"` rows — the external URL the redirect button opens. */
  url?: string
}

/**
 * The safe external href for a value, or `undefined` if it is not an http(s) URL.
 * Returns the PARSED `URL.href` from inside the protocol allowlist — so the value
 * reaching an anchor `href` is a URL-API output guarded by the scheme check, never
 * raw text (a `javascript:` / `data:` URL parses but fails the allowlist). This
 * shape is what lets both us and static analysis treat the link as sanitized.
 */
function safeExternalHref(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol === "http:" || url.protocol === "https:") return url.href
  } catch {
    // not a parseable URL
  }
  return undefined
}

/** A syntactically valid http(s) URL — the "Add link" gate. */
function isValidLinkUrl(value: string): boolean {
  return safeExternalHref(value) !== undefined
}

/** A record already in the system, searchable in "Link existing". */
export interface InspectorExistingRecord {
  id: string
  label: string
  meta?: string
}

export interface InspectorAttachmentsProps {
  title?: string
  files: InspectorAttachmentFile[]
  /** Records the "Link existing" search picks from (by number / name / sum). */
  existingRecords?: InspectorExistingRecord[]
  onPreview?: (id: string) => void
  /**
   * Resolves the presigned inline URL for the full-frame preview. Images render
   * with it directly; other kinds fall back to a download prompt (the app CSP
   * blocks inline PDF/object embeds). Return `null` when no preview is available.
   */
  onResolvePreview?: (id: string) => Promise<string | null>
  onDownload?: (id: string) => void
  onCopyUrl?: (id: string) => void
  onRename?: (id: string) => void
  onRemove?: (id: string) => void
  /** Fires when a struck row's Undo is pressed — reverses `onRemove` (e.g. restores a soft-deleted document). */
  onRestore?: (id: string) => void
  /** Receives the picked/dropped files from the library dropzone. */
  onUpload?: (files: File[]) => void
  /** Notified when a link is added (the section also appends it to the list). */
  onAddLink?: (url: string) => void
  /** Notified when an existing record is linked (also appended to the list). */
  onLinkExisting?: (recordId: string) => void
  className?: string
}

const MAX_SIZE = 20 * 1024 * 1024

/** One file row. Deleted rows collapse to a struck-through name + a single Undo. */
function AttachmentRow({
  file,
  deleted,
  onPreview,
  onDownload,
  onCopyUrl,
  onRename,
  onDelete,
  onUndo,
}: {
  file: InspectorAttachmentFile
  deleted: boolean
  onDelete: () => void
  onUndo: () => void
} & Pick<
  InspectorAttachmentsProps,
  "onPreview" | "onDownload" | "onCopyUrl" | "onRename"
>) {
  const icons = useIcons()
  const Icon = icons[KIND_ICON[file.kind ?? "file"]]
  const Preview = icons.Maximize2
  const Download = icons.Download
  const OpenExternal = icons.ArrowUpRight
  const More = icons.MoreHorizontal
  const Copy = icons.Copy
  const Pencil = icons.Pencil
  const Trash = icons.Trash2
  const Undo = icons.RotateCcw

  // A link row has no bytes to preview/download — it carries an external URL, so
  // its primary + menu action is an open-external redirect instead. Gate the
  // target to a valid http(s) URL: the interactive add path already validates,
  // but a row sourced from an untrusted `files` prop must never render a
  // `javascript:`/`data:` href (defense-in-depth at the render boundary).
  const isLink = file.kind === "link"
  // `href` is the PARSED, protocol-checked URL (or undefined) — never the raw
  // `file.url`/`file.name` text — so a `javascript:`/`data:` value can never reach
  // the anchor, even from an untrusted `files` prop.
  const href = isLink ? safeExternalHref(file.url ?? file.name) : undefined

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 text-sm">
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0 text-muted-foreground",
          deleted && "opacity-50",
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          deleted && "text-muted-foreground line-through",
        )}
      >
        {file.name}
      </span>

      {deleted ? (
        <Button variant="ghost" size="sm" className="shrink-0" onClick={onUndo}>
          <Undo aria-hidden />
          Undo
        </Button>
      ) : (
        <>
          {file.meta ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {file.meta}
            </span>
          ) : null}
          {isLink ? (
            href ? (
              <Button
                asChild
                variant="ghost"
                size="icon-sm"
                aria-label={`Open ${file.name}`}
              >
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <OpenExternal aria-hidden />
                </a>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                disabled
                aria-label={`Open ${file.name}`}
              >
                <OpenExternal aria-hidden />
              </Button>
            )
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Preview ${file.name}`}
                onClick={() => onPreview?.(file.id)}
              >
                <Preview aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Download ${file.name}`}
                onClick={() => onDownload?.(file.id)}
              >
                <Download aria-hidden />
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`More actions for ${file.name}`}
              >
                <More aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isLink ? (
                href ? (
                  <DropdownMenuItem asChild>
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      <OpenExternal aria-hidden />
                      Open link
                    </a>
                  </DropdownMenuItem>
                ) : null
              ) : (
                <>
                  <DropdownMenuItem onSelect={() => onPreview?.(file.id)}>
                    <Preview aria-hidden />
                    Preview
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onDownload?.(file.id)}>
                    <Download aria-hidden />
                    Download
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onRename?.(file.id)}>
                <Pencil aria-hidden />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCopyUrl?.(file.id)}>
                <Copy aria-hidden />
                Copy URL
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  )
}

/**
 * Full-frame preview of one attachment, filling the tab body. Images render
 * inline from a resolved presigned URL; other kinds show a download prompt (the
 * app CSP blocks inline PDF/object embeds, so only images render in-place).
 */
function AttachmentPreview({
  file,
  onBack,
  onDownload,
  resolveUrl,
}: {
  file: InspectorAttachmentFile
  onBack: () => void
  onDownload?: (id: string) => void
  resolveUrl?: (id: string) => Promise<string | null>
}) {
  const icons = useIcons()
  const Back = icons.ArrowLeft
  const Download = icons.Download
  const Kind = icons[KIND_ICON[file.kind ?? "file"]]

  const inlineRenderable = file.kind === "image"
  const [src, setSrc] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">(
    inlineRenderable && resolveUrl ? "loading" : "error",
  )

  React.useEffect(() => {
    if (!inlineRenderable || !resolveUrl) return
    let active = true
    setStatus("loading")
    setSrc(null)
    resolveUrl(file.id)
      .then((url) => {
        if (!active) return
        setSrc(url)
        setStatus(url ? "ready" : "error")
      })
      .catch(() => {
        if (active) setStatus("error")
      })
    return () => {
      active = false
    }
  }, [file.id, inlineRenderable, resolveUrl])

  return (
    <div className="flex min-h-[24rem] flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back to attachments"
          onClick={onBack}
        >
          <Back aria-hidden />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {file.name}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDownload?.(file.id)}
        >
          <Download aria-hidden />
          Download
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden rounded-md border border-border-subtle bg-grey-subtle/50 text-muted-foreground">
        {status === "ready" && src ? (
          <img
            src={src}
            alt={file.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : status === "loading" ? (
          <span className="text-sm">Loading preview…</span>
        ) : (
          <>
            <Kind aria-hidden className="size-10" />
            <span className="text-sm">
              {inlineRenderable
                ? "Preview unavailable"
                : "No inline preview — download to view"}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * InspectorAttachments — the files/links attached to a record, a reusable
 * section. A hairline list card (preview + download + a "⋯" menu with icons and
 * Rename/Copy/Delete), the shared FileUpload drop zone, and Add link / Link
 * existing — both wired: "Add link" opens a dialog for a URL and appends it to
 * the list; "Link existing" opens a search dialog over `existingRecords` (by
 * number / name / sum) and links the chosen one. Deleting a row strikes it and
 * swaps its actions for an Undo (session-local). Preview opens a full-frame
 * viewer. All session-local; parent callbacks fire for real wiring.
 */
export function InspectorAttachments({
  title = "Attachments",
  files,
  existingRecords = [],
  onPreview,
  onResolvePreview,
  onDownload,
  onCopyUrl,
  onRename,
  onRemove,
  onRestore,
  onUpload,
  onAddLink,
  onLinkExisting,
  className,
}: InspectorAttachmentsProps) {
  const icons = useIcons()
  const Upload = icons.Upload
  const Link = icons.LinkIcon
  const Plus = icons.Plus

  // Session-local state — soft-delete, appended links/records, open preview.
  const [deleted, setDeleted] = React.useState<ReadonlySet<string>>(new Set())
  const [added, setAdded] = React.useState<InspectorAttachmentFile[]>([])
  const [previewId, setPreviewId] = React.useState<string | null>(null)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [linkUrl, setLinkUrl] = React.useState("")
  const [existingOpen, setExistingOpen] = React.useState(false)
  const nextId = React.useRef(0)

  const rows = [...files, ...added]

  const markDeleted = (id: string) => {
    setDeleted((prev) => new Set(prev).add(id))
    onRemove?.(id)
  }
  const undoDelete = (id: string) => {
    setDeleted((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    onRestore?.(id)
  }
  const openPreview = (id: string) => {
    setPreviewId(id)
    onPreview?.(id)
  }

  const linkValid = isValidLinkUrl(linkUrl.trim())
  const addLink = () => {
    const url = linkUrl.trim()
    if (!isValidLinkUrl(url)) return
    setAdded((prev) => [
      ...prev,
      { id: `link-${nextId.current++}`, name: url, kind: "link", url },
    ])
    onAddLink?.(url)
    setLinkUrl("")
    setLinkOpen(false)
  }

  // Rows added in-session (links / linked records) live in `added`, not the
  // parent `files`, so Copy URL / Rename for them are owned HERE — the parent
  // callbacks only resolve their own files (and would copy an empty string /
  // no-op for an `added` id). Parent-owned files still delegate to the callbacks.
  const copyUrlRow = (id: string) => {
    const local = added.find((file) => file.id === id)
    if (local) {
      void navigator.clipboard.writeText(local.url ?? local.name)
      return
    }
    onCopyUrl?.(id)
  }
  const renameRow = (id: string) => {
    const local = added.find((file) => file.id === id)
    if (local) {
      const next = window.prompt("Rename attachment", local.name)?.trim()
      if (next)
        setAdded((prev) =>
          prev.map((file) => (file.id === id ? { ...file, name: next } : file)),
        )
      return
    }
    onRename?.(id)
  }

  const linkExisting = (record: InspectorExistingRecord) => {
    setAdded((prev) => [
      ...prev,
      {
        id: `doc-${record.id}-${nextId.current++}`,
        name: record.label,
        kind: "doc",
        meta: record.meta,
      },
    ])
    onLinkExisting?.(record.id)
    setExistingOpen(false)
  }

  const previewFile = rows.find((f) => f.id === previewId)
  if (previewFile) {
    return (
      <InspectorSection title={title} className={className}>
        <AttachmentPreview
          file={previewFile}
          onBack={() => setPreviewId(null)}
          onDownload={onDownload}
          resolveUrl={onResolvePreview}
        />
      </InspectorSection>
    )
  }

  return (
    <InspectorSection
      title={title}
      className={className}
      contentClassName="flex flex-col gap-3"
    >
      {rows.length > 0 ? (
        <div className="divide-y divide-border-subtle overflow-hidden rounded-md border border-border-subtle">
          {rows.map((file) => (
            <AttachmentRow
              key={file.id}
              file={file}
              deleted={deleted.has(file.id)}
              onPreview={openPreview}
              onDownload={onDownload}
              onCopyUrl={copyUrlRow}
              onRename={renameRow}
              onDelete={() => markDeleted(file.id)}
              onUndo={() => undoDelete(file.id)}
            />
          ))}
        </div>
      ) : null}

      <div className="border-t border-dotted border-border-subtle" />

      <FileUpload
        multiple
        maxSize={MAX_SIZE}
        onValueChange={(picked) => onUpload?.(picked)}
      >
        <FileUploadDropzone>
          <div className="flex flex-col items-center gap-1">
            <Upload aria-hidden className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Drag and drop files here</p>
            <p className="text-xs text-muted-foreground">Or click to browse</p>
          </div>
          <FileUploadTrigger asChild>
            <Button variant="outline" size="sm" className="mt-2">
              Browse files
            </Button>
          </FileUploadTrigger>
        </FileUploadDropzone>
      </FileUpload>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setLinkOpen(true)}
        >
          <Link aria-hidden />
          Add link
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setExistingOpen(true)}
        >
          <Plus aria-hidden />
          Link existing
        </Button>
      </div>

      {/* Add link — a small URL dialog that appends to the list. */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add link</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="attachment-link-url">URL</Label>
            <Input
              id="attachment-link-url"
              placeholder="https://…"
              value={linkUrl}
              aria-invalid={linkUrl.trim().length > 0 && !linkValid}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addLink()
                }
              }}
            />
            {linkUrl.trim().length > 0 && !linkValid ? (
              <p className="text-xs text-destructive">
                Enter a valid URL (starting with http:// or https://).
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addLink} disabled={!linkValid}>
              Add link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link existing — a searchable command over records in the system. */}
      <Dialog open={existingOpen} onOpenChange={setExistingOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>Link existing document</DialogTitle>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Find a document by number, name or sum…" />
            <CommandList>
              <CommandEmpty>No matching records.</CommandEmpty>
              {existingRecords.map((record) => (
                <CommandItem
                  key={record.id}
                  value={`${record.label} ${record.meta ?? ""}`}
                  onSelect={() => linkExisting(record)}
                >
                  <span className="font-medium">{record.label}</span>
                  {record.meta ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {record.meta}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </InspectorSection>
  )
}
