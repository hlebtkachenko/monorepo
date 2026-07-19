export { sectionEmpty } from "./section-empty"
export type { SectionEmptyProps } from "./section-empty"
export { sectionDetailsForm } from "./section-details-form"
export type {
  SectionDetailsFormProps,
  DetailsFormField,
  DetailsFormFieldControl,
  DetailsFormFieldHover,
  DetailsFormFieldSpan,
  DetailsFormSelectOption,
} from "./section-details-form"
export { sectionDetailsTabs } from "./section-details-tabs"
export type {
  SectionDetailsTabsProps,
  DetailsFormTab,
} from "./section-details-tabs"
export { sectionDetailsTable } from "./section-details-table"
export {
  DetailsTableGrid,
  type DetailsTableGridProps,
} from "./section-details-table-renderer"
export type {
  SectionDetailsTableProps,
  DetailsTableColumn,
  DetailsTableColumnAlign,
  DetailsTableColumnSpan,
  DetailsTableControl,
  DetailsTableCellValue,
  DetailsTableRow,
  DetailsTableRowAction,
  DetailsTableAction,
  DetailsTableActionIcon,
  DetailsTableMode,
  DetailsTableEditHint,
} from "./section-details-table"
export {
  sectionTable,
  filterVariantForKind,
  resolveColumnFilter,
} from "./section-table"
export type {
  SectionTableProps,
  TableColumnKind,
  TableColumnAlign,
  TableColumnOption,
  TableColumnSpec,
  TableColumnEditMode,
  TableColumnFilterVariant,
  TableColumnFilterPreset,
  TableCellValue,
  TableSectionRow,
  TableSectionFeatures,
} from "./section-table"
export { buildTableSection } from "./build-table-section"
export type {
  TableColumnDef,
  BuildTableSectionOptions,
  BuiltTableSection,
} from "./build-table-section"
export { deriveFilterColumns, applyTableFilters } from "./derive-table-filters"
export { useTableFilters } from "./use-table-filters"
export type { UseTableFiltersOptions } from "./use-table-filters"
export { usePivotFilters } from "./use-pivot-filters"
export type { UsePivotFiltersOptions } from "./use-pivot-filters"
export { sectionPivotTable, PIVOT_ROW_LABEL_ID } from "./section-pivot-table"
export type {
  SectionPivotTableProps,
  SectionPivotTablePayload,
  PivotValueFormat,
  PivotDimension,
  PivotMeasure,
  PivotAggregation,
  PivotDrillTarget,
  SectionPivotDrill,
} from "./section-pivot-table"
export type {
  PivotCell,
  PivotLeafColumn,
  PivotColumnNode,
  PivotRow,
  PivotResult,
  BuildPivotInput,
} from "./pivot-transform"
export { buildPivot } from "./pivot-transform"
export {
  SectionTableProvider,
  useSectionTable,
  useSectionInspectOpener,
  useSectionInspect,
  useSectionColumnMenu,
  useSectionColumnFilter,
  useSectionColumnAnalyze,
  useSectionCellCommit,
  useSectionCreateOption,
  useSectionPivotDrill,
} from "./section-table-context"
export type {
  SectionTableRegistration,
  SectionCellEdit,
  SectionCellCommit,
  SectionOptionCreate,
  SectionCreateOption,
} from "./section-table-context"
export { sectionSpace } from "./section-space"
export type { SectionSpaceProps } from "./section-space"
export { sectionDetailsGroup } from "./section-details-group"
export type { SectionDetailsGroupProps } from "./section-details-group"
export type {
  SectionDescriptor,
  SectionKind,
  DetailsBodySectionKind,
} from "./section"
export type { SectionAction } from "./section-action-context"
export { SECTION_KINDS, DETAILS_BODY_KINDS } from "./section"
// The list renderer that walks branded descriptors through `SECTION_REGISTRY`.
// Exposed so an Inspector tab composes its body the same descriptor-driven way a
// Content archetype composes its body — no hand-placed section JSX.
export { SectionList } from "./section-list"

// Inspector body sections — the same Section system, `inspector-*` prefixed.
export {
  sectionInspectorKeyDetails,
  sectionInspectorMoneyTotals,
  sectionInspectorTable,
  sectionInspectorParagraph,
  sectionInspectorLinkedRecords,
  sectionInspectorActivityLog,
  sectionInspectorAttachments,
  sectionInspectorExport,
  type InspectorTableSectionProps,
} from "./section-inspector"
