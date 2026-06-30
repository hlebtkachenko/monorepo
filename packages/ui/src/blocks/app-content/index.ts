export { ContentHeader } from "./content-header"
export type { ContentHeaderProps, ContentTab } from "./content-header"
export { ContentToolbar } from "./content-toolbar"
export type { ContentToolbarProps } from "./content-toolbar"
export { ContentStatusBar } from "./content-status-bar"
export type { ContentStatusBarProps } from "./content-status-bar"
export { ContentPanel } from "./content-panel"
export type { ContentPanelProps, InspectorMode } from "./content-panel"
export { DetailField } from "./detail-field"
export type { DetailFieldProps } from "./detail-field"

// Content-panel archetype prototypes (#425) — rough, presentational bodies that
// drop into a `ContentPanel`'s `children`. Mock-data examples live in the stories.
export { LaunchpadGrid, getLaunchpadCounts } from "./launchpad-grid"
export type {
  LaunchpadGridProps,
  LaunchpadView,
  LaunchpadSection,
  LaunchpadSectionKind,
  LaunchpadPage,
  LaunchpadSubpage,
} from "./launchpad-grid"
export { DashboardGrid, MetricTile, DashboardChartCard } from "./dashboard-grid"
export type {
  DashboardGridProps,
  MetricTileProps,
  DashboardChartCardProps,
} from "./dashboard-grid"
export { RecordDetail } from "./record-detail"
export type {
  RecordDetailProps,
  RecordGroup,
  RecordField,
} from "./record-detail"
export { RecordWorkspace } from "./record-workspace"
export type { RecordWorkspaceProps } from "./record-workspace"
