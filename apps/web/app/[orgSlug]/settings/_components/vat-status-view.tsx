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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import type { VatFilingPeriod, VatRegime } from "@workspace/accounting"

import { AppPageHeader } from "../../../_components/app-page-header"
import type {
  OssRow,
  TaxRepresentativeRow,
  VatStatusData,
  VatStatusRow,
} from "../_lib/settings-data"
import {
  addOssRegistrationAction,
  changeVatStatusAction,
  closeOssRegistrationAction,
  saveTaxRepresentativeAction,
} from "../actions"

const FILING_LABEL: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
}

/**
 * VAT status — the current + historical VAT regime (vat_status), the EU
 * One-Stop-Shop registrations, and the tax representative. Reads are
 * server-loaded; each change is a gated (owner/admin) server action.
 */
export function VatStatusView({
  slug,
  data,
  canEdit,
}: {
  slug: string
  data: VatStatusData
  canEdit: boolean
}) {
  const current = data.history[0] ?? null
  const regimeName = (code: string) =>
    data.regimes.find((r) => r.code === code)?.name ?? code

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="VAT status" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="3xl">
          <div className="flex flex-col gap-5">
            <VatStatusCard
              slug={slug}
              current={current}
              history={data.history}
              regimes={data.regimes}
              regimeName={regimeName}
              canEdit={canEdit}
            />
            <OssCard slug={slug} oss={data.oss} canEdit={canEdit} />
            <RepresentativeCard
              slug={slug}
              representative={data.representative}
              canEdit={canEdit}
            />
          </div>
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}

