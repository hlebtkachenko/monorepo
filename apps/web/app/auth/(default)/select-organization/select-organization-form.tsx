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
 * authorize flow via /oauth2/continue and follow the returned `url` (the next
 * step — consent — or the final client callback).
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
    // Better Auth returns `{ redirect: true, url }` (no `redirect_uri` field).
    // After org selection `url` is either the next step (the consent page) or
    // the final client callback — navigate to it either way. `redirect_uri`
    // stays a defensive fallback across BA versions.
    const data = (await res.json().catch(() => ({}))) as {
      url?: string
      redirect_uri?: string
    }
    const target = data.url ?? data.redirect_uri
    if (target) {
      window.location.href = target
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
