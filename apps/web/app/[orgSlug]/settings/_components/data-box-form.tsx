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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"

import { AppPageHeader } from "../../../_components/app-page-header"
import { dataBoxError } from "../_lib/org-update"
import { updateOrgSettingsAction } from "../actions"

/**
 * Data box — the ISDS datová schránka id (7-char lowercase alphanumeric).
 * Validated client-side (pre-submit) and again in the server action (boundary),
 * both via the shared pure `dataBoxError`. Empty clears it. Owner/admin gated.
 */
export function DataBoxForm({
  slug,
  dataBoxId,
  canEdit,
}: {
  slug: string
  dataBoxId: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const initial = dataBoxId ?? ""
  const [value, setValue] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const error = dataBoxError(value)
  const dirty = value !== initial

  async function onSave() {
    if (error) {
      toast.error("Invalid data box id")
      return
    }
    setSaving(true)
    const result = await updateOrgSettingsAction(slug, { dataBoxId: value })
    setSaving(false)
    if (result.ok) {
      toast.success("Data box saved")
      router.refresh()
    } else {
      toast.error("Could not save data box", {
        description: "Try again in a moment.",
      })
    }
  }

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Data box" />
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
                  onClick={() => setValue(initial)}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  disabled={!dirty || saving || error !== null}
                  onClick={() => void onSave()}
                >
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : undefined
          }
        >
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Datová schránka</h2>
              </CardTitle>
              <CardDescription>
                The ISDS data box id used for official electronic delivery.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Field data-invalid={error !== null ? true : undefined}>
                <FieldLabel htmlFor="dbx-id">Data box id</FieldLabel>
                <Input
                  id="dbx-id"
                  value={value}
                  disabled={!canEdit}
                  maxLength={7}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="abc1234"
                  aria-invalid={error !== null}
                  onChange={(e) => setValue(e.target.value.toLowerCase())}
                />
                <FieldDescription>
                  7 characters, lowercase letters and digits. Leave blank to
                  clear.
                </FieldDescription>
                {error ? (
                  <FieldError>
                    Must be exactly 7 lowercase letters or digits.
                  </FieldError>
                ) : null}
              </Field>
            </CardContent>
          </Card>
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
