"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import type { OrganizationCard } from "@/lib/data/projections"
import { formatBetaAddress, formatBetaBankAccount } from "@/lib/format/identity"

/**
 * "Karta společnosti" (spec §2.1 item 5): "název, IČO, DIČ / 'Neplátce DPH'
 * badge, sídlo, účet, datová schránka, spisová značka".
 *
 * THE DIČ SLOT IS A DISJUNCTION, not a field that is sometimes empty — which is
 * why §2.1 writes it with a slash. A plátce has a DIČ and it is the number
 * counterparties ask for; a neplátce has no DIČ at all, and an empty "DIČ —"
 * row invites the reader to think one is missing rather than that none exists.
 * So the regime decides which of the two the slot shows.
 *
 * EVERY OTHER FIELD IS OPTIONAL AND SAYS SO. A book created this morning has a
 * name and nothing else; §0.4's "empty beats stale" makes "Neuvedeno" the right
 * answer rather than a blank cell, which reads as a rendering fault.
 *
 * NO LINK TO NASTAVENÍ › SPOLEČNOST. §2.10 puts editing there and that route
 * does not exist yet (PR 21 builds it). A card linking to a 404 is worse than a
 * card that does not link — the link goes in with the route, in the PR that
 * creates it.
 *
 * READ-ONLY, like every client page (§3.3). No form, no button, no input.
 */

function Field({
  labelKey,
  value,
}: {
  labelKey: BetaMessageKey
  value: string | null
}) {
  const t = useBetaTranslations()

  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{t(labelKey)}</dt>
      <dd className="text-sm">
        {value ?? (
          <span className="text-muted-foreground">
            {t("prehled.kartaMissing")}
          </span>
        )}
      </dd>
    </div>
  )
}

export function CompanyCard({ org }: { org: OrganizationCard }) {
  const t = useBetaTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          {t("prehled.kartaTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-heading text-xl">{org.legalName}</span>
          <Badge variant={org.vatRegime === "platce" ? "secondary" : "outline"}>
            {org.vatRegime === "platce"
              ? t("org.vatPlatce")
              : t("org.vatNeplatce")}
          </Badge>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <Field labelKey="prehled.kartaIco" value={org.ico} />
          {org.vatRegime === "platce" ? (
            <Field labelKey="prehled.kartaDic" value={org.dic} />
          ) : null}
          <Field
            labelKey="prehled.kartaAddress"
            value={formatBetaAddress(org)}
          />
          <Field
            labelKey="prehled.kartaBankAccount"
            value={formatBetaBankAccount(org)}
          />
          <Field labelKey="prehled.kartaDataBox" value={org.dataBoxId} />
          <Field
            labelKey="prehled.kartaCourtFile"
            value={org.courtFileNumber}
          />
        </dl>
      </CardContent>
    </Card>
  )
}
