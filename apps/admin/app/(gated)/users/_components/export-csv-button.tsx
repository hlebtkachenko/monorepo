"use client"

import { useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { Download } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { exportUsersCsv } from "../actions"

/**
 * `/users` toolbar button. Reads filter set (q, banned, email_verified) from
 * URL search params, calls `exportUsersCsv`, then triggers a client-side
 * download of the resulting CSV.
 */
export function ExportCsvButton() {
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function handleClick(): void {
    const filters: Record<string, string | undefined> = {}
    const q = searchParams.get("q")
    if (q) filters.q = q
    const banned = searchParams.get("banned")
    if (banned) filters.banned = banned
    const emailVerified = searchParams.get("email_verified")
    if (emailVerified) filters.email_verified = emailVerified

    startTransition(async () => {
      const result = await exportUsersCsv({ filters })
      if (!result.ok) {
        toast.error(result.error ?? "Export failed")
        return
      }

      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = result.filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      toast.success(`Exported ${result.filename}`)
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
    >
      <Download className="size-3" aria-hidden />
      {pending ? "Exporting…" : "Export CSV"}
    </Button>
  )
}
