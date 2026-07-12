"use client"

import { ContentHeader } from "@workspace/ui/blocks/content-panel"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { IconButton } from "@workspace/ui/components/icon-button"
import { toast } from "@workspace/ui/components/sonner"

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
      <ContentHeader
        icon={
          <IconButton
            icon="ArrowLeft"
            aria-label="Zpět"
            tooltip="Zpět"
            tooltipSide="bottom"
            onClick={() => toast("Zpět na seznam")}
          />
        }
        title={header.number}
        actions={
          <>
            <Badge variant="secondary" className="h-5">
              Rozpracováno
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => toast("Objednávky")}
            >
              Objednávky
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => toast("Dodávky")}
            >
              Dodávky
            </Button>
            <IconButton
              icon="ChevronUp"
              aria-label="Předchozí doklad"
              tooltip="Předchozí"
              tooltipSide="bottom"
              onClick={() => toast("Předchozí doklad")}
            />
            <IconButton
              icon="ChevronDown"
              aria-label="Další doklad"
              tooltip="Další"
              tooltipSide="bottom"
              onClick={() => toast("Další doklad")}
            />
            <IconButton
              icon="Settings2"
              aria-label="Nastavení"
              tooltip="Nastavení"
              tooltipSide="bottom"
            />
          </>
        }
      />
    </AppPageHeader>
  )
}
