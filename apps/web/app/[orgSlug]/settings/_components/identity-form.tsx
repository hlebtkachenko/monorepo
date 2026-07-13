"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/content-panel"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import type {
  LegalFormOption,
  OrgSettingsData,
  PersonRow,
} from "../_lib/settings-data"
import type { OrgSettingsUpdate } from "../_lib/org-update"
import {
  addAuthorizedPersonAction,
  removeAuthorizedPersonAction,
  updateOrgSettingsAction,
} from "../actions"

// Sentinel select value — the shadcn Select has no empty item, so an explicit
// "not set" option carries the "clear legal form" intent to the patch.
const NO_LEGAL_FORM = "__none__"

interface IdentityFields {
  legalName: string
  ico: string
  legalFormCode: string
  contactEmail: string
  contactPhone: string
  website: string
  registeredStreet: string
  registeredHouseNumber: string
  registeredOrientationNumber: string
  registeredCity: string
  registeredPostalCode: string
  registeredRegion: string
  taxOfficeCode: string
  registryFileNumber: string
}

function toFields(data: OrgSettingsData): IdentityFields {
  return {
    legalName: data.legalName,
    ico: data.ico ?? "",
    legalFormCode: data.legalFormCode ?? NO_LEGAL_FORM,
    contactEmail: data.contactEmail ?? "",
    contactPhone: data.contactPhone ?? "",
    website: data.website ?? "",
    registeredStreet: data.registeredStreet ?? "",
    registeredHouseNumber: data.registeredHouseNumber ?? "",
    registeredOrientationNumber: data.registeredOrientationNumber ?? "",
    registeredCity: data.registeredCity ?? "",
    registeredPostalCode: data.registeredPostalCode ?? "",
    registeredRegion: data.registeredRegion ?? "",
    taxOfficeCode: data.taxOfficeCode ?? "",
    registryFileNumber: data.registryFileNumber ?? "",
  }
}

function toPatch(fields: IdentityFields): OrgSettingsUpdate {
  return {
    legalName: fields.legalName,
    ico: fields.ico,
    legalFormCode:
      fields.legalFormCode === NO_LEGAL_FORM ? "" : fields.legalFormCode,
    contactEmail: fields.contactEmail,
    contactPhone: fields.contactPhone,
    website: fields.website,
    registeredStreet: fields.registeredStreet,
    registeredHouseNumber: fields.registeredHouseNumber,
    registeredOrientationNumber: fields.registeredOrientationNumber,
    registeredCity: fields.registeredCity,
    registeredPostalCode: fields.registeredPostalCode,
    registeredRegion: fields.registeredRegion,
    taxOfficeCode: fields.taxOfficeCode,
    registryFileNumber: fields.registryFileNumber,
  }
}

/**
 * Identity settings — the mutable účetní-jednotka identity + contact + sídlo and
 * the statutory signatories list. Single archetype (centered stack of cards).
 * DIČ + person kind are read-only (DIČ lives on the self-counterparty; person
 * kind drives regime derivation). Writes gate on owner/admin in the action.
 */
