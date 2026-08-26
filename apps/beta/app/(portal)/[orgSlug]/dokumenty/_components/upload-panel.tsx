"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"
import { FileImage, Loader2, RefreshCw, Upload } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

import { formatBytes, formatDate } from "@/i18n/format-values"
import { useBetaTranslations } from "@/i18n/translations"
import type { BetaMessageKey } from "@/i18n/messages"

import { prepareUpload } from "./downscale"
import {
  EMPTY_UPLOAD_QUEUE,
  failureFromResponse,
  hasRetryable,
  isRetryable,
  nextQueued,
  summarizeQueue,
  uploadQueueReducer,
  type UploadAction,
  type UploadFailure,
  type UploadItem,
  type UploadItemState,
} from "./upload-queue"

/**
 * The Dokumenty upload surface (spec §2.2: "drag/drop + `<input
 * capture="environment">` camera + gallery multi-select … per-file progress +
 * retry, queue survives tab switch").
 *
 * MOBILE FIRST, LITERALLY. The client this is for is standing on a stavba with
 * a phone and a handful of účtenky. So the two primary controls are a camera and
 * a gallery picker — both plain `<input type="file">`, because that is the only
 * file API that works on every phone and needs no permission prompt of its own —
 * and the drop zone is the DESKTOP affordance layered on top of them, not the
 * other way round. Drag events never fire on a touch screen; nothing here
 * depends on them.
 *
 * UPLOADS RUN ONE AT A TIME. Not a simplification — a decision. Six parallel
 * requests on the site 3G share the same pipe, so all six crawl, every progress
 * bar lies about how close it is, and a dropped connection loses six uploads
 * instead of one. Serially, the first document is safely on the book while the
 * sixth is still waiting, and a failure costs exactly one retry.
 *
 * WHY `XMLHttpRequest` AND NOT `fetch`. `fetch` has no upload progress event —
 * request-body streaming is not available on the browsers this ships to — and a
 * progress bar that only knows "started" and "finished" is a spinner with extra
 * steps. XHR reports `upload.onprogress` everywhere.
 *
 * THE QUEUE SURVIVES NAVIGATION WITHIN THE PAGE because it is component state
 * and this component stays mounted across the filter and pager links, which are
 * soft navigations inside the same route segment. It is deliberately NOT
 * persisted: a queue restored into a new page load would hold `File` handles
 * that no longer exist, so it could only ever restore rows it cannot act on.
 *
 * WHAT THIS COMPONENT DOES NOT DECIDE. Whether the caller may upload at all —
 * the page renders it only for a role that may (`canUploadDocuments`), and the
 * route refuses independently. Whether the bytes are acceptable — the server
 * sniffs them. What the document IS — `doc_type` is an office field (spec §3.3),
 * so nothing here offers to set one and every upload lands as `other` for the
 * Zpracování queue to label.
 */

/** What the file inputs advertise. */
const ACCEPT = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  // Extensions as well as types: Android and iOS both hand over HEIC files with
  // an empty or wrong `type` often enough that a types-only accept list quietly
  // greys out the photo the client is trying to send.
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
].join(",")

const STATE_LABEL_KEY = {
  queued: "dokumenty.uploadStateQueued",
  preparing: "dokumenty.uploadStatePreparing",
  uploading: "dokumenty.uploadStateUploading",
  done: "dokumenty.uploadStateDone",
  duplicate: "dokumenty.uploadStateDuplicate",
  failed: "dokumenty.uploadStateFailed",
} as const satisfies Record<UploadItemState, BetaMessageKey>

