import Link from "next/link"
import { notFound } from "next/navigation"

import { ArrowLeft } from "@workspace/ui/lib/icons"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { formatAmount, formatDate, formatDateTime } from "@/i18n/format-values"
import { getBetaTranslations } from "@/i18n/translations-server"
import { documentsForPartner } from "@/lib/data/documents"
import { partnerForScope, partnerSaldoHistory } from "@/lib/data/partners"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"
import {
  PARTNER_AGING_LABEL_KEY,
  PARTNER_ROLE_LABEL_KEY,
} from "@/lib/partner-labels"

import { resolveOrgScope } from "../../../_lib/org-scope"

/**
 * Finance › Partneři detail (spec §2.4: "identity + address + linked
 * documents + saldi + client-visible note (internal note office-only)").
 *
 * READ-ONLY (§3.3) — the "Upravit" link (owner only) goes to Zadávání dat,
 * the only editing home; this page has no form of its own.
 *
 * `noteInternal` REACHES THIS PAGE ONLY WHEN `scope.role === "owner"`:
 * `partnerForScope` withholds the key entirely for every other role (see its
 * own header), so nothing here can pass it into a rendered element for a
 * client to receive.
 */
function formatPartnerAddress(partner: {
  street: string | null
  houseNumber: string | null
  orientationNumber: string | null
  city: string | null
  postalCode: string | null
}): string | null {
  const houseNumber = [partner.houseNumber, partner.orientationNumber]
    .filter((part): part is string => Boolean(part))
    .join("/")
  const street = [partner.street, houseNumber]
    .filter((part): part is string => Boolean(part))
    .join(" ")
  const city = [partner.postalCode, partner.city]
    .filter((part): part is string => Boolean(part))
    .join(" ")
  const line = [street, city].filter((part) => part.length > 0).join(", ")
  return line.length > 0 ? line : null
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; partnerId: string }>
}) {
  const { orgSlug, partnerId } = await params
  const scope = await resolveOrgScope(orgSlug)

  const [t, partner, history, documents] = await Promise.all([
    getBetaTranslations(),
    partnerForScope(scope, partnerId),
    partnerSaldoHistory(scope, partnerId),
    documentsForPartner(scope, partnerId),
  ])

  if (!partner) notFound()

  const address = formatPartnerAddress(partner)

  return (
    <div className="grid gap-6 p-6">
      <div>
        <Link
          href={`/${orgSlug}/finance/partneri`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("finance.partneriBackToList")}
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="font-heading text-xl">
              {partner.name}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">
                {t(PARTNER_ROLE_LABEL_KEY[partner.role])}
              </Badge>
              {partner.source === "saldokonto" ? (
                <Badge variant="secondary">
                  {t("finance.partnerSourceSaldokonto")}
                </Badge>
              ) : null}
            </div>
          </div>
          {scope.role === "owner" ? (
            <Link
              href={`/${orgSlug}/pro-ucetni/zadavani`}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {t("finance.partneriEdit")}
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {t("finance.columnIco")}
            </span>
            <span className="tabular-nums">{partner.ico ?? "—"}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {t("finance.columnDic")}
            </span>
            <span className="tabular-nums">{partner.dic ?? "—"}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {t("finance.partneriEmail")}
            </span>
            <span>{partner.email ?? "—"}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">
              {t("finance.partneriPhone")}
            </span>
            <span>{partner.phone ?? "—"}</span>
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">
              {t("finance.partneriAddress")}
            </span>
            <span>{address ?? "—"}</span>
          </div>
          {partner.aresFetchedAt ? (
            <div className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">
                {t("finance.partneriAresStamp")}{" "}
                {formatDateTime(partner.aresFetchedAt)}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {partner.noteClient ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              {t("finance.partneriNoteClient")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {partner.noteClient}
          </CardContent>
        </Card>
      ) : null}

      {partner.noteInternal ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">
              {t("finance.partneriNoteInternal")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {partner.noteInternal}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-heading text-base font-semibold">
          {t("finance.partneriSaldoHistory")}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("finance.partneriSaldoHistoryEmpty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance.columnPeriod")}</TableHead>
                <TableHead className="text-right">
                  {t("finance.columnReceivable")}
                </TableHead>
                <TableHead className="text-right">
                  {t("finance.columnPayable")}
                </TableHead>
                <TableHead>{t("finance.columnOldestDue")}</TableHead>
                <TableHead>{t("finance.columnAging")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map(({ period, saldo }) => (
                <TableRow key={saldo.id}>
                  <TableCell>{formatReportingPeriodLabel(period)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(saldo.receivableTotal) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(saldo.payableTotal) ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(saldo.oldestDue) ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {t(PARTNER_AGING_LABEL_KEY[saldo.aging])}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-heading text-base font-semibold">
          {t("finance.partneriLinkedDocuments")}
        </h2>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("finance.partneriLinkedDocumentsEmpty")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance.partneriColumnFile")}</TableHead>
                <TableHead>{t("finance.partneriColumnUploaded")}</TableHead>
                <TableHead className="text-right">
                  {t("finance.partneriColumnAmount")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="max-w-64 truncate font-medium">
                    {doc.filename}
                  </TableCell>
                  <TableCell>{formatDate(doc.documentDate) ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(doc.amount) ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}