export function IdentityForm({
  slug,
  data,
  canEdit,
}: {
  slug: string
  data: OrgSettingsData
  canEdit: boolean
}) {
  const router = useRouter()
  const initial = React.useMemo(() => toFields(data), [data])
  const [form, setForm] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const set = (key: keyof IdentityFields) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const dirty = React.useMemo(
    () =>
      (Object.keys(form) as (keyof IdentityFields)[]).some(
        (k) => form[k] !== initial[k],
      ),
    [form, initial],
  )

  async function onSave() {
    setSaving(true)
    const result = await updateOrgSettingsAction(slug, toPatch(form))
    setSaving(false)
    if (result.ok) {
      toast.success("Identity saved")
      router.refresh()
    } else {
      toast.error("Could not save identity", {
        description: "Try again in a moment.",
      })
    }
  }

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Identity" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace
          maxWidth="3xl"
          footer={
            canEdit ? (
              <>
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
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Legal identity</h2>
                </CardTitle>
                <CardDescription>
                  How this účetní jednotka is named on filings and výkazy.
                </CardDescription>
              </CardHeader>
              <CardContent className="@container">
                <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
                  <Field className="@md:col-span-2">
                    <FieldLabel htmlFor="id-name">Legal name</FieldLabel>
                    <Input
                      id="id-name"
                      value={form.legalName}
                      disabled={!canEdit}
                      onChange={(e) => set("legalName")(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-form">Legal form</FieldLabel>
                    <Select
                      value={form.legalFormCode}
                      disabled={!canEdit}
                      onValueChange={set("legalFormCode")}
                    >
                      <SelectTrigger id="id-form" className="w-full">
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_LEGAL_FORM}>Not set</SelectItem>
                        {data.legalForms.map((f: LegalFormOption) => (
                          <SelectItem key={f.code} value={f.code}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-ico">IČO</FieldLabel>
                    <Input
                      id="id-ico"
                      value={form.ico}
                      disabled={!canEdit}
                      inputMode="numeric"
                      onChange={(e) => set("ico")(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-dic">DIČ</FieldLabel>
                    <Input id="id-dic" value={data.dic ?? "—"} disabled />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-kind">Person kind</FieldLabel>
                    <Input id="id-kind" value={data.personKind} disabled />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Contact</h2>
                </CardTitle>
                <CardDescription>
                  Where clients and the platform reach the organization.
                </CardDescription>
              </CardHeader>
              <CardContent className="@container">
                <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="id-email">Contact email</FieldLabel>
                    <Input
                      id="id-email"
                      type="email"
                      value={form.contactEmail}
                      disabled={!canEdit}
                      onChange={(e) => set("contactEmail")(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-phone">Contact phone</FieldLabel>
                    <Input
                      id="id-phone"
                      value={form.contactPhone}
                      disabled={!canEdit}
                      onChange={(e) => set("contactPhone")(e.target.value)}
                    />
                  </Field>
                  <Field className="@md:col-span-2">
                    <FieldLabel htmlFor="id-web">Website</FieldLabel>
                    <Input
                      id="id-web"
                      value={form.website}
                      placeholder="https://"
                      disabled={!canEdit}
                      onChange={(e) => set("website")(e.target.value)}
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Registered seat (sídlo)</h2>
                </CardTitle>
                <CardDescription>
                  Printed on the header of every přiznání and výkaz.
                </CardDescription>
              </CardHeader>
              <CardContent className="@container">
                <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
                  <Field className="@md:col-span-2">
                    <FieldLabel htmlFor="id-street">Street</FieldLabel>
                    <Input
                      id="id-street"
                      value={form.registeredStreet}
                      disabled={!canEdit}
                      onChange={(e) => set("registeredStreet")(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-house">
                      House number (č.p.)
                    </FieldLabel>
                    <Input
                      id="id-house"
                      value={form.registeredHouseNumber}
                      disabled={!canEdit}
                      onChange={(e) =>
                        set("registeredHouseNumber")(e.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-orient">
                      Orientation number (č.o.)
                    </FieldLabel>
                    <Input
                      id="id-orient"
                      value={form.registeredOrientationNumber}
                      disabled={!canEdit}
                      onChange={(e) =>
                        set("registeredOrientationNumber")(e.target.value)
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-city">City</FieldLabel>
                    <Input
                      id="id-city"
                      value={form.registeredCity}
                      disabled={!canEdit}
                      onChange={(e) => set("registeredCity")(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-zip">Postal code</FieldLabel>
                    <Input
                      id="id-zip"
                      value={form.registeredPostalCode}
                      disabled={!canEdit}
                      onChange={(e) =>
                        set("registeredPostalCode")(e.target.value)
                      }
                    />
                  </Field>
                  <Field className="@md:col-span-2">
                    <FieldLabel htmlFor="id-region">Region (kraj)</FieldLabel>
                    <Input
                      id="id-region"
                      value={form.registeredRegion}
                      disabled={!canEdit}
                      onChange={(e) => set("registeredRegion")(e.target.value)}
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Tax registration</h2>
                </CardTitle>
                <CardDescription>
                  Finanční úřad + spisová značka (OR).
                </CardDescription>
              </CardHeader>
              <CardContent className="@container">
                <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="id-fu">
                      Tax office code (ÚFO)
                    </FieldLabel>
                    <Input
                      id="id-fu"
                      value={form.taxOfficeCode}
                      disabled={!canEdit}
                      onChange={(e) => set("taxOfficeCode")(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="id-file">
                      Registry file number
                    </FieldLabel>
                    <Input
                      id="id-file"
                      value={form.registryFileNumber}
                      disabled={!canEdit}
                      onChange={(e) =>
                        set("registryFileNumber")(e.target.value)
                      }
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <SignatoriesCard
              slug={slug}
              people={data.people}
              canEdit={canEdit}
            />
          </div>
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}

/** Authorized persons (statutory signatories) — list + add + remove. */
function SignatoriesCard({
  slug,
  people,
  canEdit,
}: {
  slug: string
  people: PersonRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [givenName, setGivenName] = React.useState("")
  const [familyName, setFamilyName] = React.useState("")
  const [position, setPosition] = React.useState("")
  const [isPrimary, setIsPrimary] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function onAdd() {
    if (givenName.trim() === "" || familyName.trim() === "") {
      toast.error("Given name and family name are required")
      return
    }
    setBusy(true)
    const result = await addAuthorizedPersonAction(slug, {
      givenName,
      familyName,
      position: position.trim() || null,
      isPrimary,
    })
    setBusy(false)
    if (result.ok) {
      toast.success("Signatory added")
      setGivenName("")
      setFamilyName("")
      setPosition("")
      setIsPrimary(false)
      router.refresh()
    } else {
      toast.error("Could not add signatory")
    }
  }

  async function onRemove(id: string) {
    setBusy(true)
    const result = await removeAuthorizedPersonAction(slug, id)
    setBusy(false)
    if (result.ok) {
      toast.success("Signatory removed")
      router.refresh()
    } else {
      toast.error("Could not remove signatory")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Authorized persons</h2>
        </CardTitle>
        <CardDescription>
          Statutory signatories on přiznání (jméno / příjmení / postavení).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {people.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Primary</TableHead>
                {canEdit ? (
                  <TableHead className="w-0 text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.givenName} {p.familyName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.position ?? "—"}
                  </TableCell>
                  <TableCell>{p.isPrimary ? "Yes" : "—"}</TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void onRemove(p.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">
            No signatories recorded.
          </p>
        )}

        {canEdit ? (
          <div className="@container">
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="sig-given">Given name</FieldLabel>
                <Input
                  id="sig-given"
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="sig-family">Family name</FieldLabel>
                <Input
                  id="sig-family"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="sig-pos">Position</FieldLabel>
                <Input
                  id="sig-pos"
                  value={position}
                  placeholder="jednatel…"
                  onChange={(e) => setPosition(e.target.value)}
                />
              </Field>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                />
                Primary signatory
              </label>
              <Button size="sm" disabled={busy} onClick={() => void onAdd()}>
                Add signatory
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
