"use client"

import { ContentHeader } from "@workspace/ui/blocks/app-content"

import { PageHeaderActions } from "../_shared/content-header-extras"

/** Held-writes review queue content header — app-shell contentHeader slot. */
export function HeldWritesHeader() {
  return <ContentHeader title="Ke schválení" actions={<PageHeaderActions />} />
}
