import { getBuildVersion } from "@workspace/ui/brand-assets"
import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "../_components/language-picker"

export default function GatedNotFound() {
  return (
    <UtilityPage
      state="resource_not_found"
      runtime={{
        application: "admin",
        surface: "shell",
        buildVersion: getBuildVersion(),
      }}
      footerControl={<LanguagePicker />}
    />
  )
}
