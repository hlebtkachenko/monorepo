"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { useTranslations } from "@workspace/i18n/client"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
import { Input } from "@workspace/ui/components/input"
import { Text } from "@workspace/ui/components/text"
import { ArrowLeft, ArrowRightIcon, Shield } from "@workspace/ui/lib/icons"

import { AuthHeaderLinkOverride } from "../_components/auth-header-link"
import { acceptInviteAction, signOutForInviteAction } from "./actions"

interface Props {
  email: string
  role: string
  isSignedIn: boolean
  matchesSession: boolean
  sessionEmail: string | null
}

export function InviteWelcomeActions({
  email,
  role,
  isSignedIn,
  matchesSession,
  sessionEmail,
}: Props) {
  const router = useRouter()
  const t = useTranslations("auth.invite.welcome")
  const tMismatch = useTranslations("auth.invite.mismatch")
  const tBrand = useTranslations("brand")
  const brand = tBrand("name")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const backIcon = useMemo(
    () => <ArrowLeft className="size-4" aria-hidden="true" />,
    [],
  )

  async function onAccept() {
    setError(null)
    setSubmitting(true)
    const result = await acceptInviteAction()
    if (!result.ok) {
      setError(result.error ?? "Could not accept invitation")
      setSubmitting(false)
      return
    }
    router.push(result.orgSlug ? `/${result.orgSlug}` : "/workspace")
  }

  const wrongEmail = isSignedIn && !matchesSession

  // A different account is signed in (e.g. a stale session from prior
  // testing). Don't bounce to login — that's a dead end. Render an
  // in-place screen with a working "sign out" action so the user can
  // clear the wrong session and continue with this invite link.
  if (wrongEmail) {
    return (
      <div className="flex flex-col gap-8">
        <AuthHeaderLinkOverride
          href="/auth/login"
          label={t("decline")}
          icon={backIcon}
        />

        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {tMismatch("title")}
          </Heading>
          <Text variant="muted">
            {tMismatch("description", {
              sessionEmail: sessionEmail ?? "",
              claimEmail: email,
            })}
          </Text>
        </header>

        <Text variant="muted">{tMismatch("instruction")}</Text>

        <form action={signOutForInviteAction}>
          <Button type="submit" size="xl" className="w-full">
            {tMismatch("signOut")}
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <AuthHeaderLinkOverride
        href="/auth/login"
        label={t("decline")}
        icon={backIcon}
      />

      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("description", { brand })}</Text>
      </header>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invite-email">{t("emailLabel")}</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            inputSize="xl"
            value={email}
            readOnly
            disabled
            autoComplete="off"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-role">{t("roleLabel")}</FieldLabel>
          <Input
            id="invite-role"
            inputSize="xl"
            value={role}
            readOnly
            disabled
            autoComplete="off"
          />
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-5">
        {error && (
          <Text variant="small" className="text-destructive" role="alert">
            {error}
          </Text>
        )}

        {matchesSession ? (
          <Button
            type="button"
            size="xl"
            onClick={onAccept}
            disabled={submitting}
          >
            {submitting ? t("submittingExisting") : t("continueExisting")}
          </Button>
        ) : (
          <Button asChild size="xl">
            <Link href="/onboarding/profile">{t("continueNew")}</Link>
          </Button>
        )}

        {!isSignedIn && (
          <>
            <FieldSeparator>{t("divider")}</FieldSeparator>
            <Button asChild variant="outline" size="xl" className="w-full">
              <Link href="/auth/login">
                <Shield className="size-4" aria-hidden="true" />
                {t("signInExisting")}
              </Link>
            </Button>
          </>
        )}
      </div>

      <Text variant="muted" className="text-xs">
        {t("footnote", { brand })}
      </Text>
    </div>
  )
}
