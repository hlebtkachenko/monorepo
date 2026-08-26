import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import { getBetaTranslations } from "@/i18n/translations-server"
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_TYPE_VALUES,
  hasActiveFilters,
  type DocumentListFilters,
} from "@/lib/data/document-filters"

import { DOCUMENT_STATUS_LABEL_KEY, DOCUMENT_TYPE_LABEL_KEY } from "./labels"

/**
 * The Dokumenty filter bar (spec §2.2: "Filters status/typ/období/stavba; ilike
 * search").
 *
 * A PLAIN `<form method="get">`, AND THEREFORE A SERVER COMPONENT. The filter
 * state lives in the URL and nowhere else, so there is no state to synchronise,
 * no `useRouter`, no client bundle for this bar at all — submitting the form IS
 * the navigation, and the resulting URL is a link the client can send to their
 * accountant ("tyhle doklady myslím"). It also degrades to working HTML if a
 * script ever fails to load on a phone on a construction site, which is the
 * environment this product is built for (spec §2.2 on the upload path).
 *
 * NO `page` FIELD, deliberately: a GET form submits only its own fields, so
 * changing a filter drops the page number and lands on page 1. Keeping page 7
 * while narrowing to four results is the classic empty-table-for-no-reason bug.
 *
 * `type="date"` rather than a custom picker: a cs-CZ browser renders it as
 * DD.MM.YYYY with the week starting on Monday, and submits `YYYY-MM-DD` — which
 * is exactly what `parseDocumentListQuery` accepts. The format rules of plan
 * Part 3 are satisfied by the platform rather than by a component we maintain.
 *
 * `basePath` AND `showTypeFilter` (PR 13). "Doklady firmy" reuses this exact
 * form rather than writing its own: same fields, same GET-and-URL idiom, just
 * posting back to `/dokumenty/firma` instead of `/dokumenty` and with the type
 * dropdown removed, because that page's `doc_type` is FIXED to
 * `COMPANY_DOCUMENT_TYPES` (`lib/data/document-filters.ts`) — a dropdown that
 * could only ever narrow further within two values, one of which ("Ostatní")
 * is already the widest bucket, would be a control with nothing useful to do.
 */
export async function DocumentsFilters({
  orgSlug,
  filters,
  sites,
  basePath,
  showTypeFilter = true,
}: {
  orgSlug: string
  filters: DocumentListFilters
  /** The `stavba` values that actually occur on this book. */
  sites: string[]
  /** Defaults to Vše's own route; "Doklady firmy" passes its own. */
  basePath?: string
  showTypeFilter?: boolean
}) {
  const t = await getBetaTranslations()
  const path = basePath ?? `/${orgSlug}/dokumenty`

  return (
    <form
      method="get"
      action={path}
      className="grid gap-3 rounded-lg border border-border p-4"
      aria-label={t("dokumenty.filtersTitle")}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="documents-filter-status">
            {t("dokumenty.filterStatus")}
          </Label>
          <NativeSelect
            id="documents-filter-status"
            name="status"
            defaultValue={filters.status ?? ""}
            className="w-full"
          >
            <NativeSelectOption value="">
              {t("dokumenty.filterAny")}
            </NativeSelectOption>
            {DOCUMENT_STATUS_VALUES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {t(DOCUMENT_STATUS_LABEL_KEY[value])}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {showTypeFilter ? (
          <div className="grid gap-1.5">
            <Label htmlFor="documents-filter-type">
              {t("dokumenty.filterType")}
            </Label>
            <NativeSelect
              id="documents-filter-type"
              name="type"
              defaultValue={filters.docType ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">
                {t("dokumenty.filterAny")}
              </NativeSelectOption>
              {DOCUMENT_TYPE_VALUES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {t(DOCUMENT_TYPE_LABEL_KEY[value])}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : null}

        {/* Rendered only when the book actually has sites on it. An empty
            <select> would be a control that cannot do anything. */}
        {sites.length > 0 ? (
          <div className="grid gap-1.5">
            <Label htmlFor="documents-filter-site">
              {t("dokumenty.filterSite")}
            </Label>
            <NativeSelect
              id="documents-filter-site"
              name="site"
              defaultValue={filters.siteRef ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">
                {t("dokumenty.filterAny")}
              </NativeSelectOption>
              {sites.map((site) => (
                <NativeSelectOption key={site} value={site}>
                  {site}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor="documents-filter-from">
            {t("dokumenty.filterFrom")}
          </Label>
          <Input
            id="documents-filter-from"
            name="from"
            type="date"
            defaultValue={filters.from ?? ""}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="documents-filter-to">{t("dokumenty.filterTo")}</Label>
          <Input
            id="documents-filter-to"
            name="to"
            type="date"
            defaultValue={filters.to ?? ""}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="documents-filter-q">
            {t("dokumenty.filterSearch")}
          </Label>
          <Input
            id="documents-filter-q"
            name="q"
            type="search"
            inputMode="search"
            maxLength={120}
            placeholder={t("dokumenty.filterSearchPlaceholder")}
            defaultValue={filters.search ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="lg">
          {t("dokumenty.filterApply")}
        </Button>
        {hasActiveFilters(filters) ? (
          <Button asChild variant="ghost" size="lg">
            <Link href={path}>{t("dokumenty.filterReset")}</Link>
          </Button>
        ) : null}
      </div>
    </form>
  )
}
