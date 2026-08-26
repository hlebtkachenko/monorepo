"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { useBetaTranslations } from "@/i18n/translations"

/**
 * The first-month state (spec §2.1, Advisor F18).
 *
 * §2.1 writes it out: "before any import — karta + tasks + termíny + dokumenty
 * render; one card: 'Finanční přehledy se objeví po první měsíční uzávěrce.' No
 * empty charts."
 *
 * ONE CARD, IN PLACE OF THE NUMBERS — not a banner above them, and not a
 * spinner. A brand-new book has nothing to put in a KPI tile and nothing to put
 * in a presence grid except six rows of "zatím nenahráno", and six rows saying
 * nothing is the dead-tile composition F18 exists to prevent. `page.tsx`
 * swaps the two sections for this card; the four surfaces that DO have something
 * to say on day one keep saying it.
 *
 * IT NAMES THE NEXT EVENT, which is the difference between an empty state and
 * an explanation: the numbers arrive when the office closes the first month, so
 * the client knows what they are waiting for and that nothing is broken.
 */
export function FirstMonthNotice() {
  const t = useBetaTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">
          {t("prehled.firstMonthTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t("prehled.firstMonthBody")}
        </p>
      </CardContent>
    </Card>
  )
}
