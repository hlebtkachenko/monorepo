import { getBetaTranslations } from "@/i18n/translations-server"
import { peekSetupToken } from "@/lib/auth/setup-token"

import { consumeResetAction } from "../../_actions/consume"
import { AuthCard } from "../../_components/auth-card"
import { ConsumeForm } from "../../_components/consume-form"
import { InvalidLink } from "../../_components/invalid-link"

/**
 * Password reset. Same GET-reads / POST-consumes split as `/setup/[token]`.
 *
 * Reset links are office-issued only (the `user_setup_token_issuer_guard`
 * trigger refuses a `password_reset` row from a non-staff issuer), and
 * consuming one drops every existing session of that account.
 */
export default async function ResetPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const view = await peekSetupToken(token)

  if (!view || view.purpose !== "password_reset") return <InvalidLink />

  const t = await getBetaTranslations()
  return (
    <AuthCard
      title={t("auth.resetTitle")}
      description={t("auth.resetSubtitle")}
    >
      <ConsumeForm
        token={token}
        email={view.email}
        organizationName={null}
        submitLabel={t("auth.resetSubmit")}
        askName={false}
        askPassword
        action={consumeResetAction}
      />
    </AuthCard>
  )
}