const FAILURE_MESSAGE_KEY = {
  too_large: "dokumenty.uploadErrorTooLarge",
  unsupported_type: "dokumenty.uploadErrorUnsupported",
  quota_exceeded: "dokumenty.uploadErrorQuota",
  invalid_filename: "dokumenty.uploadErrorFilename",
  forbidden: "dokumenty.uploadErrorForbidden",
  not_found: "dokumenty.uploadErrorNotFound",
  retry: "dokumenty.uploadErrorRetry",
  network: "dokumenty.uploadErrorNetwork",
  server: "dokumenty.uploadErrorServer",
} as const satisfies Record<UploadFailure, BetaMessageKey>

const STATE_BADGE_VARIANT = {
  queued: "outline",
  preparing: "outline",
  uploading: "secondary",
  done: "default",
  duplicate: "secondary",
  failed: "destructive",
} as const satisfies Record<
  UploadItemState,
  React.ComponentProps<typeof Badge>["variant"]
>

type UploadResponse = {
  status?: string
  document?: { id?: string; uploadedAt?: string }
}

/**
 * One request, with progress.
 *
 * Resolves with the terminal action for this item — it never throws, because
 * every outcome including "the connection died" is a state the queue has a name
 * for.
 */
function sendUpload(
  id: string,
  url: string,
  blob: Blob,
  handlers: {
    onProgress: (percent: number) => void
    onOpen: (request: XMLHttpRequest) => void
  },
): Promise<UploadAction> {
  return new Promise<UploadAction>((resolve) => {
    const request = new XMLHttpRequest()
    request.open("POST", url)
    request.responseType = "json"
    // The route reads the bytes as the raw body and the metadata from the query
    // string (see its header). A declared content type would be ignored — the
    // server sniffs — so the honest value is the generic one.
    request.setRequestHeader("content-type", "application/octet-stream")

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        handlers.onProgress((event.loaded / event.total) * 100)
      }
    }

    request.onerror = () => resolve({ type: "failed", id, failure: "network" })
    request.onabort = () => resolve({ type: "failed", id, failure: "network" })
    request.ontimeout = () =>
      resolve({ type: "failed", id, failure: "network" })

    request.onload = () => {
      const body = (request.response ?? {}) as UploadResponse & {
        error?: string
      }

      if (request.status === 201 && body.document?.id) {
        resolve({
          type: "stored",
          id,
          documentId: body.document.id,
          uploadedAt: body.document.uploadedAt ?? new Date().toISOString(),
        })
        return
      }

      // 200 is the duplicate answer (spec §2.2 — "never an error page"), and
      // `document` is ABSENT rather than null when the twin is a row this caller
      // may not read. Absent means: still a duplicate, still told so, no link.
      if (request.status === 200 && body.status === "duplicate") {
        resolve({
          type: "duplicate",
          id,
          documentId: body.document?.id ?? null,
          uploadedAt: body.document?.uploadedAt ?? null,
        })
        return
      }

      resolve({ type: "failed", id, failure: failureFromResponse(body.error) })
    }

    handlers.onOpen(request)
    request.send(blob)
  })
}

