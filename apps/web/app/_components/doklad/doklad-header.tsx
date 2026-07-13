"use client"

import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { useDoklad } from "./context"

/**
 * The doklad content header — mounted into the shell's content-header slot via
 * `AppPageHeader`. Currently renders only the document number as title (from the
 * shared record state). The back button, draft status pill, order/delivery
 * relation buttons, record paging, and configure button previously lived here
 * and are deferred to the body rebuild (see the archetype-redo TODOs below).
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
