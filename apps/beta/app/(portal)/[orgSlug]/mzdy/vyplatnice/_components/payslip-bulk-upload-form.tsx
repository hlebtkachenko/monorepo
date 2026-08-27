"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import { matchPayslipFilename } from "@/lib/data/payslip-matching"

import {
  EMPTY_PAYSLIP_UPLOAD_QUEUE,
  isRetryable,
  payslipUploadReducer,
  type PayslipUploadFailure,
  type PayslipUploadItem,
  type PayslipUploadItemState,
} from "../_lib/payslip-upload-queue"

const STATE_LABEL: Record<PayslipUploadItemState, BetaMessageKey> = {
  queued: "mzdy.vyplatniceUploadStateQueued",
  uploading: "mzdy.vyplatniceUploadStateUploading",
  done: "mzdy.vyplatniceUploadStateDone",
  duplicate: "mzdy.vyplatniceUploadStateDuplicate",
  failed: "mzdy.vyplatniceUploadStateFailed",
}

const FAILURE_LABEL: Record<PayslipUploadFailure, BetaMessageKey> = {
  empty_body: "mzdy.vyplatniceUploadErrorEmptyBody",
  unsupported_type: "mzdy.vyplatniceUploadErrorUnsupportedType",
  too_large: "mzdy.vyplatniceUploadErrorTooLarge",
  invalid_filename: "mzdy.vyplatniceUploadErrorInvalidFilename",
  unknown_employee: "mzdy.vyplatniceUploadErrorUnknownEmployee",
  unknown_period: "mzdy.vyplatniceUploadErrorUnknownPeriod",
  quota_exceeded: "mzdy.vyplatniceUploadErrorQuota",
  retry: "mzdy.vyplatniceUploadErrorRetry",
  network: "mzdy.vyplatniceUploadErrorNetwork",
  server: "mzdy.vyplatniceUploadErrorServer",
}

/** The subset of `PayslipUploadRefusal` the server's JSON `error` field can
 * name — anything else (an unparsed body, a 5xx with no JSON) falls back to
 * `"server"` below. */
function isKnownFailure(value: string): value is PayslipUploadFailure {
  return value in FAILURE_LABEL
}

type PayslipEmployeeOption = { id: string; fullName: string }

/**
 * `jszip` is imported dynamically — an office bulk-upload wizard is not a
 * dependency every visit to Výplatnice should pay to load — and this helper
 * is the one place that dynamic import's type resolves, so the component body
 * never has to name jszip's own (unusual: `export = JSZip`, no `declare
 * class`) type shape at all. `null` is a load failure — a file that is not a
 * ZIP, or a corrupted one — never an exception the caller must catch.
 */
async function loadZip(file: File) {
  const { default: JSZip } = await import("jszip")
  try {
    return await JSZip.loadAsync(file)
  } catch {
    return null
  }
}

/**
 * Mzdy › Výplatnice's bulk upload (spec §2.6): pick a ZIP of payslip PDFs,
 * review the proposed filename→employee matches, correct any of them, then
 * upload each accepted row.
 *
 * THE ZIP IS OPENED IN THE BROWSER, NEVER SENT WHOLE TO THE SERVER. `jszip`
 * runs client-side; each accepted entry becomes its OWN request to
 * `/api/orgs/[orgSlug]/payroll/payslips`, replaying the raw-body streaming
 * discipline `documents/route.ts` established (see that route's own header)
 * for a payslip PDF instead of a client document. This is also why there is
 * no server-side "draft batch" for this upload the way Měsíční uzávěrka has
 * one: a payslip is an independent `document` row per employee, not a
 * dataset with its own publish/rollback lifecycle.
 *
 * A PROPOSAL IS NEVER TRUSTED SILENTLY. `matchPayslipFilename` only pre-fills
 * the dropdown; nothing uploads until the office presses the submit button,
 * and every row stays reassignable (except mid-flight or once it has
 * succeeded) — `payroll.ts`'s own header names a wrong payslip attribution as
 * the worst outcome this module can produce, and a client-side guess is not
 * where that gets decided.
 */