export function UploadPanel({ orgSlug }: { orgSlug: string }) {
  const t = useBetaTranslations()
  const router = useRouter()

  const [queue, dispatch] = React.useReducer(
    uploadQueueReducer,
    EMPTY_UPLOAD_QUEUE,
  )
  const [dragging, setDragging] = React.useState(false)

  const filesInput = React.useRef<HTMLInputElement>(null)
  const cameraInput = React.useRef<HTMLInputElement>(null)
  /** The picked `File` behind each queue id. Never part of reducer state. */
  const picked = React.useRef(new Map<string, File>())
  /** True while one upload owns the pump; see the effect below. */
  const running = React.useRef(false)
  const inFlight = React.useRef<XMLHttpRequest | null>(null)
  /** Set when at least one upload stored a row, so the table is refreshed once. */
  const storedSomething = React.useRef(false)

  const enqueue = React.useCallback((files: FileList | File[] | null) => {
    const list = Array.from(files ?? [])
    if (list.length === 0) return

    const items = list.map((file) => {
      // `crypto.randomUUID` needs a secure context; beta is https everywhere,
      // but a developer on plain http would otherwise hit a TypeError rather
      // than an upload. The fallback only has to be unique within one queue.
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      picked.current.set(id, file)
      return { id, filename: file.name, size: file.size }
    })

    dispatch({ type: "enqueue", items })
  }, [])

  // The pump. One upload at a time; `running` rather than a derived `isBusy`
  // because the flag has to be cleared BEFORE the terminal dispatch — the
  // dispatch is what re-runs this effect, and an effect that re-runs while the
  // flag is still set would find nothing to do and the queue would stall.
  React.useEffect(() => {
    if (running.current) return
    const next = nextQueued(queue)
    if (!next) return

    const file = picked.current.get(next.id)
    if (!file) {
      dispatch({ type: "failed", id: next.id, failure: "server" })
      return
    }

    running.current = true
    void (async () => {
      dispatch({ type: "preparing", id: next.id })
      // Browser-side downscale (spec §2.2). Never throws — a browser that cannot
      // do it uploads the original.
      const payload = await prepareUpload(file)

      dispatch({ type: "uploading", id: next.id })
      const url = `/api/orgs/${encodeURIComponent(orgSlug)}/documents?filename=${encodeURIComponent(payload.filename)}`
      const terminal = await sendUpload(next.id, url, payload.blob, {
        onProgress: (percent) =>
          dispatch({ type: "progress", id: next.id, progress: percent }),
        onOpen: (request) => {
          inFlight.current = request
        },
      })

      inFlight.current = null
      if (terminal.type === "stored") storedSomething.current = true
      // The file is kept for a retry and dropped only once the item can no
      // longer be retried, so a failed upload does not need re-picking.
      if (terminal.type !== "failed") picked.current.delete(next.id)

      running.current = false
      dispatch(terminal)
    })()
  }, [queue, orgSlug])

  // Abort whatever is in flight when the client navigates away. The row it was
  // writing is either committed or not; nothing half-written survives, because
  // the server's transaction is what decides (`lib/data/documents.ts`).
  React.useEffect(() => {
    return () => {
      inFlight.current?.abort()
    }
  }, [])

  // Refresh the table once the queue has settled, and only if something new
  // landed. Refreshing per file would re-render the whole page under an upload
  // that is still running; refreshing after a queue of pure duplicates would
  // re-fetch a list that cannot have changed.
  const summary = summarizeQueue(queue)
  React.useEffect(() => {
    if (!summary.settled || !storedSomething.current) return
    storedSomething.current = false
    router.refresh()
  }, [summary.settled, router])

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    enqueue(event.dataTransfer?.files ?? null)
  }

  return (
    <section
      aria-labelledby="upload-panel-title"
      className="grid gap-4 rounded-xl border border-border p-4"
    >
      <header className="grid gap-1">
        <h2 id="upload-panel-title" className="text-sm font-semibold">
          {t("dokumenty.uploadTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("dokumenty.uploadIntro")}
        </p>
      </header>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "grid gap-3 rounded-lg border border-dashed border-border p-4 text-center transition-colors",
          dragging && "border-primary bg-muted",
        )}
      >
        <p className="text-sm text-muted-foreground">
          {dragging
            ? t("dokumenty.uploadDropActive")
            : t("dokumenty.uploadDropHint")}
        </p>

        <div className="flex flex-wrap justify-center gap-2">
          {/* The camera comes FIRST: on the phone this product is used on, it
              is the action, and the gallery is the alternative. */}
          <Button type="button" onClick={() => cameraInput.current?.click()}>
            <FileImage data-icon="inline-start" />
            {t("dokumenty.uploadCamera")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => filesInput.current?.click()}
          >
            <Upload data-icon="inline-start" />
            {t("dokumenty.uploadPickFiles")}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("dokumenty.uploadFormats")}
        </p>
      </div>

      {/* Two inputs, not one with a toggled attribute: `capture` asks the OS for
          the CAMERA, and an input that sometimes captures and sometimes browses
          is an input whose behaviour depends on a re-render having happened. */}
      <input
        ref={filesInput}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        aria-label={t("dokumenty.uploadPickFiles")}
        onChange={(event) => {
          enqueue(event.target.files)
          // Cleared so that picking the same file twice in a row still fires a
          // change event — otherwise a retry-by-re-picking silently does
          // nothing.
          event.target.value = ""
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={t("dokumenty.uploadCamera")}
        onChange={(event) => {
          enqueue(event.target.files)
          event.target.value = ""
        }}
      />

      {queue.items.length > 0 ? (
        <div className="grid gap-3">
          <ul
            className="grid gap-2"
            aria-label={t("dokumenty.uploadQueueTitle")}
          >
            {queue.items.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                orgSlug={orgSlug}
                onRetry={() => dispatch({ type: "retry", id: item.id })}
              />
            ))}
          </ul>

          <div className="flex flex-wrap justify-end gap-2">
            {hasRetryable(queue) ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => dispatch({ type: "retryAll" })}
              >
                <RefreshCw data-icon="inline-start" />
                {t("dokumenty.uploadRetryAll")}
              </Button>
            ) : null}
            {summary.stored + summary.duplicate > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => dispatch({ type: "clearFinished" })}
              >
                {t("dokumenty.uploadClearFinished")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function QueueRow({
  item,
  orgSlug,
  onRetry,
}: {
  item: UploadItem
  orgSlug: string
  onRetry: () => void
}) {
  const t = useBetaTranslations()
  const busy = item.state === "preparing" || item.state === "uploading"

  return (
    <li
      data-upload-state={item.state}
      className="grid gap-1.5 rounded-lg border border-border px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">{item.filename}</span>
        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {formatBytes(item.size)}
        </span>
        <Badge variant={STATE_BADGE_VARIANT[item.state]}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {t(STATE_LABEL_KEY[item.state])}
        </Badge>
      </div>

      {item.state === "uploading" ? (
        <Progress
          value={item.progress}
          aria-label={t("dokumenty.uploadStateUploading")}
        />
      ) : null}

      {/* Spec §2.2 wants the day named ("už jste nahráli DD.MM.YYYY"). When the
          twin is a row this caller may not read, the response carries no field
          of it at all — so there is no date either, and the message says the
          honest, shorter thing. */}
      {item.state === "duplicate" ? (
        <p className="text-xs text-muted-foreground">
          {formatDate(item.documentUploadedAt) === null
            ? t("dokumenty.uploadDuplicateAlready")
            : `${t("dokumenty.uploadDuplicateOn")} ${formatDate(item.documentUploadedAt)}`}
        </p>
      ) : null}

      {item.failure !== null ? (
        <p className="text-xs text-destructive">
          {t(FAILURE_MESSAGE_KEY[item.failure])}
        </p>
      ) : null}

      {/* The same plain, attachment-by-default URL the row sheet's "Stáhnout"
          uses — there is no deep link to a table row (the sheet is client
          state), so "open it" is honestly spelled "download it". Absent for a
          duplicate whose twin the caller may not read: no id, no link. */}
      {(item.state === "done" || item.state === "duplicate") &&
      item.documentId !== null ? (
        <a
          href={`/api/orgs/${encodeURIComponent(orgSlug)}/documents/${item.documentId}/file`}
          download
          className="justify-self-start text-xs underline underline-offset-4"
        >
          {t("dokumenty.uploadOpenDocument")}
        </a>
      ) : null}

      {item.state === "failed" &&
      item.failure !== null &&
      isRetryable(item.failure) ? (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="justify-self-start"
          onClick={onRetry}
        >
          <RefreshCw data-icon="inline-start" />
          {t("dokumenty.uploadRetry")}
        </Button>
      ) : null}
    </li>
  )
}
