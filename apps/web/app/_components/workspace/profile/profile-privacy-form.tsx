"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { ArchetypeDetails } from "@workspace/ui/blocks/archetypes"
import {
  sectionDetailsForm,
  sectionDetailsGroup,
} from "@workspace/ui/blocks/content-panel"
import { toast } from "@workspace/ui/components/sonner"

import { saveProfilePrivacyAction } from "../../../workspace/profile/actions"

export interface ProfilePrivacyData {
  marketingConsent: boolean
  productUpdatesConsent: boolean
}

export function ProfilePrivacyForm({
  privacy,
  legalUrls,
}: {
  privacy: ProfilePrivacyData
  legalUrls: {
    privacy: string
    cookies: string
    terms: string
  }
}) {
  const router = useRouter()
  const [form, setForm] = React.useState(privacy)
  const [saving, setSaving] = React.useState(false)
  const [revision, setRevision] = React.useState(0)
  const formRef = React.useRef<HTMLFormElement>(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(privacy)

  async function onSave() {
    setSaving(true)
    const result = await saveProfilePrivacyAction(form)
    setSaving(false)
    if (result.ok) {
      toast.success("Privacy choices saved")
      router.refresh()
    } else {
      toast.error("Could not save privacy choices")
    }
  }

  function onChange(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement
    if (target.name === "product_updates_consent") {
      setForm((current) => ({
        ...current,
        productUpdatesConsent: target.value === "true",
      }))
    }
    if (target.name === "marketing_consent") {
      setForm((current) => ({
        ...current,
        marketingConsent: target.value === "true",
      }))
    }
  }

  return (
    <form
      ref={formRef}
      className="flex h-full min-h-0 flex-col overflow-hidden"
      onChange={onChange}
      onSubmit={(event) => event.preventDefault()}
    >
      <ArchetypeDetails
        key={revision}
        title="Privacy"
        breadcrumb={[{ label: "Profile", href: "/workspace/profile" }]}
        sections={[
          sectionDetailsGroup({
            title: "Communication",
            sections: [
              sectionDetailsForm({
                title: "Email consent",
                description:
                  "Choose the non-essential messages you want to receive.",
                fields: [
                  {
                    label: "Product updates",
                    name: "product_updates_consent",
                    span: 3,
                    control: {
                      kind: "select",
                      value: String(form.productUpdatesConsent),
                      options: [
                        { label: "Receive updates", value: "true" },
                        { label: "Do not receive", value: "false" },
                      ],
                    },
                  },
                  {
                    label: "Marketing messages",
                    name: "marketing_consent",
                    span: 3,
                    control: {
                      kind: "select",
                      value: String(form.marketingConsent),
                      options: [
                        { label: "Receive marketing", value: "true" },
                        { label: "Do not receive", value: "false" },
                      ],
                    },
                  },
                ],
              }),
            ],
          }),
          sectionDetailsGroup({
            title: "Legal",
            sections: [
              sectionDetailsForm({
                title: "Legal documents",
                description: "Read the policies that govern your account.",
                fields: [
                  {
                    label: "Privacy policy",
                    span: 2,
                    control: {
                      kind: "action",
                      label: "Read policy",
                      href: legalUrls.privacy,
                    },
                  },
                  {
                    label: "Cookie policy",
                    span: 2,
                    control: {
                      kind: "action",
                      label: "Read policy",
                      href: legalUrls.cookies,
                    },
                  },
                  {
                    label: "Terms of service",
                    span: 2,
                    control: {
                      kind: "action",
                      label: "Read terms",
                      href: legalUrls.terms,
                    },
                  },
                ],
              }),
            ],
          }),
        ]}
        save={{
          dirty,
          saving,
          onSave: () => void onSave(),
          onDiscard: () => {
            formRef.current?.reset()
            setForm(privacy)
            setRevision((value) => value + 1)
          },
        }}
      />
    </form>
  )
}
