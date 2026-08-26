import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { requireBetaSession } from "@/lib/auth/session"
import { openClientTasksForScope } from "@/lib/data/client-tasks"
import { organizationForScope } from "@/lib/data/organizations"
import { ORG_ROLE_LABEL_KEY } from "@/lib/role-labels"

import { ClientTaskList } from "./_components/client-task-list"
import { resolveOrgScope } from "./_lib/org-scope"

/**
 * Org home (Přehled, `/[orgSlug]`) — spec §2.1. Still deliberately MINIMAL:
 * an org identity card, a role-appropriate greeting, and now "Co od vás
 * potřebujeme" (item 1 — see `_components/client-task-list.tsx`'s own header
 * for why this one card ships now rather than waiting for PR 20). The KPI
 * tiles, Nejbližší termíny and the first-month state still land with PR 20 —
 * building any of THOSE now as a placeholder would violate the no-placeholder
 * rule (a KPI tile with no feeder is exactly the "fake KPI tile" the brief
 * forbids); "Co od vás potřebujeme" is not a placeholder because this PR is
 * what creates its feeder, `client_task`.
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
  const [org, tasks] = await Promise.all([
    organizationForScope(scope),
    openClientTasksForScope(scope),
  ])

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

      <ClientTaskList orgSlug={orgSlug} tasks={tasks} />
    </div>
  )
}
