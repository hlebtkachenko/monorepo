import Link from "next/link"

import { Card, CardContent } from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import { EMPLOYEE_SEAT_HOME } from "@/lib/auth/first-login"
import { listDocuments } from "@/lib/data/documents"
import type { OrgScope } from "@/lib/data/scope"

import { RecentDocuments } from "./recent-documents"

/**
 * Přehled for the EMPLOYEE SEAT (spec §2.6.1: "Přehled (personal: own tasks,
 * own payslip link, no company financials)").
 *
 * A SEPARATE COMPONENT, AND `loadPrehled` IS NEVER CALLED FOR THIS VIEWER. That
 * is the whole security shape of this file. The company Přehled reads
 * obligations, assets, dataset freshness, deadlines, the payroll summary and the
 * identity card in one `Promise.all`; narrowing it with conditionals would leave
 * six reads whose safety depends on a flag being threaded correctly into each.
 * Branching one level up — in `page.tsx`, before the loader — means the seat's
 * request never issues those queries at all, so there is no flag to get wrong
 * and nothing to leak if a future card forgets one.
 *
 * WHAT IT RENDERS: a route into Moje mzda, and the documents THIS PERSON
 * uploaded. `listDocuments` is the same call the company page makes, and it is
 * narrowed by filter 5 of `visibleDocuments` (`uploaded_by_user_id`) rather than
 * by anything here — the data layer is narrow for every caller, and this
 * component is not trusted to ask correctly.
 *
 * "OWN TASKS" IS DELIBERATELY ABSENT, and it is a literal departure from
 * §2.6.1's sentence. `client_task` (migration 0009) is a task from the ACCOUNTING
 * OFFICE to the CLIENT COMPANY — "doplňte dodavatelskou fakturu za březen". It
 * has no user column and no employee column, so there is no such thing as an
 * employee's own task in this schema; rendering the company's task list here
 * would show a bricklayer what their employer's accountant is chasing the
 * company for, which is the opposite of "no company financials". The honest
 * options were "nothing" or "invent a per-user task model", and inventing one is
 * out of this PR's scope. It was routed to PR 38 as an open question rather than
 * quietly satisfied with the wrong rows.
 *
 * PR 38 ANSWERED IT: "nothing", and moved the answer OUT of this component.
 * `openClientTasksForScope` (`lib/data/client-tasks.ts`) now returns `[]` for a
 * seat by itself. Until then the seat saw no tasks only because `page.tsx`
 * branches here before it reaches `loadPrehled` — one `if` in a module the data
 * layer knows nothing about, which any second caller would have walked past. A
 * per-user task model remains un-invented, and is still the only thing that
 * could make this section exist.
 */
export async function SeatPrehled({
  scope,
  orgSlug,
}: {
  scope: OrgScope
  orgSlug: string
}) {
  const [t, page] = await Promise.all([
    getBetaTranslations(),
    listDocuments(scope),
  ])

  return (
    <div className="grid gap-6 p-6">
      <div className="grid gap-1">
        <h1 className="font-heading text-xl font-semibold">
          {t("prehled.seatTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("prehled.seatIntro")}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-4 py-4 text-sm">
          <Link
            href={`/${orgSlug}${EMPLOYEE_SEAT_HOME}`}
            className="font-medium underline underline-offset-4"
          >
            {t("prehled.seatMzdaCta")}
          </Link>
          <Link
            href={`/${orgSlug}/dokumenty`}
            className="font-medium underline underline-offset-4"
          >
            {t("prehled.seatDokumentyCta")}
          </Link>
        </CardContent>
      </Card>

      <RecentDocuments
        orgSlug={orgSlug}
        documents={page.documents.slice(0, 5)}
      />
    </div>
  )
}
