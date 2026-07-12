"use client"

import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { PageHeaderActions } from "../_shared/content-header-extras"

/** Faktury přijaté content header — mounts into the app-shell contentHeader slot. */
export function DocumentsReceivedHeader() {
  return (
    <ContentHeader title="Faktury přijaté" actions={<PageHeaderActions />} />
  )
}
