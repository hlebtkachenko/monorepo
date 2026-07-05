"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { ContentPanel, RecordWorkspace } from "@workspace/ui/blocks/app-content"
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
import { toast } from "@workspace/ui/components/sonner"

import { saveBillingEntityAction } from "../../../workspace/billing/actions"
import type { BillingEntity } from "./data"

/**
 * Billing entity — the details printed on invoices (`workspace_billing`, which
 * may not exist yet → empty defaults). Save writes back through
 * `saveBillingEntityAction` (upsert). No portaled header — the nav-derived
 * "Billing entity" title is correct.
 */
export function BillingEntityForm({ entity }: { entity: BillingEntity }) {
  const router = useRouter()
  const [form, setForm] = React.useState(entity)
  const [saving, setSaving] = React.useState(false)
  const set = (key: keyof BillingEntity) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const dirty = React.useMemo(
    () =>
      (Object.keys(form) as (keyof BillingEntity)[]).some(
        (k) => form[k] !== entity[k],
      ),
    [form, entity],
  )

  async function onSave() {
    setSaving(true)
    const result = await saveBillingEntityAction(form)
    setSaving(false)
    if (result.ok) {
      toast.success("Billing entity saved")
      router.refresh()
    } else if (result.errorKey === "forbidden") {
      toast.error("You don't have permission to change this.")
    } else {
      toast.error("Could not save billing entity", {
        description: "Try again in a moment.",
      })
    }
  }

  return (
    <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
      <RecordWorkspace
        maxWidth="3xl"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => setForm(entity)}
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
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Billing entity</CardTitle>
            <CardDescription>Details printed on invoices.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="@container">
              <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
                <Field className="@xl:col-span-2">
                  <FieldLabel htmlFor="bl-name">Legal name</FieldLabel>
                  <Input
                    id="bl-name"
                    value={form.legalName}
                    onChange={(e) => set("legalName")(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bl-tax">Tax ID</FieldLabel>
                  <Input
                    id="bl-tax"
                    value={form.taxId}
                    onChange={(e) => set("taxId")(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bl-vat">VAT ID</FieldLabel>
                  <Input
                    id="bl-vat"
                    value={form.vatId}
                    onChange={(e) => set("vatId")(e.target.value)}
                  />
                </Field>
                <Field className="@xl:col-span-2">
                  <FieldLabel htmlFor="bl-street">Street</FieldLabel>
                  <Input
                    id="bl-street"
                    value={form.addressStreet}
                    onChange={(e) => set("addressStreet")(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bl-city">City</FieldLabel>
                  <Input
                    id="bl-city"
                    value={form.addressCity}
                    onChange={(e) => set("addressCity")(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bl-zip">ZIP</FieldLabel>
                  <Input
                    id="bl-zip"
                    value={form.addressZip}
                    onChange={(e) => set("addressZip")(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bl-country">Country</FieldLabel>
                  <Input
                    id="bl-country"
                    value={form.country}
                    onChange={(e) => set("country")(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bl-billemail">Billing email</FieldLabel>
                  <Input
                    id="bl-billemail"
                    type="email"
                    value={form.billingEmail}
                    onChange={(e) => set("billingEmail")(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </CardContent>
        </Card>
      </RecordWorkspace>
    </ContentPanel>
  )
}
