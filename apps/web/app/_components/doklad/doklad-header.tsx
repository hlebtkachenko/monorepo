"use client"

import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { AppPageHeader } from "../app-page-header"
import { useDoklad } from "./context"

/**
 * The doklad content header — mounted into the shell's content-header slot via
 * `AppPageHeader`. Carries a Back button (icon), the document number as title,
 * a draft status pill, relation pills (orders / deliveries), record paging, and
 * a configure button. Reads the document number from the shared record state.
 */
export function DokladHeader() {
  const { header } = useDoklad()
  return (
    <AppPageHeader>
      {/* TODO(archetype-redo): a Back button (icon) lived in the header; relocate to the body on rebuild. */}
      {/* TODO(archetype-redo): a draft status pill, order/delivery relation buttons, record paging, and a configure button lived in the header; relocate to the body on rebuild. */}
      <ContentHeader title={header.number} />
    </AppPageHeader>
  )
}
