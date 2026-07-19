"use client"

import { useSearchParams } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import type { ActiveOrganizationOption } from "@workspace/auth/oauth-tenant-binding"
import { OAuthSelectOrganizationForm } from "@workspace/ui/blocks/auth"

import { selectOrganizationAction } from "./actions"

/**
 * OAuth authorize org-selection step (postLogin.page). Users with more than one
 * active organization pick which one the issued token binds to. The choice is
 * persisted server-side (re-validated as a live membership), then we resume the
 * authorize flow via /oauth2/continue and follow the returned redirect_uri.
 *
 * Presentational shell + copy come from `OAuthSelectOrganizationForm` + i18n;
 * this wrapper owns the persistence + resume round-trip only.
 */
export function SelectOrganizationForm({
  organizations,
}: {
  organizations: ActiveOrganizationOption[]
}) {
  const search = useSearchParams()
  const t = useTranslations("auth.oauth.selectOrganization")

  async function select(organizationId: string): Promise<boolean> {
    const stored = await selectOrganizationAction(organizationId)
    if (!stored.ok) return false
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
      return true
    }
    return false
  }

  return (
    <OAuthSelectOrganizationForm
      organizations={organizations.map((org) => ({
        id: org.id,
        legalName: org.legalName,
        slug: org.slug,
      }))}
      onSelect={select}
      messages={{
        title: t("title"),
        description: t("description"),
        continuing: t("continuing"),
        empty: t("empty"),
        failed: t("failed"),
      }}
    />
  )
}
