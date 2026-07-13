import { getBuildVersion } from "@workspace/ui/brand-assets"
import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "./_components/language-picker"

// Root 404 surface (OBS-03/H11 parity with web). Bad admin URLs used to
// render Next's unbranded default 404.
export default function NotFound() {
  return (
    <UtilityPage
      state="route_not_found"
      runtime={{ application: "admin", buildVersion: getBuildVersion() }}
      footerControl={<LanguagePicker />}
    />
  )
}
