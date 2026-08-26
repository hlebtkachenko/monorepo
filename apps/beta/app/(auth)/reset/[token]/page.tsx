import { getBetaTranslations } from "@/i18n/translations-server"

import { consumeResetAction } from "../../_actions/consume"
import { AuthCard } from "../../_components/auth-card"
import { ConsumeForm } from "../../_components/consume-form"
import { InvalidLink } from "../../_components/invalid-link"
import { TooManyRequests } from "../../_components/too-many-requests"
import { peekSetupLink } from "../../_lib/peek-setup-link"

/**
 * Password reset. Same GET-reads / POST-consumes split as `/setup/[token]`, and
 * the same rate-limited peek.
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
  const peek = await peekSetupLink(token)

  if (peek.status === "rate_limited") return <TooManyRequests />
  if (peek.status === "invalid" || peek.view.purpose !== "password_reset") {
    return <InvalidLink />
  }

  const t = await getBetaTranslations()
  return (
    <AuthCard
      title={t("auth.resetTitle")}
      description={t("auth.resetSubtitle")}
    >
      <ConsumeForm
        token={token}
        email={peek.view.email}
        organizationName={null}
        submitLabel={t("auth.resetSubmit")}
        askName={false}
        askPassword
        action={consumeResetAction}
      />
    </AuthCard>
  )
}
