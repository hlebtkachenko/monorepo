"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"

import { LOCALE_COOKIE, localeLabel, locales } from "@workspace/i18n/config"
import { ArchetypeDetails } from "@workspace/ui/blocks/archetypes"
import {
  sectionDetailsForm,
  sectionDetailsGroup,
} from "@workspace/ui/blocks/content-panel"
import { useIconPack, type IconPackName } from "@workspace/ui/icon-packs"
import { toast } from "@workspace/ui/components/sonner"

import { saveProfileAppearanceAction } from "../../../workspace/profile/actions"

export interface ProfileAppearanceData {
  locale: "en" | "cs"
  theme: "system" | "light" | "dark"
  iconStyle: "lucide" | "phosphor" | "fontawesome"
  timezone: string
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD"
  timeFormat: "24-hour" | "12-hour"
}

function listTimezones(current: string): string[] {
  try {
    const values = Intl.supportedValuesOf("timeZone")
    return values.includes(current) ? values : [current, ...values]
  } catch {
    return [current]
  }
}

export function ProfileAppearanceForm({
  appearance,
}: {
  appearance: ProfileAppearanceData
}) {
  const router = useRouter()
  const { setTheme } = useTheme()
  const { setPack } = useIconPack()
  const [form, setForm] = React.useState(appearance)
  const [saving, setSaving] = React.useState(false)
  const [revision, setRevision] = React.useState(0)
  const formRef = React.useRef<HTMLFormElement>(null)
  const timezones = React.useMemo(
    () => listTimezones(appearance.timezone),
    [appearance.timezone],
  )
  const dirty = JSON.stringify(form) !== JSON.stringify(appearance)

  async function onSave() {
    setSaving(true)
    const result = await saveProfileAppearanceAction(form)
    setSaving(false)
    if (result.ok) {
      setTheme(form.theme)
      setPack(form.iconStyle as IconPackName)
      document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(form.locale)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      toast.success("Appearance saved")
      router.refresh()
    } else {
      toast.error("Could not save appearance")
    }
  }

  function onChange(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement
    switch (target.name) {
      case "timezone":
        setForm((current) => ({ ...current, timezone: target.value }))
        break
      case "date_format":
        if (["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].includes(target.value)) {
          setForm((current) => ({
            ...current,
            dateFormat: target.value as ProfileAppearanceData["dateFormat"],
          }))
        }
        break
      case "time_format":
        if (target.value === "24-hour" || target.value === "12-hour") {
          setForm((current) => ({
            ...current,
            timeFormat: target.value as ProfileAppearanceData["timeFormat"],
          }))
        }
        break
      case "theme":
        if (["system", "light", "dark"].includes(target.value)) {
          setForm((current) => ({
            ...current,
            theme: target.value as ProfileAppearanceData["theme"],
          }))
        }
        break
      case "language":
        if (target.value === "en" || target.value === "cs") {
          const locale = target.value
          setForm((current) => ({ ...current, locale }))
        }
        break
      case "icon_pack":
        if (["lucide", "phosphor", "fontawesome"].includes(target.value)) {
          setForm((current) => ({
            ...current,
            iconStyle: target.value as ProfileAppearanceData["iconStyle"],
          }))
        }
        break
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
        title="Appearance"
        breadcrumb={[{ label: "Profile", href: "/workspace/profile" }]}
        sections={[
          sectionDetailsGroup({
            title: "Appearance",
            sections: [
              sectionDetailsForm({
                title: "Appearance and language",
                description:
                  "Choose how the application looks and reads for your account.",
                fields: [
                  {
                    label: "Theme",
                    name: "theme",
                    span: 2,
                    control: {
                      kind: "select",
                      value: form.theme,
                      options: [
                        { label: "System", value: "system" },
                        { label: "Light", value: "light" },
                        { label: "Dark", value: "dark" },
                      ],
                    },
                  },
                  {
                    label: "Language",
                    name: "language",
                    span: 2,
                    control: {
                      kind: "select",
                      value: form.locale,
                      options: locales.map((code) => ({
                        label: localeLabel[code],
                        value: code,
                      })),
                    },
                  },
                  {
                    label: "Icon style",
                    name: "icon_pack",
                    span: 2,
                    control: {
                      kind: "select",
                      value: form.iconStyle,
                      options: [
                        { label: "Lucide", value: "lucide" },
                        { label: "Phosphor", value: "phosphor" },
                        { label: "Font Awesome", value: "fontawesome" },
                      ],
                    },
                  },
                ],
              }),
              sectionDetailsForm({
                title: "Regional settings",
                description: "Control how dates, times, and schedules appear.",
                fields: [
                  {
                    label: "Time zone",
                    name: "timezone",
                    span: 2,
                    control: {
                      kind: "select",
                      value: form.timezone,
                      options: timezones.map((value) => ({
                        label: value,
                        value,
                      })),
                    },
                  },
                  {
                    label: "Date format",
                    name: "date_format",
                    span: 2,
                    control: {
                      kind: "select",
                      value: form.dateFormat,
                      options: [
                        { label: "31/12/2026", value: "DD/MM/YYYY" },
                        { label: "12/31/2026", value: "MM/DD/YYYY" },
                        { label: "2026-12-31", value: "YYYY-MM-DD" },
                      ],
                    },
                  },
                  {
                    label: "Time format",
                    name: "time_format",
                    span: 2,
                    control: {
                      kind: "select",
                      value: form.timeFormat,
                      options: [
                        { label: "24-hour", value: "24-hour" },
                        { label: "12-hour", value: "12-hour" },
                      ],
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
            setForm(appearance)
            setRevision((value) => value + 1)
          },
        }}
      />
    </form>
  )
}
