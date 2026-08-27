import { EmailNotificationsToggle } from "@/app/_components/email-notifications-toggle"
import { getBetaTranslations } from "@/i18n/translations-server"
import { viewerAccount } from "@/lib/data/account"
import { emailNotificationsEnabled } from "@/lib/data/notification-prefs"

import { PageHeader, SectionTitle } from "../../../../_components/page-header"

import { resolveOrgScope } from "../../_lib/org-scope"
import { AccountProfileForm } from "../_components/account-profile-form"
import { PasswordForm } from "../_components/password-form"
import { TotpSection } from "../_components/totp-section"

/**
 * Nastavení › Účet (spec §2.10) — the viewer's OWN account.
 *
 * NOT ORG-SCOPED DATA, ON AN ORG-SCOPED ROUTE. Everything this page renders
 * belongs to the person, not to the book: the org slug in the URL only decides
 * which shell the page is drawn inside and which tab row is above it.
 * `resolveOrgScope` is still called — a URL naming an organization the viewer is
 * not in must 404 like every other route in this tree, not quietly render their
 * settings under a stranger's chrome.
 *
 * `viewerAccount()` re-resolves the session itself rather than accepting the
 * scope's `userId`, which is the same fail-closed habit `activeMembershipsForViewer`
 * documents.
 *
 * The locale row the spec also names is not a control: beta ships Czech only
 * (plan Part 3), so a picker with one option would be a placeholder. It is
 * stated as a fact instead, and becomes a control when a second locale exists.
 *
 * THE E-MAIL NOTIFICATION TOGGLE (§2.10 "e-mail notifikace toggle", §2.11) IS
 * MOUNTED HERE, which is the home PR 15 (#1034) named when it shipped the
 * control unmounted. Both halves are ACCOUNT-scoped, not org-scoped — the flag
 * is one column on `app_user` (migration 0012) — so the initial value is read
 * with the viewer's own id from `viewerAccount()`'s session, never with the
 * scope's, and the Server Action behind the switch re-proves the caller IS that
 * account with its own `requireBetaSession()`.
 */
export default async function UcetPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  await resolveOrgScope(orgSlug)

  const { viewer, account } = await viewerAccount()
  const [notificationsEnabled, t] = await Promise.all([
    emailNotificationsEnabled(viewer.userId),
    getBetaTranslations(),
  ])

  return (
    <div className="grid max-w-2xl gap-8">
      <PageHeader title={t("nastaveni.navUcet")} />

      <section className="grid gap-3">
        <SectionTitle>{t("nastaveni.accountTitle")}</SectionTitle>
        <AccountProfileForm name={account.name} email={account.email} />
      </section>

      <section className="grid gap-3">
        <h3 className="font-sans text-sm font-semibold text-foreground">
          {t("nastaveni.passwordTitle")}
        </h3>
        <PasswordForm />
      </section>

      <section className="grid gap-3">
        <h3 className="font-sans text-sm font-semibold text-foreground">
          {t("nastaveni.totpTitle")}
        </h3>
        <TotpSection
          enabled={account.totpEnabled}
          mandatory={account.totpMandatory}
        />
      </section>

      <section className="grid gap-3">
        <h3 className="font-sans text-sm font-semibold text-foreground">
          {t("nastaveni.notificationsTitle")}
        </h3>
        <EmailNotificationsToggle initialEnabled={notificationsEnabled} />
      </section>

      <section className="grid gap-1">
        <h3 className="font-sans text-sm font-semibold text-foreground">
          {t("nastaveni.localeTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("nastaveni.localeValue")}
        </p>
      </section>
    </div>
  )
}