export function PayslipBulkUploadForm({
  orgSlug,
  periodId,
  employees,
}: {
  orgSlug: string
  periodId: string
  employees: readonly PayslipEmployeeOption[]
}) {
  const t = useBetaTranslations()
  const router = useRouter()
  const [queue, dispatch] = React.useReducer(
    payslipUploadReducer,
    EMPTY_PAYSLIP_UPLOAD_QUEUE,
  )
  const [zipError, setZipError] = React.useState<BetaMessageKey | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  /** Non-serializable, so it lives outside React state — see the file blobs
   * by item id, read only at upload time. */
  const blobsRef = React.useRef(new Map<string, Blob>())

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    dispatch({ type: "reset" })
    blobsRef.current.clear()
    setZipError(null)

    const zip = await loadZip(file)
    if (!zip) {
      setZipError("mzdy.vyplatniceUploadZipInvalid")
      return
    }

    const entries = Object.values(zip.files).filter((entry) => !entry.dir)
    if (entries.length === 0) {
      setZipError("mzdy.vyplatniceUploadZipEmpty")
      return
    }

    const items: {
      id: string
      filename: string
      size: number
      employeeId: string | null
      confidence: "high" | "low" | null
    }[] = []

    for (const entry of entries) {
      const filename = entry.name.split("/").pop() ?? entry.name
      const blob = await entry.async("blob")
      const id = `${filename}-${crypto.randomUUID()}`
      blobsRef.current.set(id, blob)
      const match = matchPayslipFilename(filename, employees)
      items.push({
        id,
        filename,
        size: blob.size,
        employeeId: match?.employeeId ?? null,
        confidence: match?.confidence ?? null,
      })
    }

    dispatch({ type: "enqueue", items })
  }

  async function uploadOne(item: PayslipUploadItem): Promise<void> {
    const blob = blobsRef.current.get(item.id)
    if (!item.employeeId || !blob) return

    dispatch({ type: "uploading", id: item.id })

    const url = new URL(
      `/api/orgs/${orgSlug}/payroll/payslips`,
      window.location.origin,
    )
    url.searchParams.set("filename", item.filename)
    url.searchParams.set("employeeId", item.employeeId)
    url.searchParams.set("periodId", periodId)

    try {
      const response = await fetch(url, { method: "POST", body: blob })
      if (response.ok) {
        const payload = (await response.json()) as { status: string }
        dispatch({
          type: payload.status === "duplicate" ? "duplicate" : "done",
          id: item.id,
        })
        return
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      const reason = payload?.error
      dispatch({
        type: "failed",
        id: item.id,
        failure: reason && isKnownFailure(reason) ? reason : "server",
      })
    } catch {
      dispatch({ type: "failed", id: item.id, failure: "network" })
    }
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true)
    try {
      // Sequential, not parallel: this is an office bulk action against ONE
      // organization's quota-locked write path (`uploadPayslipDocument`'s own
      // row lock), so parallel requests would only queue behind each other
      // in Postgres while adding nothing but request noise.
      for (const item of queue.items) {
        if (item.state !== "queued" || item.employeeId === null) continue
        await uploadOne(item)
      }
    } finally {
      setSubmitting(false)
      router.refresh()
    }
  }

  async function handleRetry(id: string): Promise<void> {
    const item = queue.items.find((candidate) => candidate.id === id)
    if (!item) return
    await uploadOne({ ...item, state: "queued", failure: null })
  }

  const hasAssignableRow = queue.items.some(
    (item) => item.state === "queued" && item.employeeId !== null,
  )

  return (
    <div className="grid gap-4 rounded-lg border border-border-subtle p-4">
      <div className="grid gap-1">
        <h2 className="font-heading text-sm font-semibold">
          {t("mzdy.vyplatniceUploadTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("mzdy.vyplatniceUploadIntro")}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="payslip-zip">{t("mzdy.vyplatniceUploadPickZip")}</Label>
        <Input
          id="payslip-zip"
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => void handleFileChange(event)}
        />
      </div>

      {zipError ? (
        <Alert variant="destructive">
          <AlertDescription>{t(zipError)}</AlertDescription>
        </Alert>
      ) : null}

      {queue.items.length > 0 ? (
        <div className="grid gap-3">
          <h3 className="font-heading text-xs font-semibold text-muted-foreground">
            {t("mzdy.vyplatniceUploadPreviewTitle")}
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("mzdy.vyplatniceUploadColumnFile")}</TableHead>
                <TableHead>{t("mzdy.vyplatniceUploadColumnMatch")}</TableHead>
                <TableHead>{t("mzdy.vyplatniceUploadColumnStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.items.map((item) => {
                const locked =
                  item.state === "uploading" ||
                  item.state === "done" ||
                  item.state === "duplicate"
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.filename}</p>
                      {item.confidence === "low" ? (
                        <p className="text-xs text-muted-foreground">
                          {t("mzdy.vyplatniceUploadConfidenceLow")}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <NativeSelect
                        aria-label={t("mzdy.vyplatniceUploadColumnMatch")}
                        value={item.employeeId ?? ""}
                        disabled={locked}
                        onChange={(event) =>
                          dispatch({
                            type: "reassign",
                            id: item.id,
                            employeeId: event.target.value || null,
                          })
                        }
                      >
                        <NativeSelectOption value="">
                          {t("mzdy.vyplatniceUploadMatchNone")}
                        </NativeSelectOption>
                        {employees.map((employee) => (
                          <NativeSelectOption
                            key={employee.id}
                            value={employee.id}
                          >
                            {employee.fullName}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell>
                      {item.state === "failed" ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-destructive">
                            {t(FAILURE_LABEL[item.failure ?? "server"])}
                          </span>
                          {isRetryable(item.failure ?? "server") ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleRetry(item.id)}
                            >
                              {t("mzdy.vyplatniceUploadRetry")}
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t(STATE_LABEL[item.state])}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <Button
            type="button"
            disabled={!hasAssignableRow || submitting}
            onClick={() => void handleSubmit()}
            className="justify-self-start"
          >
            {submitting
              ? t("mzdy.vyplatniceUploadSubmitting")
              : t("mzdy.vyplatniceUploadSubmit")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
