import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "../../_components/language-picker"

/**
 * Generic deny screen for section-level capability misses. Deliberately
 * does NOT mention which role is required — staff must contact an owner
 * to request access, not infer the access matrix from the UI.
 */
export function AccessDenied() {
  return (
    <UtilityPage
      state="access_denied"
      runtime={{ application: "admin" }}
      footerControl={<LanguagePicker />}
    />
  )
}
