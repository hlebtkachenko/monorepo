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

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import type {
  PeriodCloseCheck,
  PeriodCloseReadiness,
} from "@workspace/accounting"
import type { PeriodRow } from "../_lib/settings-data"
import { loadPeriodCloseReadinessAction, rollForwardAction } from "../actions"

// Regime code → human label (matches the regime reference seed).
const REGIME_LABEL: Record<string, string> = {
  DOUBLE_ENTRY: "Podvojné účetnictví",
  SINGLE_ENTRY: "Jednoduché účetnictví",
  TAX_RECORDS: "Daňová evidence",
}

function ReadinessCheckList({ checks }: { checks: PeriodCloseCheck[] }) {
  return (
    <ul className="space-y-2">
      {checks.map((check) => (
        <li
          key={check.code}
          className="rounded-lg border border-border px-3 py-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {check.label}
              </p>
              <p className="text-xs text-muted-foreground">{check.message}</p>
              {check.references && check.references.length > 0 ? (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {check.references
                    .map((reference) => reference.designation ?? reference.id)
                    .join(", ")}
                </p>
              ) : null}
            </div>
            <Badge
              variant={
                check.status === "FAIL"
                  ? "destructive"
                  : check.status === "UNAVAILABLE"
                    ? "outline"
                    : "secondary"
              }
            >
              {check.status === "PASS"
                ? "Pass"
                : check.status === "FAIL"
                  ? "Blocked"
                  : "Not verified"}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  )
}

function AvailableCloseChecks({ checks }: { checks: PeriodCloseCheck[] }) {
  return (
    <section className="space-y-2" aria-labelledby="close-checks">
      <h3 id="close-checks" className="text-sm font-semibold">
        Available checks
      </h3>
      <ReadinessCheckList
        checks={checks.filter((check) => check.severity === "BLOCKER")}
      />
    </section>
  )
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
  const [loadingReadiness, setLoadingReadiness] = React.useState(false)
  const [readiness, setReadiness] = React.useState<PeriodCloseReadiness | null>(
    null,
  )
  const [readinessError, setReadinessError] = React.useState(false)

  // The single OPEN period eligible to roll forward is the latest one; periods
  // are ordered newest-first, so the first OPEN row is the target.
  const rollTarget = periods.find((p) => p.status === "OPEN") ?? null

  async function openConfirmation() {
    if (!rollTarget) return
    setConfirming(true)
    setLoadingReadiness(true)
    setReadiness(null)
    setReadinessError(false)
    const result = await loadPeriodCloseReadinessAction(slug, rollTarget.id)
    setLoadingReadiness(false)
    if (result.ok) {
      setReadiness(result.readiness)
    } else {
      setReadinessError(true)
    }
  }

  async function onRoll() {
    if (!rollTarget || !readiness?.ready) return
    setBusy(true)
    const result = await rollForwardAction(slug, rollTarget.id)
    setBusy(false)
    if (result.ok) {
      setConfirming(false)
      toast.success("Period rolled forward")
      router.refresh()
    } else if (result.readiness) {
      setReadiness(result.readiness)
      toast.error("Period close is blocked", {
        description:
          "Readiness changed after the dialog opened. Review the current blockers.",
      })
    } else {
      setConfirming(false)
      toast.error("Could not roll the period forward", {
        description:
          result.errorKey === "forbidden"
            ? "Owner or administrator access is required."
            : "The period was not changed. Try loading readiness again.",
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
                    disabled={busy || loadingReadiness}
                    onClick={() => void openConfirmation()}
                  >
                    Roll period forward
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </RecordWorkspace>
      </ContentPanel>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!busy) setConfirming(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll period forward?</AlertDialogTitle>
            <AlertDialogDescription>
              {rollTarget
                ? `${
                    rollTarget.regimeCode === "DOUBLE_ENTRY"
                      ? "This creates closing entries, generates the period output, "
                      : "This generates the period output, "
                  }closes the open period (${rollTarget.periodStart} to ${rollTarget.periodEnd}), and opens the next fiscal year. It cannot be undone here.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {loadingReadiness ? (
              <p className="text-sm text-muted-foreground" role="status">
                Checking close readiness…
              </p>
            ) : null}
            {readinessError ? (
              <p className="text-sm text-destructive" role="alert">
                Close readiness could not be loaded. The period cannot be
                closed.
              </p>
            ) : null}
            {readiness ? (
              <>
                <AvailableCloseChecks checks={readiness.checks} />
                <p className="text-xs text-muted-foreground">
                  Passing available checks does not prove statutory filing
                  readiness or a complete statutory year close.
                </p>
                <section
                  className="space-y-2"
                  aria-labelledby="close-limitations"
                >
                  <h3 id="close-limitations" className="text-sm font-semibold">
                    Current limitations
                  </h3>
                  <ReadinessCheckList
                    checks={readiness.checks.filter(
                      (check) => check.severity === "WARNING",
                    )}
                  />
                </section>
              </>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                busy ||
                loadingReadiness ||
                readinessError ||
                readiness?.ready !== true
              }
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
