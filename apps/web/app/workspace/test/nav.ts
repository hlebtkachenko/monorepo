import type { RailMenuEntry } from "@workspace/ui/blocks/app-rail"

/**
 * Rail menu for the workspace test surface — proves the AppRail block is
 * driven purely by a per-surface config (no block edits). No links yet.
 */
export const workspaceTestNav: RailMenuEntry[] = [
  { label: "Companies", icon: "Building2" },
  { label: "Services", icon: "Blocks" },
  { label: "Users", icon: "Users" },
  "separator",
  { label: "Connect", icon: "Workflow" },
  { label: "Agents", icon: "HatGlasses" },
  "separator",
  { label: "Billing", icon: "CreditCard" },
  { label: "Settings", icon: "Settings" },
]
