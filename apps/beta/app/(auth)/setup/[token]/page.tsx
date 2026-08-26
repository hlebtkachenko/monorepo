import { getBetaTranslations } from "@/i18n/translations-server"
import { getBetaSession } from "@/lib/auth/session"
import { peekSetupToken } from "@/lib/auth/setup-token"

import { consumeSetupAction } from "../../_actions/consume"
import { AuthCard } from "../../_components/auth-card"
import { ConsumeForm } from "../../_components/consume-form"
import { InvalidLink } from "../../_components/invalid-link"

/**
 * Account setup and organization invites.
 *
 * A GET only READS the token — it renders the form and changes nothing. Mail
 * clients, link scanners and browser prefetch all issue GETs; a link that
 * consumed itself on sight would be spent before its owner ever saw it. The
 * consume is the POST behind the form.
 */
export default async function SetupPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const view = await peekSetupToken(token)

  if (!view || view.purpose === "password_reset") return <InvalidLink />

  const t = await getBetaTranslations()
  const session = await getBetaSession()
  // The invited address is already signed in: the link only adds a membership,
  // so there is no password to set.
  const acceptOnly =
    view.purpose === "org_invite" && session?.email === view.email

  return (
    <AuthCard
      title={
        view.purpose === "org_invite"
          ? t("auth.inviteTitle")
          : t("auth.setupTitle")
      }
      description={
        view.purpose === "org_invite"
          ? t("auth.inviteSubtitle")
          : t("auth.setupSubtitle")
      }
    >
      <ConsumeForm
        token={token}
        email={view.email}
        organizationName={view.organizationName}
        submitLabel={
          acceptOnly ? t("auth.inviteAccept") : t("auth.setupSubmit")
        }
        askName={!acceptOnly}
        askPassword={!acceptOnly}
        action={consumeSetupAction}
      />
    </AuthCard>
  )
}
