import { getBetaTranslations } from "@/i18n/translations-server"

import { FilingsSection } from "./_components/filings-section"
import { LiabilitiesSection } from "./_components/liabilities-section"
import { loadZadavani } from "./_lib/load-zadavani"

/**
 * Pro účetní › Zadávání dat (spec §3.3) — "the ONLY editing home for
 * non-document data".
 *
 * TWO OF THE NINE THINGS §3.3 LISTS. Filings and manual liabilities land here
 * with PR 18 because they are what Finance › Dluhy a platby reads. `client_task`
 * is named in the same §3.3 list but does NOT land here: spec §3 gives it its
 * own sidebar entry — Úkoly klientovi — because §3.4 grows it well past a
 * single deep-link edit form (CRUD, templates, "Vytvořit měsíční sadu úkolů"),
 * so PR 19 ships `pro-ucetni/ukoly/` instead. indicator, loan, asset,
 * payroll_summary, partner and account_balance_map still arrive here, each
 * with the module that reads them, as its own section on this page. Nothing
 * is stubbed for them (§0.3).
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
  const [t, { orgSlug, filings, liabilities }] = await Promise.all([
    getBetaTranslations(),
    loadZadavani(requested),
  ])

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
    </div>
  )
}
