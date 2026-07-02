"use client"

import * as React from "react"

import { ContentPanel, RecordWorkspace } from "@workspace/ui/blocks/app-content"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { Textarea } from "@workspace/ui/components/textarea"

export interface WorkspaceSettings {
  displayName: string
  purpose: string
  contactEmail: string
  contactPhone: string
  website: string
}

/** A titled settings section — a card grouping related fields. */
function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="mb-4 space-y-0.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

/**
 * Workspace (firm) settings — the Single archetype in `stack` layout: one
 * centered form of grouped sections. Values are REAL (resolved server-side from
 * the `workspace` row); Save is a stub for v1 (a toast), matching the org tier's
 * mock maturity — persistence lands with the workspace write path later.
 *
 * No portaled `ContentHeader`: the shell's nav-derived title ("General") is
 * correct here, so a custom header would only duplicate it. The section `<h2>`s
 * are the firm-identity/contact group labels, distinct from the page title.
 */
export function SettingsForm({ settings }: { settings: WorkspaceSettings }) {
  const [form, setForm] = React.useState(settings)
  const set = (key: keyof WorkspaceSettings) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const dirty = React.useMemo(
    () =>
      (Object.keys(form) as (keyof WorkspaceSettings)[]).some(
        (k) => form[k] !== settings[k],
      ),
    [form, settings],
  )

  return (
    <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
      <RecordWorkspace
        maxWidth="3xl"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty}
              onClick={() => setForm(settings)}
            >
              Discard
            </Button>
            <Button
              size="sm"
              disabled={!dirty}
              onClick={() => toast.success("Workspace settings saved")}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Section
            title="Firm identity"
            description="How this accounting office is named across the app."
          >
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="ws-name">Workspace name</FieldLabel>
              <Input
                id="ws-name"
                value={form.displayName}
                onChange={(e) => set("displayName")(e.target.value)}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="ws-purpose">Purpose</FieldLabel>
              <Textarea
                id="ws-purpose"
                rows={3}
                value={form.purpose}
                placeholder="What this office does…"
                onChange={(e) => set("purpose")(e.target.value)}
              />
            </Field>
          </Section>

          <Section
            title="Contact"
            description="Where clients and the platform reach the firm."
          >
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
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="ws-website">Website</FieldLabel>
              <Input
                id="ws-website"
                value={form.website}
                placeholder="https://"
                onChange={(e) => set("website")(e.target.value)}
              />
            </Field>
          </Section>
        </div>
      </RecordWorkspace>
    </ContentPanel>
  )
}
