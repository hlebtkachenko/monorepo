"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/content-panel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AppPageHeader } from "../../../_components/app-page-header"
import type { PeriodRow } from "../_lib/settings-data"
import { rollForwardAction } from "../actions"

// Regime code → human label (matches the regime reference seed).
const REGIME_LABEL: Record<string, string> = {
  DOUBLE_ENTRY: "Podvojné účetnictví",
  SINGLE_ENTRY: "Jednoduché účetnictví",
  TAX_RECORDS: "Daňová evidence",
}

/**
 * Periods & fiscal year — the účetní období list (newest first) plus a
 * "Roll forward" action on the latest OPEN period, which closes it and opens
 * the next one via `rollForwardPeriod`. A confirm dialog gates the write.
 */
export function PeriodsView({
  slug,
  periods,
  canEdit,
}: {
  slug: string
  periods: PeriodRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // The single OPEN period eligible to roll forward is the latest one; periods
  // are ordered newest-first, so the first OPEN row is the target.
  const rollTarget = periods.find((p) => p.status === "OPEN") ?? null

  async function onRoll() {
    if (!rollTarget) return
    setBusy(true)
    const result = await rollForwardAction(slug, rollTarget.id)
    setBusy(false)
    setConfirming(false)
    if (result.ok) {
      toast.success("Period rolled forward")
      router.refresh()
    } else {
      // Roll-forward opens the next year's EVENT/DOCUMENT series, so a missing
      // number series is a common cause. Link straight to the remedy page.
      toast.error("Could not roll the period forward", {
        description: "Check the period is open and number series exist.",
        action: {
          label: "Number series",
          onClick: () => router.push(`/${slug}/settings/number-series`),
        },
      })
    }
  }

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Periods & fiscal year" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="3xl">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Účetní období</h2>
              </CardTitle>
              <CardDescription>
                Each fiscal year is one period; close the open one to roll the
                next forward.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {periods.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Regime</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periods.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="tabular-nums">
                          {p.periodStart}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {p.periodEnd}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {REGIME_LABEL[p.regimeCode] ?? p.regimeCode}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.status === "OPEN" ? "default" : "secondary"
                            }
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No accounting periods yet.
                </p>
              )}

              {canEdit && rollTarget ? (
                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                  >
                    Roll period forward
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </RecordWorkspace>
      </ContentPanel>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll period forward?</AlertDialogTitle>
            <AlertDialogDescription>
              {rollTarget
                ? `This closes the open period (${rollTarget.periodStart} to ${rollTarget.periodEnd}) and opens the next fiscal year. It cannot be undone here.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void onRoll()
              }}
            >
              {busy ? "Rolling…" : "Roll forward"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
