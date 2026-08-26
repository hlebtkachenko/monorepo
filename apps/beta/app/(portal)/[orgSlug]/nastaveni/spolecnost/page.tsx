import { notFound } from "next/navigation"

import { getBetaTranslations } from "@/i18n/translations-server"
import { formatBetaDateTime } from "@/lib/format/date"
import { formatBetaAddress, formatBetaBankAccount } from "@/lib/format/identity"
import { organizationIdentity } from "@/lib/data/organization-identity"
import { financniUradName } from "@/lib/tax-office"

import { SectionTitle } from "../../../../_components/page-header"

import { resolveOrgScope } from "../../_lib/org-scope"
import { AresPanel } from "../_components/ares-panel"
import { CompanyForm } from "../_components/company-form"

/**
 * Nastavení › Společnost (spec §2.10).
 *
 * EVERY ROLE SEES THE CARD; ONLY THE OWNER SEES THE CONTROLS. That is the
 * spec's "owner edit; others view", and it is enforced in two independent
 * places: this page renders the form and the ARES panel only for an owner, and
 * every action behind them re-checks with `requireOwner(await
 * requireScope(...))` — a Server Action is a public POST endpoint that never
 * runs this page.
 *
 * The read view is deliberately NOT a disabled copy of the form. A greyed-out
 * input row invites "why can't I edit this?"; a plain definition list says what
 * the company is, which is what a non-owner came for.
 */
export default async function SpolecnostPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)
  const identity = await organizationIdentity(scope)
  if (!identity) notFound()

  const t = await getBetaTranslations()
  const isOwner = scope.role === "owner"

  // Sídlo and účet are joined by the SHARED formatters (PR 20's
  // `lib/format/identity.ts`), not here. Its own header says why: the columns
  // are decomposed so ARES can be accepted field by field, and a second
  // rendering in this component would give Karta společnosti and this page two
  // different spellings of the same row.
  const address = formatBetaAddress(identity)
  const bankAccount = formatBetaBankAccount(identity)

  const taxOffice =
    identity.taxOfficeCode === null
      ? null
      : // A code the číselník does not know is printed as-is rather than
        // resolved to a plausible-looking office — see `financniUradName`.
        (financniUradName(identity.taxOfficeCode) ?? identity.taxOfficeCode)

  const rows: readonly (readonly [string, string | null])[] = [
    [t("nastaveni.fieldLegalName"), identity.legalName],
    [t("nastaveni.fieldIco"), identity.ico],
    [t("nastaveni.fieldDic"), identity.dic],
    [
      t("nastaveni.fieldVatRegime"),
      identity.vatRegime === "platce"
        ? t("nastaveni.vatPayer")
        : t("nastaveni.vatNonPayer"),
    ],
    [t("nastaveni.fieldAddress"), address],
    [t("nastaveni.fieldCourtFileNumber"), identity.courtFileNumber],
    [t("nastaveni.fieldTaxOffice"), taxOffice],
    [t("nastaveni.fieldDataBoxId"), identity.dataBoxId],
    [t("nastaveni.fieldBankAccount"), bankAccount],
    [t("nastaveni.fieldIban"), identity.iban],
    [t("nastaveni.fieldContactEmail"), identity.contactEmail],
    [t("nastaveni.fieldContactPhone"), identity.contactPhone],
    [t("nastaveni.fieldSlug"), identity.slug],
  ]

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <SectionTitle>{t("nastaveni.companyTitle")}</SectionTitle>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm text-foreground">
                {/* Spec §0.4, "empty beats stale", at field granularity: an
                    unknown value renders as unknown, never as a blank cell the
                    reader might take for a zero or an intentional emptiness. */}
                {value ?? (
                  <span className="text-muted-foreground">
                    {t("nastaveni.notFilled")}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {t("nastaveni.vatRegimeNote")}
        </p>
      </section>

      {isOwner ? (
        <>
          <AresPanel
            orgSlug={orgSlug}
            defaultIco={identity.ico}
            aresFetchedAt={
              identity.aresFetchedAt === null
                ? null
                : formatBetaDateTime(identity.aresFetchedAt)
            }
          />
          <section className="grid gap-3">
            <h3 className="font-sans text-sm font-semibold text-foreground">
              {t("nastaveni.editTitle")}
            </h3>
            <CompanyForm orgSlug={orgSlug} identity={identity} />
          </section>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("nastaveni.companyReadOnly")}
        </p>
      )}
    </div>
  )
}
