"use client"

import * as React from "react"
import Link from "next/link"

import { ContentPanel, RecordWorkspace } from "@workspace/ui/blocks/app-content"
import { initialsOf } from "@workspace/ui/blocks/app-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"

export interface ProfileData {
  displayName: string
  email: string
  image?: string
  twoFactorEnabled: boolean
}

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
      {children}
    </section>
  )
}

/**
 * Your profile — the Single archetype (stack) for the signed-in user's account.
 * Identity + preferences are display-real with a stub Save (v1, matches the tier
 * maturity); the two-factor section is FULLY REAL — it reads the live
 * `twoFactorEnabled` flag and links to the real `/auth/mfa/setup` flow.
 *
 * No portaled `ContentHeader`: the nav-derived title ("Your profile") is
 * correct, so a custom header would only echo it.
 */
export function ProfileForm({ profile }: { profile: ProfileData }) {
  const [displayName, setDisplayName] = React.useState(profile.displayName)
  const dirty = displayName !== profile.displayName

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
              onClick={() => setDisplayName(profile.displayName)}
            >
              Discard
            </Button>
            <Button
              size="sm"
              disabled={!dirty}
              onClick={() => toast.success("Profile saved")}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Section
            title="Identity"
            description="Your name and avatar across the app."
          >
            <div className="flex items-center gap-4">
              <Avatar className="size-14">
                <AvatarImage src={profile.image} alt={profile.displayName} />
                <AvatarFallback>
                  {initialsOf(profile.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <Input
                    id="pf-email"
                    value={profile.email}
                    readOnly
                    disabled
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section
            title="Two-factor authentication"
            description="Protect your account with a TOTP authenticator app."
          >
            <div className="flex items-center justify-between gap-4">
              <Badge variant={profile.twoFactorEnabled ? "default" : "outline"}>
                {profile.twoFactorEnabled ? "Enabled" : "Not set up"}
              </Badge>
              {!profile.twoFactorEnabled ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/auth/mfa/setup">Set up two-factor</Link>
                </Button>
              ) : null}
            </div>
          </Section>

          <Section
            title="Preferences"
            description="Language follows your choice in the account menu (top-right)."
          >
            <p className="text-sm text-muted-foreground">
              Theme, icons, and language are set from the profile menu in the
              header.
            </p>
          </Section>
        </div>
      </RecordWorkspace>
    </ContentPanel>
  )
}
