import Link from "next/link"
import { redirect } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"

import { getBetaTranslations } from "@/i18n/translations-server"
import { rootRoutingDecision } from "@/lib/auth/root-routing"
import { activeMembershipsForViewer } from "@/lib/data/memberships"

import { SignOutButton } from "../_components/sign-out-button"

/**
 * Portal root (spec §2.0). Every branch here reads a REAL query
 * (`activeMembershipsForViewer`, `lib/data/memberships.ts`) — no branch is a
 * placeholder, including the ones with the least content.
 *
 * The branching itself is `rootRoutingDecision` (`lib/auth/root-routing.ts`),
 * a pure function unit-tested on its own; this page's only job is to fetch
 * the two facts that function needs and render (or redirect for) the
 * decision it returns.
 *
 * No `BetaShell` here — see the note on `app/(portal)/layout.tsx`. There is
 * no organization yet to point a rail at, so this renders its own minimal,
 * centered chrome, the same treatment the landing page used before PR 09.
 */
export default async function PortalHomePage() {
  const t = await getBetaTranslations()
  const { viewer, memberships, isStaff } = await activeMembershipsForViewer()

  const decision = rootRoutingDecision({
    membershipCount: memberships.length,
    firstSlug: memberships[0]?.slug,
    isStaff,
  })

  if (decision.kind === "redirect") {
    redirect(`/${decision.slug}`)
  }

  if (decision.kind === "picker") {
    return (
      <div className="min-h-svh bg-canvas p-6">
        <div className="mx-auto max-w-2xl">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                {t("org.pickerHeading")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("org.pickerIntro")}
              </p>
            </div>
            <SignOutButton />
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            {memberships.map((membership) => (
              <Card key={membership.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {membership.legalName}
                  </CardTitle>
                  <CardDescription>
                    {membership.vatRegime === "platce"
                      ? t("org.vatPlatce")
                      : t("org.vatNeplatce")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm">
                    <Link href={`/${membership.slug}`}>
                      {t("org.pickerOpen")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // decision.kind === "empty"
  return (
    <div className="flex min-h-svh items-center justify-center bg-canvas p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {decision.staffLink
            ? t("org.emptyStaffHeading")
            : t("org.emptyHeading")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {decision.staffLink ? t("org.emptyStaffBody") : t("org.emptyBody")}
        </p>
        <p className="text-sm font-medium">{viewer.email}</p>
        <div className="flex items-center justify-center gap-2">
          {decision.staffLink && (
            <Button asChild variant="outline">
              <Link href="/admin">{t("org.emptyAdminLink")}</Link>
            </Button>
          )}
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
