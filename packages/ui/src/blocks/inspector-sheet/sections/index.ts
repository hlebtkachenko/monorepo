// Inspector body sections — reusable, data-driven building blocks composed by a
// page into an Inspector tab's `content`. Every section reads the shared edit
// context, so the header's "Edit" toggle flips their editable fields on. See
// README.md. Details tables use `DetailsTableGrid` from `blocks/content-panel`.

export {
  InspectorEditProvider,
  useInspectorEditing,
  useInspectorFieldEditable,
  type InspectorFieldEditPolicy,
} from "./inspector-edit-context"

export {
  InspectorSection,
  type InspectorSectionProps,
} from "./inspector-section"

export {
  InspectorKeyDetails,
  type InspectorKeyLine,
  type InspectorKeyLineType,
  type InspectorKeyDetailsProps,
} from "./inspector-key-details"

export {
  InspectorMoneyTotals,
  type InspectorMoneyRow,
  type InspectorMoneyTotalsProps,
} from "./inspector-money-totals"

export {
  InspectorAttachments,
  type InspectorAttachmentFile,
  type InspectorAttachmentKind,
  type InspectorExistingRecord,
  type InspectorAttachmentsProps,
} from "./inspector-attachments"

export {
  InspectorParagraph,
  type InspectorParagraphProps,
} from "./inspector-paragraph"

export {
  InspectorLinkedRecords,
  type InspectorLinkedRecord,
  type InspectorLinkedRecordsProps,
} from "./inspector-linked-records"

export {
  InspectorActivityLog,
  type InspectorActivityLogEntry,
  type InspectorActivityLogProps,
} from "./inspector-activity-log"

export {
  InspectorExport,
  type InspectorExportFormat,
  type InspectorExportField,
  type InspectorExportProps,
} from "./inspector-export"
