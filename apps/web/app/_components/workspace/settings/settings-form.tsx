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
import { Textarea } from "@workspace/ui/components/textarea"

import { saveWorkspaceSettingsAction } from "../../../workspace/settings/actions"

export interface WorkspaceSettings {
  displayName: string
  purpose: string
  contactEmail: string
  contactPhone: string
  website: string
}

/**
 * Workspace (firm) settings — the Single archetype in `stack` layout: one
 * centered form of grouped sections. Values are REAL (resolved server-side from
 * the `workspace` row); Save writes back through `saveWorkspaceSettingsAction`.
 *
 * No portaled `ContentHeader`: the shell's nav-derived title ("General") is
 * correct here, so a custom header would only duplicate it. The section `<h2>`s
 * are the firm-identity/contact group labels, distinct from the page title.
 */
export function SettingsForm({ settings }: { settings: WorkspaceSettings }) {
  const router = useRouter()
  const [form, setForm] = React.useState(settings)
  const [saving, setSaving] = React.useState(false)
  const set = (key: keyof WorkspaceSettings) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const dirty = React.useMemo(
    () =>
      (Object.keys(form) as (keyof WorkspaceSettings)[]).some(
        (k) => form[k] !== settings[k],
      ),
    [form, settings],
  )

  async function onSave() {
    setSaving(true)
    const result = await saveWorkspaceSettingsAction(form)
    setSaving(false)
    if (result.ok) {
      toast.success("Settings saved")
      router.refresh()
    } else if (result.errorKey === "forbidden") {
      toast.error("You don't have permission to change this.")
    } else {
      toast.error("Could not save settings", {
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
              onClick={() => setForm(settings)}
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
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Firm identity</h2>
              </CardTitle>
              <CardDescription>
                How this accounting office is named across the app.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="ws-name">Workspace name</FieldLabel>
                <Input
                  id="ws-name"
                  value={form.displayName}
                  onChange={(e) => set("displayName")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ws-purpose">Purpose</FieldLabel>
                <Textarea
                  id="ws-purpose"
                  rows={3}
                  value={form.purpose}
                  placeholder="What this office does…"
                  onChange={(e) => set("purpose")(e.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Contact</h2>
              </CardTitle>
              <CardDescription>
                Where clients and the platform reach the firm.
              </CardDescription>
            </CardHeader>
            <CardContent className="@container">
              <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="ws-email">Contact email</FieldLabel>
                  <Input
                    id="ws-email"
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => set("contactEmail")(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ws-phone">Contact phone</FieldLabel>
                  <Input
                    id="ws-phone"
                    value={form.contactPhone}
                    onChange={(e) => set("contactPhone")(e.target.value)}
                  />
                </Field>
                <Field className="@md:col-span-2">
                  <FieldLabel htmlFor="ws-website">Website</FieldLabel>
                  <Input
                    id="ws-website"
                    value={form.website}
                    placeholder="https://"
                    onChange={(e) => set("website")(e.target.value)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>
      </RecordWorkspace>
    </ContentPanel>
  )
}
