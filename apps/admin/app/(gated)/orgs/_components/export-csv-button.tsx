"use client"

import { useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { Download } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { exportOrgsCsv } from "../actions"

/**
 * `/orgs` toolbar button. Reads the live filter set from URL search params
 * (q, workspace, person_kind), invokes `exportOrgsCsv`, and triggers a
 * client-side download of the returned CSV via Blob + revoke URL.
 *
 * Disabled while a transition is pending so double-clicks can't fire two
 * audit rows.
 */
export function ExportCsvButton() {
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function handleClick(): void {
    const filters: Record<string, string | undefined> = {}
    const q = searchParams.get("q")
    if (q) filters.q = q
    const workspace = searchParams.get("workspace")
    if (workspace) filters.workspace = workspace
    const personKind = searchParams.get("person_kind")
    if (personKind) filters.person_kind = personKind

    startTransition(async () => {
      const result = await exportOrgsCsv({ filters })
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
