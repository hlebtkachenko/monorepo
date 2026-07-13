"use client"

import { useParams } from "next/navigation"
import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "../_components/language-picker"

export default function OrgNotFound() {
  const { orgSlug } = useParams<{ orgSlug: string }>()

  return (
    <UtilityPage
      state="resource_not_found"
      runtime={{ actionHrefs: { go_back: `/${encodeURIComponent(orgSlug)}` } }}
      footerControl={<LanguagePicker />}
    />
  )
}
