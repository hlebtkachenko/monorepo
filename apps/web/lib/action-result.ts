/**
 * Common return shape for server actions across this app — a boolean
 * outcome plus an optional i18n key describing the failure. Single source
 * so onboarding, workspace, and future action files can't drift into
 * incompatible shapes.
 */
export interface ActionResult {
  ok: boolean
  errorKey?: string
}
