import { notFound } from "next/navigation"
import Link from "next/link"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { listPayrollSupportingDocuments } from "@/lib/data/documents"
import { payrollScope } from "@/lib/data/payroll"

import { resolveOrgScope } from "../../_lib/org-scope"

import { PodkladyDocumentsTable } from "../_components/podklady-documents-table"

/**
 * Podklady (spec §2.6): "docházka upload (monthly template task), nástup
 * (osobní dotazník; ZP 8-day note), ukončení, nemocenská flag."
 *
 * A CHECKLIST, PLUS THE DOCUMENTS THAT ALREADY BACK IT. Every item spec §2.6
 * names is a process reminder about payroll paperwork, not a typed record this
 * database holds a column for — there is no `nemocenska` flag anywhere in the
 * schema, and the "monthly template task" is `client_task.is_template`, a
 * Pro účetní concern (§3.4), not a client-facing toggle. So this page states
 * the four reminders as plain Czech copy and backs them with what the office
 * HAS recorded: the `attendance` + `hr` documents already reachable through
 * `listPayrollSupportingDocuments` (this PR's own narrowing of
 * `listCompanyDocuments`'s pattern). A client who wants the full Dokumenty
 * workflow — the row sheet, the sandboxed preview, uploading a new one — is
 * one link away rather than getting a second, thinner copy of it here.
 *
 * ONE PAGE, NO PAGER. `listPayrollSupportingDocuments`'s default page size
 * (25) already covers a small s.r.o.'s attendance/HR paperwork; spec's own
 * depth map does not name Podklady at all, which is this page's evidence that
 * a filter bar and a pager would be over-building it.
 *
 * `listPayrollSupportingDocuments` carries no payroll-specific role check of
 * its own — `attendance`/`hr` documents are ordinary `document` rows, visible
 * to every role elsewhere (Dokumenty). `payrollScope` is what makes THIS page
 * management-only, checked explicitly rather than assumed from
 * `mzdy/layout.tsx` (see that file's own page-level comment for why).
 */
export default async function PodkladyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  if (payrollScope(scope).kind !== "all") notFound()

  const [t, page] = await Promise.all([
    getBetaTranslations(),
    listPayrollSupportingDocuments(scope),
  ])

  const checklist = [
    {
      titleKey: "mzdy.podkladyDochazkaTitle",
      bodyKey: "mzdy.podkladyDochazkaBody",
    },
    {
      titleKey: "mzdy.podkladyNastupTitle",
      bodyKey: "mzdy.podkladyNastupBody",
    },
    {
      titleKey: "mzdy.podkladyUkonceniTitle",
      bodyKey: "mzdy.podkladyUkonceniBody",
    },
    {
      titleKey: "mzdy.podkladyNemocenskaTitle",
      bodyKey: "mzdy.podkladyNemocenskaBody",
    },
  ] as const

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-heading text-xl font-semibold">
          {t("mzdy.podkladyTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("mzdy.podkladyIntro")}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {checklist.map((item) => (
          <Card key={item.titleKey}>
            <CardHeader>
              <CardTitle className="font-heading text-sm">
                {t(item.titleKey)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t(item.bodyKey)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            {t("mzdy.podkladyDocumentsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <PodkladyDocumentsTable
            orgSlug={orgSlug}
            documents={page.documents}
          />
          <Link
            href={`/${orgSlug}/dokumenty`}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("mzdy.podkladyViewInDokumenty")}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
