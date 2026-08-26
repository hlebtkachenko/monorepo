import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import {
  officeEnvironmentReport,
  officeOperationsSummary,
} from "@/lib/data/office/operations"
import { requireOffice } from "@/lib/data/scope"

import { PageHeader } from "../../_components/page-header"

/**
 * Provoz — what the deployment currently holds, and whether it is configured
 * (spec §3.5: "healthz, env, seed non-prod").
 *
 * Read-only, by design. The env block reports PRESENCE over a fixed list of
 * names and never a value; `/healthz` is a link rather than a fetch, because a
 * page that probes the liveness endpoint on render turns a health check into a
 * page-load dependency. Seeding is PR 36 — see `operations.ts`.
 */
export default async function AdminOperationsPage() {
  const office = await requireOffice()
  const [t, summary] = await Promise.all([
    getBetaTranslations(),
    officeOperationsSummary(office),
  ])
  const environment = officeEnvironmentReport(office)

  const counts: readonly {
    labelKey: Parameters<typeof t>[0]
    value: number
  }[] = [
    { labelKey: "admin.countOrganizations", value: summary.organizations },
    {
      labelKey: "admin.countArchivedOrganizations",
      value: summary.archivedOrganizations,
    },
    { labelKey: "admin.countUsers", value: summary.users },
    { labelKey: "admin.countStaffUsers", value: summary.staffUsers },
    { labelKey: "admin.countDisabledUsers", value: summary.disabledUsers },
    {
      labelKey: "admin.countActiveMemberships",
      value: summary.activeMemberships,
    },
    { labelKey: "admin.countLiveSetupLinks", value: summary.liveSetupLinks },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("admin.operationsTitle")}
        intro={t("admin.operationsHint")}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("admin.countsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {counts.map((entry) => (
              <div key={entry.labelKey} className="grid gap-1">
                <dt className="text-xs text-muted-foreground">
                  {t(entry.labelKey)}
                </dt>
                <dd className="font-mono text-lg tabular-nums">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base">
            {t("admin.environmentTitle")}
          </CardTitle>
          <CardDescription>{t("admin.environmentHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">
              {t("admin.envNodeEnv")}
            </span>
            <Badge variant="outline">{environment.nodeEnv}</Badge>
            {environment.buildVersion ? (
              <>
                <span className="text-muted-foreground">
                  {t("admin.envBuildVersion")}
                </span>
                <Badge variant="outline">{environment.buildVersion}</Badge>
              </>
            ) : null}
          </div>
          {environment.baseUrl ? (
            <p className="font-mono text-xs text-muted-foreground">
              {environment.baseUrl}
            </p>
          ) : null}
          <ul className="grid gap-1">
            {environment.variables.map((variable) => (
              <li key={variable.name} className="flex items-center gap-2">
                <Badge variant={variable.present ? "secondary" : "destructive"}>
                  {variable.present ? t("admin.envSet") : t("admin.envMissing")}
                </Badge>
                <span className="font-mono text-xs">{variable.name}</span>
              </li>
            ))}
          </ul>
          <p>
            <Link
              href="/healthz"
              className="text-sm underline underline-offset-4"
            >
              {t("admin.openHealthz")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
