import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { requireBetaSession } from "@/lib/auth/session"
import { organizationForScope } from "@/lib/data/organizations"
import { ORG_ROLE_LABEL_KEY } from "@/lib/role-labels"

import { resolveOrgScope } from "./_lib/org-scope"

/**
 * Org home (Přehled, `/[orgSlug]`) — spec §2.1, but deliberately the MINIMAL
 * shell this PR is scoped to: an org identity card and a role-appropriate
 * greeting, nothing else. The KPI tiles, "co od vás potřebujeme", the
 * unified termíny list and the first-month state all land with PR 20 —
 * building any of them now as a placeholder would violate the no-placeholder
 * rule (a KPI tile with no feeder is exactly the "fake KPI tile" the brief
 * forbids).
 *
 * `resolveOrgScope` is the SAME `cache()`-wrapped call the layout already
 * made for this request — see `_lib/org-scope.ts` — so this is a memoized
 * read, not a second DB round trip for the scope resolution itself.
 */
export default async function OrgHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const [scope, t, viewer] = await Promise.all([
    resolveOrgScope(orgSlug),
    getBetaTranslations(),
    requireBetaSession(),
  ])
  const org = await organizationForScope(scope)

  return (
    <div className="grid gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">
            {org.legalName}
          </CardTitle>
          <CardDescription>
            {org.vatRegime === "platce"
              ? t("org.vatPlatce")
              : t("org.vatNeplatce")}
          </CardDescription>
        </CardHeader>
      </Card>

      <p className="text-sm text-muted-foreground">
        {t("org.greetingPrefix")}, {viewer.name || viewer.email}.{" "}
        {t("org.roleLabelPrefix")}: {t(ORG_ROLE_LABEL_KEY[scope.role])}.
      </p>
    </div>
  )
}
