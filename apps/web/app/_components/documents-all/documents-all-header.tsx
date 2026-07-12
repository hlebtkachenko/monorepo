"use client"

import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { PageHeaderActions } from "../_shared/content-header-extras"

/** Records overview content header — mounts into the app-shell contentHeader slot. */
export function DocumentsAllHeader() {
  return <ContentHeader title="Records" actions={<PageHeaderActions />} />
}
