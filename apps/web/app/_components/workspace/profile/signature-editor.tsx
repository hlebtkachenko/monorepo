"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { SignaturePad } from "@workspace/ui/components/signature-pad"
import { toast } from "@workspace/ui/components/sonner"

import { saveProfileSignatureAction } from "../../../workspace/profile/actions"

export function SignatureDialog({
  initialPaths,
  open,
  onOpenChange,
}: {
  initialPaths: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [paths, setPaths] = React.useState(initialPaths)
  const [saving, setSaving] = React.useState(false)
  const [revision, setRevision] = React.useState(0)

  function setOpen(next: boolean) {
    if (saving) return
    if (!next) {
      setPaths(initialPaths)
      setRevision((value) => value + 1)
    }
    onOpenChange(next)
  }

  async function save() {
    setSaving(true)
    const result = await saveProfileSignatureAction(paths)
    setSaving(false)
    if (result.ok) {
      toast.success(paths.length > 0 ? "Signature saved" : "Signature removed")
      onOpenChange(false)
      router.refresh()
    } else {
      toast.error("Could not save signature")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Profile signature</DialogTitle>
          <DialogDescription>
            Draw signature used when application asks you to sign a record.
            Clear pad and save to remove it.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>Signing pad</FieldLabel>
          <SignaturePad
            key={`${revision}-${JSON.stringify(initialPaths)}`}
            className="h-56 min-h-56"
            defaultPaths={initialPaths}
            disabled={saving}
            onDrawEnd={(details) => setPaths(details.paths)}
            onClear={() => setPaths([])}
          />
          <FieldDescription>
            Signature stays private until used on a document.
          </FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save signature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
