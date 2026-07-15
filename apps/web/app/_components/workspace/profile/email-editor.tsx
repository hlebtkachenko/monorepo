"use client"

import * as React from "react"

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
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"

import { changeEmailAction } from "../../../auth/_lib/email-change-action"

export function EmailChangeDialog({
  currentEmail,
  open,
  onOpenChange,
}: {
  currentEmail: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [newEmail, setNewEmail] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const normalizedEmail = newEmail.trim().toLowerCase()

  function setOpen(next: boolean) {
    if (submitting) return
    if (!next) setNewEmail("")
    onOpenChange(next)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!normalizedEmail || normalizedEmail === currentEmail.toLowerCase()) {
      toast.error("Enter a different email address")
      return
    }
    setSubmitting(true)
    const result = await changeEmailAction(normalizedEmail)
    setSubmitting(false)
    if (result.ok) {
      toast.success("Verification email sent", {
        description: "Open the link in the new mailbox to finish the change.",
      })
      setNewEmail("")
      onOpenChange(false)
    } else {
      toast.error("Could not change email", { description: result.error })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(event) => void save(event)} className="contents">
          <DialogHeader>
            <DialogTitle>Change email</DialogTitle>
            <DialogDescription>
              New address becomes active after verification. Password
              confirmation may be required for an older session.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="current_email">Current email</FieldLabel>
              <Input
                id="current_email"
                type="email"
                value={currentEmail}
                disabled
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new_email">New email</FieldLabel>
              <Input
                id="new_email"
                name="new_email"
                type="email"
                autoComplete="email"
                value={newEmail}
                required
                disabled={submitting}
                onChange={(event) => setNewEmail(event.target.value)}
              />
              <FieldDescription>
                Verification link will be sent to this address.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={submitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submitting || !normalizedEmail}>
              {submitting ? "Sending…" : "Send verification email"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
