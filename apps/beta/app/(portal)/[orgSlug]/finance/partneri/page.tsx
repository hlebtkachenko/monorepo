import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import { partnersForScope, saldokontoForScope } from "@/lib/data/partners"
import { formatAmount } from "@/lib/format/money"
import { PARTNER_ROLE_LABEL_KEY } from "@/lib/partner-labels"

import { PageHeader } from "../../../../_components/page-header"

import { resolveOrgScope } from "../../_lib/org-scope"

/**
 * Finance › Partneři (spec §2.4: "auto-fed from saldokonto + office edits +
 * ARES prefill: název, IČO/DIČ, role, saldo s námi").
 *
 * READ-ONLY, EVERY ROLE — the same §3.3 rule `pohledavky-a-zavazky/page.tsx`
 * follows: this is the registry as a client reads it, not the editing home
 * (that is Zadávání dat › Partneři, owner only).
 *
 * "SALDO S NÁMI" IS TWO COLUMNS, NOT A NET FIGURE. Netting a receivable
 * against a payable would be an arithmetic beta never does (§0.2); this
 * joins each partner (in memory, over rows the database already produced) to
 * its row in the SAME newest-published-batch read `pohledavky-a-zavazky`
 * uses, and a partner absent from that batch renders a dash rather than a
 * silently invented zero (§0.4).
 */
export default async function PartneriPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await resolveOrgScope(orgSlug)

  const [t, partners, saldokonto] = await Promise.all([
    getBetaTranslations(),
    partnersForScope(scope),
    saldokontoForScope(scope),
  ])

  const saldoByPartner = new Map(
    saldokonto.rows.map((row) => [row.partnerId, row]),
  )

  return (
    <div className="grid gap-4 p-6">
      <PageHeader
        title={t("finance.partneriTitle")}
        intro={t("finance.partneriIntro")}
      />

      {partners.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("finance.partneriEmpty")}
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("finance.columnPartner")}</TableHead>
              <TableHead>{t("finance.columnIco")}</TableHead>
              <TableHead>{t("finance.columnDic")}</TableHead>
              <TableHead>{t("finance.columnRole")}</TableHead>
              <TableHead className="text-right">
                {t("finance.columnReceivable")}
              </TableHead>
              <TableHead className="text-right">
                {t("finance.columnPayable")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((p) => {
              const saldo = saldoByPartner.get(p.id)
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/${orgSlug}/finance/partneri/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.source === "saldokonto" ? (
                      <Badge variant="outline" className="ml-2">
                        {t("finance.partnerSourceSaldokonto")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {p.ico ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {p.dic ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {t(PARTNER_ROLE_LABEL_KEY[p.role])}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {saldo ? (formatAmount(saldo.receivableTotal) ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {saldo ? (formatAmount(saldo.payableTotal) ?? "—") : "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