function VatStatusCard({
  slug,
  current,
  history,
  regimes,
  regimeName,
  canEdit,
}: {
  slug: string
  current: VatStatusRow | null
  history: VatStatusRow[]
  regimes: Array<{ code: string; name: string }>
  regimeName: (code: string) => string
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [regime, setRegime] = React.useState<VatRegime>("NON_PAYER")
  const [filing, setFiling] = React.useState<VatFilingPeriod>("MONTHLY")
  const [validFrom, setValidFrom] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function onChange() {
    if (validFrom.trim() === "") {
      toast.error("Effective date is required")
      return
    }
    setBusy(true)
    const result = await changeVatStatusAction(slug, {
      vatRegimeCode: regime,
      validFrom,
      filingPeriod: regime === "PAYER" ? filing : null,
    })
    setBusy(false)
    if (result.ok) {
      toast.success("VAT status changed")
      setOpen(false)
      setValidFrom("")
      router.refresh()
    } else {
      toast.error("Could not change VAT status", {
        description: "The new range must not overlap an existing one.",
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>VAT status</h2>
        </CardTitle>
        <CardDescription>
          Current regime (neplátce / plátce / identifikovaná osoba) and its
          history.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Current:</span>
          {current ? (
            <>
              <Badge>{regimeName(current.vatRegimeCode)}</Badge>
              {current.filingPeriod ? (
                <span className="text-muted-foreground">
                  ({FILING_LABEL[current.filingPeriod] ?? current.filingPeriod})
                </span>
              ) : null}
              <span className="text-muted-foreground">
                since {current.validFrom}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </div>

        {history.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Regime</TableHead>
                <TableHead>Filing</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{regimeName(r.vatRegimeCode)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.filingPeriod
                      ? (FILING_LABEL[r.filingPeriod] ?? r.filingPeriod)
                      : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.validFrom}</TableCell>
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
                <Button size="sm">Change VAT status</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change VAT status</DialogTitle>
                  <DialogDescription>
                    Closes the current row and opens a new one from the
                    effective date.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <Field>
                    <FieldLabel htmlFor="vat-regime">Regime</FieldLabel>
                    <Select
                      value={regime}
                      onValueChange={(v) => setRegime(v as VatRegime)}
                    >
                      <SelectTrigger id="vat-regime" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {regimes.map((r) => (
                          <SelectItem key={r.code} value={r.code}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {regime === "PAYER" ? (
                    <Field>
                      <FieldLabel htmlFor="vat-filing">
                        Filing period
                      </FieldLabel>
                      <Select
                        value={filing}
                        onValueChange={(v) => setFiling(v as VatFilingPeriod)}
                      >
                        <SelectTrigger id="vat-filing" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MONTHLY">Monthly</SelectItem>
                          <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
                  <Field>
                    <FieldLabel htmlFor="vat-from">Effective from</FieldLabel>
                    <Input
                      id="vat-from"
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
                    {busy ? "Saving…" : "Change status"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function OssCard({
  slug,
  oss,
  canEdit,
}: {
  slug: string
  oss: OssRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [scheme, setScheme] = React.useState("UNION")
  const [validFrom, setValidFrom] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function onAdd() {
    if (validFrom.trim() === "") {
      toast.error("Registration date is required")
      return
    }
    setBusy(true)
    const result = await addOssRegistrationAction(slug, { scheme, validFrom })
    setBusy(false)
    if (result.ok) {
      toast.success("OSS registration added")
      setValidFrom("")
      router.refresh()
    } else {
      toast.error("Could not add OSS registration", {
        description: "The new range must not overlap an existing one.",
      })
    }
  }

  async function onClose(id: string) {
    const today = new Date().toISOString().slice(0, 10)
    setBusy(true)
    const result = await closeOssRegistrationAction(slug, {
      id,
      validTo: today,
    })
    setBusy(false)
    if (result.ok) {
      toast.success("OSS registration closed")
      router.refresh()
    } else {
      toast.error("Could not close OSS registration")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>OSS registrations</h2>
        </CardTitle>
        <CardDescription>
          EU One-Stop-Shop (§110k+ ZDPH). Union and import schemes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {oss.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Scheme</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                {canEdit ? (
                  <TableHead className="w-0 text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {oss.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.scheme}</TableCell>
                  <TableCell className="tabular-nums">{r.validFrom}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {r.validTo ?? "current"}
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      {r.validTo === null ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void onClose(r.id)}
                        >
                          Close
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No OSS registrations.</p>
        )}

        {canEdit ? (
          <div className="@container">
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="oss-scheme">Scheme</FieldLabel>
                <Select value={scheme} onValueChange={setScheme}>
                  <SelectTrigger id="oss-scheme" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNION">Union</SelectItem>
                    <SelectItem value="IMPORT">Import</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="oss-from">Registered from</FieldLabel>
                <Input
                  id="oss-from"
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-3 flex items-center justify-end">
              <Button size="sm" disabled={busy} onClick={() => void onAdd()}>
                Add registration
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

interface RepFields {
  representativeType: string
  legalName: string
  givenName: string
  familyName: string
  ico: string
  dic: string
  advisorRegistrationNumber: string
}

function toRepFields(rep: TaxRepresentativeRow | null): RepFields {
  return {
    representativeType: rep?.representativeType ?? "",
    legalName: rep?.legalName ?? "",
    givenName: rep?.givenName ?? "",
    familyName: rep?.familyName ?? "",
    ico: rep?.ico ?? "",
    dic: rep?.dic ?? "",
    advisorRegistrationNumber: rep?.advisorRegistrationNumber ?? "",
  }
}

function RepresentativeCard({
  slug,
  representative,
  canEdit,
}: {
  slug: string
  representative: TaxRepresentativeRow | null
  canEdit: boolean
}) {
  const router = useRouter()
  const initial = React.useMemo(
    () => toRepFields(representative),
    [representative],
  )
  const [form, setForm] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const set = (key: keyof RepFields) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const dirty = React.useMemo(
    () =>
      (Object.keys(form) as (keyof RepFields)[]).some(
        (k) => form[k] !== initial[k],
      ),
    [form, initial],
  )

  async function onSave() {
    setSaving(true)
    const result = await saveTaxRepresentativeAction(slug, form)
    setSaving(false)
    if (result.ok) {
      toast.success("Tax representative saved")
      router.refresh()
    } else {
      toast.error("Could not save tax representative")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Tax representative</h2>
        </CardTitle>
        <CardDescription>
          Zástupce (daňový poradce / zákonný zástupce) who files on behalf of
          the client.
        </CardDescription>
      </CardHeader>
      <CardContent className="@container flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="rep-type">Type</FieldLabel>
            <Input
              id="rep-type"
              value={form.representativeType}
              placeholder="daňový poradce…"
              disabled={!canEdit}
              onChange={(e) => set("representativeType")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rep-legal">Legal name</FieldLabel>
            <Input
              id="rep-legal"
              value={form.legalName}
              disabled={!canEdit}
              onChange={(e) => set("legalName")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rep-given">Given name</FieldLabel>
            <Input
              id="rep-given"
              value={form.givenName}
              disabled={!canEdit}
              onChange={(e) => set("givenName")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rep-family">Family name</FieldLabel>
            <Input
              id="rep-family"
              value={form.familyName}
              disabled={!canEdit}
              onChange={(e) => set("familyName")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rep-ico">IČO</FieldLabel>
            <Input
              id="rep-ico"
              value={form.ico}
              disabled={!canEdit}
              onChange={(e) => set("ico")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rep-dic">DIČ</FieldLabel>
            <Input
              id="rep-dic"
              value={form.dic}
              disabled={!canEdit}
              onChange={(e) => set("dic")(e.target.value)}
            />
          </Field>
          <Field className="@md:col-span-2">
            <FieldLabel htmlFor="rep-kdp">
              Advisor registration number (KDP)
            </FieldLabel>
            <Input
              id="rep-kdp"
              value={form.advisorRegistrationNumber}
              disabled={!canEdit}
              onChange={(e) => set("advisorRegistrationNumber")(e.target.value)}
            />
          </Field>
        </div>
        {canEdit ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => setForm(initial)}
            >
              Discard
            </Button>
            <Button
              size="sm"
              disabled={!dirty || saving}
              onClick={() => void onSave()}
            >
              {saving ? "Saving…" : "Save representative"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
