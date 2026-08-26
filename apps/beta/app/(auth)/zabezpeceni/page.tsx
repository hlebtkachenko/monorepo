import { redirect } from "next/navigation"

import { getBetaTranslations } from "@/i18n/translations-server"
import { viewerAccount } from "@/lib/data/account"

import { AuthCard } from "../_components/auth-card"

import { ForcedTotpEnrolment } from "./_components/forced-totp-enrolment"

/**
 * The forced-TOTP screen (spec §2.0.1: "owner: setup link → password → forced
 * TOTP → `/`"; §2.10: "2FA (forced for owner)").
 *
 * IT LIVES IN THE `(auth)` GROUP, and that is the enforcement, not decoration.
 * The `(portal)` layout and the /admin layout both call `requireTotpEnrolment()`,
 * which redirects here — so an office account that has not enrolled can reach
 * no page that renders a rail, a nav, an org switcher or a client's data. This
 * route is outside those layouts (otherwise complying with the mandate would
 * require having already complied with it) and the `(auth)` chrome draws
 * nothing but the logo, so there is no affordance on the page except finishing
 * or signing out.
 *
 * THE INVERSE REDIRECT MATTERS TOO. An account that does not need to enrol —
 * every client-side role, and any office account that already has — is sent to
 * `/`. Without it this URL would be a permanently-reachable second enrolment
 * screen, which is a confusing way to offer someone a way to replace a factor
 * they did not ask to replace.
 */
export default async function ZabezpeceniPage() {
  const { account, totpEnrolmentRequired } = await viewerAccount()
  if (!totpEnrolmentRequired) redirect("/")

  const t = await getBetaTranslations()

  return (
    <AuthCard
      title={t("auth.totpSetupTitle")}
      description={t("auth.totpSetupDescription")}
    >
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{account.email}</p>
        <ForcedTotpEnrolment />
      </div>
    </AuthCard>
  )
}
