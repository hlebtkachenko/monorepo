import {
  BRAND_STATUS_URL,
  BRAND_SUPPORT_EMAIL,
} from "@workspace/ui/brand-assets"

import type { UtilityActionId, UtilityPageRuntime } from "./utility-page.types"

interface UtilityActionDefinition {
  label: `utilityPage.actions.${UtilityActionId}`
  variant: "default" | "outline"
  defaultHref?: string
  behavior?: "retry" | "reload"
}

export const UTILITY_ACTIONS = {
  go_back: { label: "utilityPage.actions.go_back", variant: "outline" },
  choose_organization: {
    label: "utilityPage.actions.choose_organization",
    variant: "default",
    defaultHref: "/workspace",
  },
  sign_in: {
    label: "utilityPage.actions.sign_in",
    variant: "default",
    defaultHref: "/auth/login",
  },
  reauthenticate: {
    label: "utilityPage.actions.reauthenticate",
    variant: "default",
    defaultHref: "/auth/revalidate",
  },
  retry: {
    label: "utilityPage.actions.retry",
    variant: "default",
    behavior: "retry",
  },
  reload: {
    label: "utilityPage.actions.reload",
    variant: "default",
    behavior: "reload",
  },
  request_access: {
    label: "utilityPage.actions.request_access",
    variant: "default",
    defaultHref: `mailto:${BRAND_SUPPORT_EMAIL}`,
  },
  open_status: {
    label: "utilityPage.actions.open_status",
    variant: "outline",
    defaultHref: BRAND_STATUS_URL,
  },
  contact_support: {
    label: "utilityPage.actions.contact_support",
    variant: "outline",
    defaultHref: `mailto:${BRAND_SUPPORT_EMAIL}`,
  },
} as const satisfies Record<UtilityActionId, UtilityActionDefinition>

export function resolveUtilityActionHref(
  action: UtilityActionId,
  runtime: UtilityPageRuntime,
): string | undefined {
  const definition: UtilityActionDefinition = UTILITY_ACTIONS[action]
  return runtime.actionHrefs?.[action] ?? definition.defaultHref
}
