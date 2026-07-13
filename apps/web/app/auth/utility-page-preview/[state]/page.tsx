import { notFound } from "next/navigation"

import { getBuildVersion } from "@workspace/ui/brand-assets"
import { isUtilityPageId, UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "../../../_components/language-picker"

export default async function UtilityPagePreview({
  params,
}: {
  params: Promise<{ state: string }>
}) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_DEV_PREVIEW !== "1"
  ) {
    notFound()
  }

  const { state } = await params
  if (!isUtilityPageId(state)) notFound()

  return (
    <UtilityPage
      state={state}
      runtime={{
        surface: "global",
        automaticReport: false,
        buildVersion: getBuildVersion(),
        referenceId: `preview_${state}`,
        retryAfterSeconds: 30,
        report: {
          payload: {
            message: `Preview ${state}`,
            source: "web-preview",
          },
        },
      }}
      footerControl={<LanguagePicker />}
    />
  )
}
