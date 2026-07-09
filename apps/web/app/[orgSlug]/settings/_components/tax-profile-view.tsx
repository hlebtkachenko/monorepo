"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
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
import type { TaxProfileData } from "../_lib/settings-data"
import { changeTaxProfileAction } from "../actions"

/**
 * Tax profile — the current + historical has_employees fact
 * (organization_tax_profile), the operational attribute the statutory
 * obligation engine uses to decide whether payroll obligations exist for a
 * period. Reads are server-loaded; each change is a gated (owner/admin)
 * server action.
 */
export function TaxProfileView({
  slug,
  data,
  canEdit,
}: {
  slug: string
  data: TaxProfileData
  canEdit: boolean
}) {
  const current = data.history[0] ?? null
  const history = data.history
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [hasEmployees, setHasEmployees] = React.useState(
    current?.hasEmployees ?? false,
  )
  const [validFrom, setValidFrom] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function onChange() {
    if (validFrom.trim() === "") {
      toast.error("Effective date is required")
      return
    }
    setBusy(true)
    const result = await changeTaxProfileAction(slug, {
      hasEmployees,
      validFrom,
    })
    setBusy(false)
    if (result.ok) {
      toast.success("Tax profile changed")
      setOpen(false)
      setValidFrom("")
      router.refresh()
    } else {
      toast.error("Could not change tax profile", {
        description: "The new range must not overlap an existing one.",
      })
    }
  }

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Tax profile" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="3xl">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Tax profile</h2>
              </CardTitle>
              <CardDescription>
                Whether the organization currently has employees, and its
                history. Drives payroll obligations on the Closing cockpit.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Current:</span>
                {current ? (
                  <>
                    <Badge>
                      {current.hasEmployees ? "Has employees" : "No employees"}
                    </Badge>
                    <span className="text-muted-foreground">
                      since {current.validFrom}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Not set (no employees)
                  </span>
                )}
              </div>

              {history.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Has employees</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.hasEmployees ? "Yes" : "No"}</TableCell>
                        <TableCell className="tabular-nums">
                          {r.validFrom}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {r.validTo ?? "current"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}

              {canEdit ? (
                <div className="flex items-center justify-end">
                  <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">Change tax profile</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Change tax profile</DialogTitle>
                        <DialogDescription>
                          Closes the current row and opens a new one from the
                          effective date.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-col gap-4">
                        <Field>
                          <div className="flex items-center justify-between">
                            <FieldLabel htmlFor="tax-profile-has-employees">
                              Has employees
                            </FieldLabel>
                            <Switch
                              id="tax-profile-has-employees"
                              checked={hasEmployees}
                              onCheckedChange={setHasEmployees}
                            />
                          </div>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="tax-profile-from">
                            Effective from
                          </FieldLabel>
                          <Input
                            id="tax-profile-from"
                            type="date"
                            value={validFrom}
                            onChange={(e) => setValidFrom(e.target.value)}
                          />
                        </Field>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void onChange()}
                        >
                          {busy ? "Saving…" : "Change profile"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
