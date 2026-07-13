import { notFound } from "next/navigation"

import { getBuildVersion } from "@workspace/ui/brand-assets"
import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "../../_components/language-picker"

export default function UtilityPage503Preview() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_DEV_PREVIEW !== "1"
  ) {
    notFound()
  }

  return (
    <UtilityPage
      state="service_unavailable"
      runtime={{
        buildVersion: getBuildVersion(),
        referenceId: "preview_service_503",
        retryAfterSeconds: 30,
        report: {
          payload: {
            message: "Preview service unavailable",
            source: "web-preview",
          },
        },
      }}
      footerControl={<LanguagePicker />}
    />
  )
}
