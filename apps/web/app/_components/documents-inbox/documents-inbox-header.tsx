"use client"

import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { PageHeaderActions } from "../_shared/content-header-extras"

/** Ingestion inbox content header — app-shell contentHeader slot. */
export function DocumentsInboxHeader() {
  return <ContentHeader title="Inbox" actions={<PageHeaderActions />} />
}
