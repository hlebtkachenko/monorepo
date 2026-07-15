"use client"

import { Button } from "@workspace/ui/components/button"

/**
 * Decline/approve action pair shown in the sticky inspector footer. Both labels
 * are page-driven (e.g. "Not relevant" / "Commit", "Reject" / "Approve"); the
 * approve action is the primary button.
 */
export interface InspectorFooterProps {
  /** Left (secondary) action label — e.g. "Reject", "Not relevant". */
  declineLabel: string
  /** Right (primary) action label — e.g. "Approve", "Commit". */
  approveLabel: string
  onDecline?: () => void
  onApprove?: () => void
}

/**
 * InspectorFooter — the sticky action bar pinned to the bottom of the body,
 * same height as `InspectorBodyHeader` (43px). A decline (outline) and an
 * approve (primary) button split the width evenly.
 */
export function InspectorFooter({
  declineLabel,
  approveLabel,
  onDecline,
  onApprove,
}: InspectorFooterProps) {
  return (
    <div
      data-slot="inspector-footer"
      className="flex h-[43px] shrink-0 items-center gap-2 border-t border-border-subtle bg-shell-surface px-4"
    >
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={onDecline}
      >
        {declineLabel}
      </Button>
      <Button size="sm" className="flex-1" onClick={onApprove}>
        {approveLabel}
      </Button>
    </div>
  )
}
