"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { acceptInviteAction } from "../actions"

export function AcceptInviteCard() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onAccept() {
    setError(null)
    setSubmitting(true)
    const result = await acceptInviteAction()
    if (!result.ok) {
      setError(result.error ?? "Could not accept invitation")
      setSubmitting(false)
      return
    }
    router.push(
      `/auth/invite/done?slug=${encodeURIComponent(result.orgSlug ?? "")}`,
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept invitation</CardTitle>
        <CardDescription>
          You are already signed in. Click below to join the organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button onClick={onAccept} disabled={submitting} className="w-full">
          {submitting ? "Joining…" : "Accept invitation"}
        </Button>
      </CardContent>
    </Card>
  )
}
