import { getBuildVersion } from "@workspace/ui/brand-assets"
import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "./_components/language-picker"

// Root 404 surface (H11). Non-org bad URLs (e.g. /nonexistent) used to render
// Next's unbranded default; org-scoped 404s are handled by
// app/[orgSlug]/not-found.tsx.
export default function NotFound() {
  return (
    <UtilityPage
      state="route_not_found"
      runtime={{ buildVersion: getBuildVersion() }}
      footerControl={<LanguagePicker />}
    />
  )
}
