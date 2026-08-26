import { Card, CardContent } from "@workspace/ui/components/card"

import { getBetaTranslations } from "@/i18n/translations-server"
import type { BetaMessageKey } from "@/i18n/messages"

/**
 * What a Výkazy tab renders when the office has published nothing for it —
 * spec §0.4's "empty beats stale", as a screen.
 *
 * IT SAYS WHAT HAPPENED AND WHAT HAPPENS NEXT, which is the entire point.
 * "Zatím nebylo nahráno" plus "objeví se po měsíční uzávěrce" tells the client
 * that the absence is a step in a process rather than a fault, so the honest
 * empty state does not read as a broken page. The alternative — falling back to
 * an older period, or rendering the form with zeroes — is the confidently-wrong
 * data this product's whole import design exists to prevent.
 *
 * The same component covers the ROLLBACK case: "Vrátit poslední import" can
 * leave a dataset with no published batch at all (`rollbackDataset`'s own
 * header says so), and this is what the client sees the moment it does.
 */
export async function NothingPublished({
  bodyKey,
}: {
  bodyKey: BetaMessageKey
}) {
  const t = await getBetaTranslations()

  return (
    <Card>
      <CardContent className="grid gap-1 py-10 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          {t("vykazy.emptyHeading")}
        </p>
        <p>{t(bodyKey)}</p>
      </CardContent>
    </Card>
  )
}
