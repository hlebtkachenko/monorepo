"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { ArchetypeDetails } from "@workspace/ui/blocks/archetypes"
import { initialsOf } from "@workspace/ui/blocks/app-header"
import {
  sectionDetailsForm,
  sectionDetailsGroup,
  type SectionAction,
} from "@workspace/ui/blocks/content-panel"
import { toast } from "@workspace/ui/components/sonner"

import { saveProfileAction } from "../../../workspace/profile/actions"
import { EmailChangeDialog } from "./email-editor"
import {
  ProfileHistorySheet,
  type ProfileHistoryEvent,
} from "./profile-history-sheet"
import { SignatureDialog } from "./signature-editor"

const PHONE_CHANGED = "profile.phone.changed"
const AVATAR_CHANGED = "profile.avatar.changed"
const AVATAR_REMOVED = "profile.avatar.removed"
const CHANGE_EMAIL = "profile.email.open"
const EDIT_SIGNATURE = "profile.signature.open"
const POSITION_CHANGED = "profile.position.changed"
const DEPARTMENT_CHANGED = "profile.department.changed"

export interface ProfileData {
  displayName: string
  email: string
  image?: string
  titlePrefix: string
  givenName: string
  familyName: string
  titleSuffix: string
  phone: string
  jobTitle: string
  department: string
  jobTitleOptions: string[]
  departmentOptions: string[]
  experience: string | null
  signatureSet: boolean
  signaturePaths: string[]
  history: ProfileHistoryEvent[]
}

/**
 * Your profile — the Details archetype for the signed-in user's account.
 * Identity writes through `saveProfileAction`; account preferences live on
 * their dedicated profile subpage.
 */
