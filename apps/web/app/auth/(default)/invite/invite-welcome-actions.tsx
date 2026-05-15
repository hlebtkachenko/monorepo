"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { useTranslations } from "@workspace/i18n/client"
import { Button } from "@workspace/ui/components/button"

import { acceptInviteAction } from "./actions"

interface Props {
  alreadySignedIn: boolean
}

export function InviteWelcomeActions({ alreadySignedIn }: Props) {
  const router = useRouter()
  const t = useTranslations("auth.invite.welcome")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  if (alreadySignedIn) {
    return (
      <div className="flex flex-col gap-3">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button size="lg" onClick={onAccept} disabled={submitting}>
          {submitting ? t("submittingExisting") : t("continueExisting")}
        </Button>
      </div>
    )
  }

  return (
    <Button asChild size="lg">
      <Link href="/onboarding/member/profile">{t("continueNew")}</Link>
    </Button>
  )
}
