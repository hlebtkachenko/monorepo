export { ContentHeader, ContentHeaderActions } from "./content-header"
export type {
  ContentHeaderProps,
  ViewTab,
  ViewTabsConfigure,
  ContentHeaderBreadcrumbItem,
  ContentHeaderBackLinkData,
} from "./content-header"
export { ContentToolbar, ContentToolbarLegacy } from "./content-toolbar"
export type {
  ContentToolbarProps,
  ContentToolbarLegacyProps,
  StatusFilterDescriptor,
  StatusFilterOption,
  SearchDescriptor,
  FilterDescriptor,
  ViewToolsDescriptor,
  ActionDescriptor,
  ActionVariant,
  AddDescriptor,
  AddVariant,
} from "./content-toolbar"
export { ContentStatusBar } from "./content-status-bar"
export type { ContentStatusBarProps } from "./content-status-bar"
export { ContentPanel } from "./content-panel"
export type { ContentPanelProps } from "./content-panel"
export { Inspector } from "./inspector"
export type { InspectorProps, InspectorMode } from "./inspector"
export {
  InspectorSheet,
  InspectorSection,
  InspectorDetailList,
  InspectorDetail,
  InspectorLineItem,
  InspectorEvidenceItem,
  InspectorDropzone,
} from "./inspector"
export type { InspectorSheetProps, InspectorMetaItem } from "./inspector"
export * from "./content-body"
export { ContentFooter } from "./content-footer"
export type {
  ContentFooterProps,
  ContentFooterAction,
  ContentFooterActionVariant,
  ContentFooterSelection,
  ContentFooterSave,
} from "./content-footer"
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
export { DashboardGrid, DashboardChartCard } from "./dashboard-grid"
export type {
  DashboardGridProps,
  MetricTileProps,
  DashboardChartCardProps,
} from "./dashboard-grid"
export { RecordWorkspace } from "./record-workspace"
export type { RecordWorkspaceProps } from "./record-workspace"
