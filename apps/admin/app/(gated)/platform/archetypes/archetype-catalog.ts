export const ARCHETYPES = [
  {
    slug: "table",
    label: "Table",
    description: "Dense list with a toolbar, grid, and status bar.",
    slots: "toolbar + body + statusBar",
  },
  {
    slug: "blank",
    label: "Blank",
    description: "One-off body with no content-panel chrome.",
    slots: "body only",
  },
  {
    slug: "launchpad",
    label: "Launchpad",
    description: "Card-grid overview that leads into areas of work.",
    slots: "body only: LaunchpadGrid",
  },
  {
    slug: "dashboard",
    label: "Dashboard",
    description: "KPI tiles and chart cards for decisions and analysis.",
    slots: "body only: DashboardGrid",
  },
  {
    slug: "single",
    label: "Single",
    description: "Focused record workspace with details and actions.",
    slots: "body only: RecordWorkspace",
  },
] as const
