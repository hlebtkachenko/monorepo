import { getBetaTranslations } from "@/i18n/translations-server"

import { AccountsSection } from "./_components/accounts-section"
import { FilingsSection } from "./_components/filings-section"
import { IndicatorsSection } from "./_components/indicators-section"
import { LiabilitiesSection } from "./_components/liabilities-section"
import { PartnersSection } from "./_components/partners-section"
import { loadZadavani } from "./_lib/load-zadavani"

/**
 * Pro účetní › Zadávání dat (spec §3.3) — "the ONLY editing home for
 * non-document data".
 *
 * THREE OF THE NINE THINGS §3.3 LISTS. Filings and manual liabilities landed
 * with PR 18 because they are what Finance › Dluhy a platby reads;
 * `account_balance_map` lands with PR 27 for the same reason, as the feeder of
 * Finance › Účty a hotovost. `client_task` is named in the same §3.3 list but
 * does NOT land here: spec §3 gives it its own sidebar entry — Úkoly klientovi
 * — because §3.4 grows it well past a single deep-link edit form (CRUD,
 * templates, "Vytvořit měsíční sadu úkolů"), so PR 19 ships
 * `pro-ucetni/ukoly/` instead. `indicator` landed with W6 as the Ukazatele
 * section below — obrat is displayed on Přehled, is neither imported nor
 * derived (§0.2), and belongs to no module, which is exactly what §3.3 is for.
 * loan, asset and payroll_summary are edited in their own modules instead,
 * following the precedent that a PR ships its own domain's writes end to end.
 * Nothing is stubbed for any of them (§0.3).
 *
 * NO GATE IN THIS FILE, and that is not an omission: `loadZadavani` opens with
 * `requireOwner`, so the 404 happens before anything is read — and it is the
 * function a test can call, unlike this component. `pro-ucetni/layout.tsx` gates
 * the whole section on top of that, and every action under `_actions/` gates
 * itself again, because a Server Action runs neither of them.
 */
export default async function ZadavaniPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug: requested } = await params
  const [t, { orgSlug, filings, liabilities, accounts, partners, indicators }] =
    await Promise.all([getBetaTranslations(), loadZadavani(requested)])

  return (
    <div className="grid gap-8 p-6">
      <header className="grid gap-1">
        <h1 className="font-heading text-xl font-semibold">
          {t("zadavani.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("zadavani.intro")}</p>
      </header>

      <FilingsSection filings={filings} orgSlug={orgSlug} />
      <LiabilitiesSection liabilities={liabilities} orgSlug={orgSlug} />
      <AccountsSection mappings={accounts} orgSlug={orgSlug} />
      <PartnersSection partners={partners} orgSlug={orgSlug} />
      <IndicatorsSection indicators={indicators} orgSlug={orgSlug} />
    </div>
  )
}
