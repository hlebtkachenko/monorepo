"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { useTheme } from "next-themes"

import {
  locales,
  localeLabel,
  LOCALE_COOKIE,
  isLocale,
} from "@workspace/i18n/config"
import { ContentPanel, RecordWorkspace } from "@workspace/ui/blocks/content-panel"
import { initialsOf } from "@workspace/ui/blocks/app-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
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
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { toast } from "@workspace/ui/components/sonner"

import { saveDisplayNameAction } from "../../../workspace/profile/actions"

export interface ProfileData {
  displayName: string
  email: string
  image?: string
  twoFactorEnabled: boolean
}

/**
 * Your profile — the Single archetype (stack) for the signed-in user's account.
 * Display name writes back through `saveDisplayNameAction` (updates
 * `app_user.name` + `display_name`); locale + theme are already fully real
 * (cookie write + `next-themes`, untouched here). The two-factor section is
 * FULLY REAL — it reads the live `twoFactorEnabled` flag and links to the
 * real `/auth/mfa/setup` flow.
 *
 * No portaled `ContentHeader`: the nav-derived title ("Your profile") is
 * correct, so a custom header would only echo it.
 */
export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [displayName, setDisplayName] = React.useState(profile.displayName)
  const [saving, setSaving] = React.useState(false)
  const dirty = displayName !== profile.displayName

  const router = useRouter()
  const locale = useLocale()
  const { theme = "system", setTheme } = useTheme()

  async function onSave() {
    setSaving(true)
    const result = await saveDisplayNameAction({ displayName })
    setSaving(false)
    if (result.ok) {
      toast.success("Profile saved")
      router.refresh()
    } else {
      toast.error("Could not save profile", {
        description: "Try again in a moment.",
      })
    }
  }

  // Persist the chosen locale (NEXT_LOCALE cookie, 1y) + refresh so the
  // server re-resolves messages — same mechanism as the header account menu.
  const setLocale = (next: string) => {
    if (!isLocale(next)) return
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
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
              onClick={() => setDisplayName(profile.displayName)}
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
                <h2>Identity</h2>
              </CardTitle>
              <CardDescription>
                Your name and avatar across the app.
              </CardDescription>
            </CardHeader>
            <CardContent className="@container">
              <div className="flex flex-col gap-4 @xl:flex-row @xl:items-start">
                <Avatar className="size-14">
                  <AvatarImage src={profile.image} alt={profile.displayName} />
                  <AvatarFallback>
                    {initialsOf(profile.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 grid-cols-1 gap-4 @sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="pf-name">Display name</FieldLabel>
                    <Input
                      id="pf-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="pf-email">Email</FieldLabel>
                    <Input id="pf-email" value={profile.email} readOnly />
                  </Field>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Two-factor authentication</h2>
              </CardTitle>
              <CardDescription>
                Protect your account with a TOTP authenticator app.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <Badge
                  variant={profile.twoFactorEnabled ? "default" : "outline"}
                >
                  {profile.twoFactorEnabled ? "Enabled" : "Not set up"}
                </Badge>
                {!profile.twoFactorEnabled ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/auth/mfa/setup">Set up two-factor</Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Preferences</h2>
              </CardTitle>
              <CardDescription>
                Theme and language for your account.
              </CardDescription>
            </CardHeader>
            <CardContent className="@container">
              <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="pf-theme">Theme</FieldLabel>
                  <NativeSelect
                    id="pf-theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                  >
                    <NativeSelectOption value="system">
                      System
                    </NativeSelectOption>
                    <NativeSelectOption value="light">Light</NativeSelectOption>
                    <NativeSelectOption value="dark">Dark</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="pf-language">Language</FieldLabel>
                  <NativeSelect
                    id="pf-language"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                  >
                    {locales.map((code) => (
                      <NativeSelectOption key={code} value={code}>
                        {localeLabel[code]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>
      </RecordWorkspace>
    </ContentPanel>
  )
}
