"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  DEFAULT_NUMBER_SERIES,
  DEFAULT_NUMBER_SERIES_CODES,
} from "@workspace/accounting/number-series-defaults"
import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
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
import type { NumberSeriesRow } from "../_lib/settings-data"
import { backfillNumberSeriesAction } from "../actions"

const DEFAULT_DESCRIPTION_BY_KEY = new Map(
  DEFAULT_NUMBER_SERIES.map((series) => [
    `${series.entityType}:${series.code}:${series.pattern}`,
    series.description,
  ]),
)

// entity_type → human label (Czech domain terms, matches the capture layer).
const ENTITY_TYPE_LABEL: Record<string, string> = {
  EVENT: "Účetní případy",
  DOCUMENT: "Doklady",
  ASSET: "Majetek",
  INVENTORY_COUNT: "Inventury",
}

/**
 * Number series — the number_series list (read-only) plus a "Restore default
 * series" action that backfills any missing default série via
 * `backfillDefaultNumberSeries`. Gapless numbering is legally sensitive, so
 * existing series are never edited or removed here — only additions.
 */
export function NumberSeriesView({
  slug,
  rows,
  canEdit,
}: {
  slug: string
  rows: NumberSeriesRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function onBackfill() {
    setBusy(true)
    const result = await backfillNumberSeriesAction(slug)
    setBusy(false)
    setConfirming(false)
    if (result.ok) {
      toast.success(
        result.added && result.added > 0
          ? `Added ${result.added} series`
          : "All default series already present",
      )
      router.refresh()
    } else {
      toast.error("Could not restore default series")
    }
  }

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Number series" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="3xl">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Číselné řady</h2>
              </CardTitle>
              <CardDescription>
                Number series are gapless and legally sensitive, so editing or
                removing an existing series is intentionally not offered here.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {rows.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Type</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Pattern</TableHead>
                      <TableHead>Next number</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground">
                          {ENTITY_TYPE_LABEL[r.entityType] ?? r.entityType}
                        </TableCell>
                        <TableCell className="font-mono">{r.code}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {DEFAULT_DESCRIPTION_BY_KEY.get(
                            `${r.entityType}:${r.code}:${r.pattern}`,
                          ) ?? "Custom series"}
                        </TableCell>
                        <TableCell className="font-mono">{r.pattern}</TableCell>
                        <TableCell className="tabular-nums">
                          {r.nextNumber}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No number series yet.
                </p>
              )}

              {canEdit ? (
                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setConfirming(true)}
                  >
                    Restore default series
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
            <AlertDialogTitle>Restore default series?</AlertDialogTitle>
            <AlertDialogDescription>
              This adds any missing default series (
              {DEFAULT_NUMBER_SERIES_CODES}). It never changes or removes an
              existing series.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void onBackfill()
              }}
            >
              {busy ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
