"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import type { ActiveOrganizationOption } from "@workspace/auth/oauth-tenant-binding"
import { Button } from "@workspace/ui/components/button"

import { selectOrganizationAction } from "./actions"

/**
 * OAuth authorize org-selection step (postLogin.page). Users with more than one
 * active organization pick which one the issued token binds to. The choice is
 * persisted server-side (re-validated as a live membership), then we resume the
 * authorize flow via /oauth2/continue and follow the returned redirect_uri.
 */
export function SelectOrganizationForm({
  organizations,
}: {
  organizations: ActiveOrganizationOption[]
}) {
  const search = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function choose(organizationId: string) {
    setBusy(organizationId)
    setFailed(false)
    try {
      const stored = await selectOrganizationAction(organizationId)
      if (!stored.ok) {
        setFailed(true)
        setBusy(null)
        return
      }
      const res = await fetch("/api/auth/oauth2/continue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          postLogin: true,
          oauth_query: search.toString(),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        redirect_uri?: string
      }
      if (data.redirect_uri) {
        window.location.href = data.redirect_uri
        return
      }
      setFailed(true)
      setBusy(null)
    } catch {
      setFailed(true)
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Select organization</h1>
        <p className="text-sm text-muted-foreground">
          Choose the organization this authorization applies to.
        </p>
      </div>

      {organizations.length === 0 ? (
        <p role="alert" className="text-sm text-destructive">
          This account has no active organization to authorize.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {organizations.map((org) => (
            <li key={org.id}>
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full flex-col items-start gap-0.5 py-3 text-left"
                disabled={busy !== null}
                onClick={() => void choose(org.id)}
              >
                <span className="font-medium">{org.legalName}</span>
                <span className="text-xs text-muted-foreground">
                  {busy === org.id ? "Continuing…" : org.slug}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          Something went wrong. Please try again.
        </p>
      ) : null}
    </div>
  )
}
