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
 * Effective-dated payroll relationship and remittance facts. Each supported
 * obligation is configured independently; an existing legacy row remains a
 * visible needs-input state instead of being treated as no obligation.
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
  const [hasStandardEmployment, setHasStandardEmployment] = React.useState(
    current?.hasStandardEmployment ?? false,
  )
  const [hasDpp, setHasDpp] = React.useState(current?.hasDpp ?? false)
  const [hasDpc, setHasDpc] = React.useState(current?.hasDpc ?? false)
  const [socialInsurance, setSocialInsurance] = React.useState(
    current?.socialInsuranceParticipation ?? false,
  )
  const [healthInsurance, setHealthInsurance] = React.useState(
    current?.healthInsuranceParticipation ?? false,
  )
  const [payrollTaxAdvance, setPayrollTaxAdvance] = React.useState(
    current?.payrollTaxAdvanceDue ?? false,
  )
  const [specialRateWithholding, setSpecialRateWithholding] = React.useState(
    current?.specialRateWithholdingDue ?? false,
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
      hasStandardEmployment,
      hasDpp,
      hasDpc,
      socialInsuranceParticipation: socialInsurance,
      healthInsuranceParticipation: healthInsurance,
      payrollTaxAdvanceDue: payrollTaxAdvance,
      specialRateWithholdingDue: specialRateWithholding,
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
                Effective-dated facts for payroll relationships, insurance
                participation, and each supported tax remittance.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Current:</span>
                {current ? (
                  <>
                    <Badge>
                      {current.socialInsuranceParticipation === null ||
                      current.healthInsuranceParticipation === null ||
                      current.payrollTaxAdvanceDue === null ||
                      current.specialRateWithholdingDue === null
                        ? "Needs input"
                        : "Configured"}
                    </Badge>
                    <span className="text-muted-foreground">
                      since {current.validFrom}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Not configured</span>
                )}
              </div>

              {history.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Relationships</TableHead>
                      <TableHead>Remittances</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          {[
                            r.hasStandardEmployment ? "Employment" : null,
                            r.hasDpp ? "DPP" : null,
                            r.hasDpc ? "DPČ" : null,
                          ]
                            .filter(Boolean)
                            .join(", ") || "None"}
                        </TableCell>
                        <TableCell>
                          {r.socialInsuranceParticipation === null ||
                          r.healthInsuranceParticipation === null ||
                          r.payrollTaxAdvanceDue === null ||
                          r.specialRateWithholdingDue === null
                            ? "Needs input"
                            : [
                                r.socialInsuranceParticipation
                                  ? "Social"
                                  : null,
                                r.healthInsuranceParticipation
                                  ? "Health"
                                  : null,
                                r.payrollTaxAdvanceDue ? "Tax advance" : null,
                                r.specialRateWithholdingDue
                                  ? "Special-rate withholding"
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(", ") || "None"}
                        </TableCell>
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
                          Closes the current interval and opens a new one from
                          the effective date. Select only facts confirmed by
                          payroll records.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-col gap-4">
                        <Field>
                          <div className="flex items-center justify-between">
                            <FieldLabel htmlFor="tax-profile-employment">
                              Standard employment active
                            </FieldLabel>
                            <Switch
                              id="tax-profile-employment"
                              checked={hasStandardEmployment}
                              onCheckedChange={setHasStandardEmployment}
                            />
                          </div>
                        </Field>
                        {[
                          ["tax-profile-dpp", "DPP active", hasDpp, setHasDpp],
                          ["tax-profile-dpc", "DPČ active", hasDpc, setHasDpc],
                          [
                            "tax-profile-social",
                            "Social insurance participation",
                            socialInsurance,
                            setSocialInsurance,
                          ],
                          [
                            "tax-profile-health",
                            "Health insurance participation",
                            healthInsurance,
                            setHealthInsurance,
                          ],
                          [
                            "tax-profile-advance",
                            "Payroll tax advance due",
                            payrollTaxAdvance,
                            setPayrollTaxAdvance,
                          ],
                          [
                            "tax-profile-special",
                            "Special-rate withholding due",
                            specialRateWithholding,
                            setSpecialRateWithholding,
                          ],
                        ].map(([id, label, checked, setter]) => (
                          <Field key={id as string}>
                            <div className="flex items-center justify-between gap-4">
                              <FieldLabel htmlFor={id as string}>
                                {label as string}
                              </FieldLabel>
                              <Switch
                                id={id as string}
                                checked={checked as boolean}
                                onCheckedChange={
                                  setter as (value: boolean) => void
                                }
                              />
                            </div>
                          </Field>
                        ))}
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