export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [form, setForm] = React.useState(profile)
  const [croppedAvatar, setCroppedAvatar] = React.useState<Blob | null>(null)
  const [removeAvatar, setRemoveAvatar] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [revision, setRevision] = React.useState(0)
  const [emailOpen, setEmailOpen] = React.useState(false)
  const [signatureOpen, setSignatureOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const profileDirty = JSON.stringify(form) !== JSON.stringify(profile)
  const avatarDirty =
    croppedAvatar !== null || (removeAvatar && profile.image !== undefined)
  const dirty = profileDirty || avatarDirty

  const router = useRouter()
  const formRef = React.useRef<HTMLFormElement>(null)
  const set = <K extends keyof ProfileData>(key: K, value: ProfileData[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  function onSectionAction(action: SectionAction) {
    if (action.id === PHONE_CHANGED && typeof action.payload === "string") {
      set("phone", action.payload)
    }
    if (action.id === AVATAR_CHANGED && action.payload instanceof Blob) {
      setCroppedAvatar(action.payload)
      setRemoveAvatar(false)
    }
    if (action.id === AVATAR_REMOVED) {
      setCroppedAvatar(null)
      setRemoveAvatar(true)
    }
    if (action.id === CHANGE_EMAIL) setEmailOpen(true)
    if (action.id === EDIT_SIGNATURE) setSignatureOpen(true)
    if (action.id === POSITION_CHANGED && typeof action.payload === "string") {
      set("jobTitle", action.payload)
    }
    if (
      action.id === DEPARTMENT_CHANGED &&
      typeof action.payload === "string"
    ) {
      set("department", action.payload)
    }
  }

  async function onSave() {
    if (!formRef.current?.reportValidity()) return
    setSaving(true)
    try {
      if (removeAvatar && !croppedAvatar) {
        const response = await fetch("/api/upload/avatar", { method: "DELETE" })
        if (!response.ok) throw new Error("avatar delete failed")
      }
      if (croppedAvatar) {
        const body = new FormData()
        body.append(
          "file",
          croppedAvatar,
          croppedAvatar.type === "image/png" ? "avatar.png" : "avatar.jpg",
        )
        const response = await fetch("/api/upload/avatar", {
          method: "POST",
          body,
        })
        if (!response.ok) throw new Error("avatar upload failed")
      }
      if (profileDirty) {
        const result = await saveProfileAction({
          titlePrefix: form.titlePrefix,
          givenName: form.givenName,
          familyName: form.familyName,
          titleSuffix: form.titleSuffix,
          displayName: form.displayName,
          phone: form.phone,
          jobTitle: form.jobTitle,
          department: form.department,
        })
        if (!result.ok) throw new Error("profile save failed")
      }
      toast.success("Profile saved")
      setCroppedAvatar(null)
      setRemoveAvatar(false)
      router.refresh()
    } catch {
      toast.error("Could not save profile", {
        description: "Try again in a moment.",
      })
    } finally {
      setSaving(false)
    }
  }

  function onFormChange(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement
    switch (target.name) {
      case "title_prefix":
        set("titlePrefix", target.value)
        break
      case "given_name":
        set("givenName", target.value)
        break
      case "family_name":
        set("familyName", target.value)
        break
      case "title_suffix":
        set("titleSuffix", target.value)
        break
      case "display_name":
        set("displayName", target.value)
        break
    }
  }

  const sections = [
    sectionDetailsGroup({
      title: "General information",
      sections: [
        sectionDetailsForm({
          title: "Identity",
          description: "How your name appears across the app.",
          fields: [
            {
              label: "Profile photo",
              span: 6,
              control: {
                kind: "image-upload",
                src: removeAvatar ? undefined : profile.image,
                alt: form.displayName,
                fallback: initialsOf(form.displayName),
                changeActionId: AVATAR_CHANGED,
                removeActionId: AVATAR_REMOVED,
                resetKey: revision,
              },
            },
            {
              label: "Public / display name",
              name: "display_name",
              span: 3,
              hover: {
                description:
                  "Other people see this name in activity logs and when they mention you.",
              },
              control: {
                kind: "text",
                value: form.displayName,
                required: true,
              },
            },
            {
              label: "Title before",
              name: "title_prefix",
              span: 1,
              startNewRow: true,
              control: {
                kind: "text",
                value: form.titlePrefix,
                placeholder: "Ing.",
              },
            },
            {
              label: "First name",
              name: "given_name",
              span: 2,
              control: {
                kind: "text",
                value: form.givenName,
              },
            },
            {
              label: "Last name",
              name: "family_name",
              span: 2,
              control: {
                kind: "text",
                value: form.familyName,
              },
            },
            {
              label: "Title after",
              name: "title_suffix",
              span: 1,
              control: {
                kind: "text",
                value: form.titleSuffix,
                placeholder: "MBA",
              },
            },
          ],
        }),
        sectionDetailsForm({
          title: "Contact and signature",
          description: "Your verified contact details and saved signing mark.",
          fields: [
            {
              label: "Phone",
              name: "phone",
              span: 3,
              startNewRow: true,
              control: {
                kind: "phone",
                value: form.phone,
                changeActionId: PHONE_CHANGED,
              },
            },
            {
              label: "Email",
              name: "email",
              span: 3,
              startNewRow: true,
              control: { kind: "text", value: profile.email, disabled: true },
            },
            {
              label: "Email address",
              span: 3,
              control: {
                kind: "button",
                label: "Change email",
                actionId: CHANGE_EMAIL,
                variant: "outline",
              },
            },
            {
              label: "Signature",
              span: 3,
              startNewRow: true,
              control: {
                kind: "status",
                value: profile.signatureSet ? "Saved" : "Not added",
                tone: profile.signatureSet ? "success" : "destructive",
              },
            },
            {
              label: "Signing pad",
              span: 3,
              control: {
                kind: "button",
                label: profile.signatureSet
                  ? "Edit signature"
                  : "Add signature",
                actionId: EDIT_SIGNATURE,
                variant: "outline",
              },
            },
          ],
        }),
        sectionDetailsForm({
          title: "Company structure",
          description:
            "Your role in this workspace and where colleagues find you.",
          fields: [
            {
              label: "Position",
              name: "job_title",
              span: 3,
              control: {
                kind: "creatable-combobox",
                value: form.jobTitle,
                placeholder: "Select or create a position",
                options: profile.jobTitleOptions.map((value) => ({
                  label: value,
                  value,
                })),
                changeActionId: POSITION_CHANGED,
              },
            },
            {
              label: "Department",
              name: "department",
              span: 3,
              control: {
                kind: "creatable-combobox",
                value: form.department,
                placeholder: "Select or create a department",
                options: profile.departmentOptions.map((value) => ({
                  label: value,
                  value,
                })),
                changeActionId: DEPARTMENT_CHANGED,
              },
            },
            {
              label: "Onboarding experience",
              span: 3,
              control: {
                kind: "text",
                value:
                  {
                    new: "New to accounting",
                    some: "Some experience",
                    bookkeeper: "Bookkeeper",
                    accountant: "Accountant",
                  }[form.experience ?? ""] ?? "Not selected",
                disabled: true,
              },
            },
          ],
        }),
      ],
    }),
  ]

  return (
    <>
      <form
        ref={formRef}
        className="flex h-full min-h-0 flex-col overflow-hidden"
        onChange={onFormChange}
        onSubmit={(event) => event.preventDefault()}
      >
        <ArchetypeDetails
          key={revision}
          title="Profile"
          sections={sections}
          onSectionAction={onSectionAction}
          save={{
            dirty,
            saving,
            persistentAction: {
              label: "Profile history",
              onSelect: () => setHistoryOpen(true),
            },
            onSave: () => void onSave(),
            onDiscard: () => {
              formRef.current?.reset()
              setForm(profile)
              setCroppedAvatar(null)
              setRemoveAvatar(false)
              setRevision((value) => value + 1)
            },
          }}
        />
      </form>
      <EmailChangeDialog
        currentEmail={profile.email}
        open={emailOpen}
        onOpenChange={setEmailOpen}
      />
      <SignatureDialog
        initialPaths={profile.signaturePaths}
        open={signatureOpen}
        onOpenChange={setSignatureOpen}
      />
      <ProfileHistorySheet
        events={profile.history}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </>
  )
}
