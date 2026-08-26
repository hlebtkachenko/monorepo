import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import { listSetupLinks } from "@/lib/data/office/setup-links"
import { requireOffice } from "@/lib/data/scope"

import { revokeSetupLinkAction } from "../_actions/setup-links"
import { AdminActionForm } from "../_components/admin-action-form"
import {
  LINK_STATUS_LABEL_KEY,
  PURPOSE_LABEL_KEY,
  ROLE_LABEL_KEY,
} from "../_components/labels"

/**
 * Setup-linky — the registry of one-time links (spec §3.5).
 *
 * IT CANNOT SHOW A LINK, and that is the design rather than a gap. The table
 * stores `sha256(secret)`; the secret existed once, in the response to the
 * action that minted it, and there is no query and no column that could bring
 * it back. A lost link is re-issued — which also invalidates the lost one the
 * moment the new one is consumed (the sibling sweep in `setup-token.ts`).
 *
 * What the registry is FOR is the other half of the office's question: what is
 * still outstanding, to whom, into which book, as what role — and the button to
 * kill it. Revocation is also what the SF-6 triggers do automatically when
 * someone is offboarded (migration 0002); this page is the manual path for an
 * invite sent to the wrong address.
 */
export default async function AdminSetupLinksPage() {
  const office = await requireOffice()
  const [t, links] = await Promise.all([
    getBetaTranslations(),
    listSetupLinks(office),
  ])

  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        <h1 className="font-heading text-xl font-semibold">
          {t("admin.setupLinksTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.setupLinksHint")}
        </p>
      </header>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.noRows")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.columnEmail")}</TableHead>
              <TableHead>{t("admin.columnPurpose")}</TableHead>
              <TableHead>{t("admin.columnOrganization")}</TableHead>
              <TableHead>{t("admin.columnRole")}</TableHead>
              <TableHead>{t("admin.columnState")}</TableHead>
              <TableHead>{t("admin.columnExpires")}</TableHead>
              <TableHead>{t("admin.columnIssuedBy")}</TableHead>
              <TableHead>{t("admin.columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="text-sm">{link.email}</TableCell>
                <TableCell>{t(PURPOSE_LABEL_KEY[link.purpose])}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {link.organizationName ?? "—"}
                </TableCell>
                <TableCell>
                  {link.role ? t(ROLE_LABEL_KEY[link.role]) : "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={link.status === "live" ? "secondary" : "outline"}
                  >
                    {t(LINK_STATUS_LABEL_KEY[link.status])}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground tabular-nums">
                  {new Date(link.expiresAt).toLocaleString("cs-CZ")}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {link.issuedByEmail ?? "—"}
                </TableCell>
                <TableCell>
                  {link.status === "live" ? (
                    <AdminActionForm
                      action={revokeSetupLinkAction}
                      submitLabel={t("admin.revokeLink")}
                      submitVariant="outline"
                      layout="row"
                    >
                      <input type="hidden" name="tokenId" value={link.id} />
                    </AdminActionForm>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
