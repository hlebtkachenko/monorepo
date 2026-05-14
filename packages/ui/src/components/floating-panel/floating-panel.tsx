"use client"

import * as React from "react"
import {
  FloatingPanel as ArkFloatingPanel,
  Portal,
  ark,
  useFloatingPanelContext,
} from "@ark-ui/react"
import {
  Maximize,
  MaximizeIcon,
  MinimizeIcon,
  MinusIcon,
} from "@workspace/ui/lib/icons"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

const useFloatingPanel = useFloatingPanelContext

function FloatingPanel({
  lazyMount = true,
  unmountOnExit = true,
  ...props
}: React.ComponentProps<typeof ArkFloatingPanel.Root>) {
  return (
    <ArkFloatingPanel.Root
      data-slot="floating-panel"
      lazyMount={lazyMount}
      unmountOnExit={unmountOnExit}
      {...props}
    />
  )
}

function FloatingPanelTrigger(
  props: React.ComponentProps<typeof ArkFloatingPanel.Trigger>,
) {
  return (
    <ArkFloatingPanel.Trigger data-slot="floating-panel-trigger" {...props} />
  )
}

interface FloatingPanelContentProps extends React.ComponentProps<
  typeof ArkFloatingPanel.Content
> {
  resizable?: boolean
}

function FloatingPanelContent({
  resizable = true,
  className,
  children,
  ...props
}: FloatingPanelContentProps) {
  return (
    <Portal>
      <ArkFloatingPanel.Positioner
        className="inset-s-(--x) top-(--y) z-50"
        data-slot="floating-panel-positioner"
      >
        <ArkFloatingPanel.Content
          data-slot="floating-panel-content"
          className={cn(
            "[--space:--spacing(4)]",
            "group/floating-panel",
            "relative flex flex-col",
            "h-(--height) min-h-0 w-(--width)",
            "bg-popover text-popover-foreground",
            "overflow-hidden rounded-2xl border border-border shadow-md",
            "transition-[scale,opacity,translate] duration-200 ease-in-out will-change-transform",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[98%]",
            className,
          )}
          {...props}
        >
          {children}

          {resizable && (
            <>
              <FloatingPanelResizeTrigger axis="n" />
              <FloatingPanelResizeTrigger axis="e" />
              <FloatingPanelResizeTrigger axis="w" />
              <FloatingPanelResizeTrigger axis="s" />
              <FloatingPanelResizeTrigger axis="ne" />
              <FloatingPanelResizeTrigger axis="se" />
              <FloatingPanelResizeTrigger axis="sw" />
              <FloatingPanelResizeTrigger axis="nw" />
            </>
          )}
        </ArkFloatingPanel.Content>
      </ArkFloatingPanel.Positioner>
    </Portal>
  )
}

function FloatingPanelDragTrigger(
  props: React.ComponentProps<typeof ArkFloatingPanel.DragTrigger>,
) {
  return (
    <ArkFloatingPanel.DragTrigger
      data-slot="floating-panel-drag-trigger"
      {...props}
    />
  )
}

function FloatingPanelHeader({
  className,
  ...props
}: React.ComponentProps<typeof ArkFloatingPanel.Header>) {
  return (
    <FloatingPanelDragTrigger>
      <ArkFloatingPanel.Header
        data-slot="floating-panel-header"
        className={cn(
          "relative min-w-0",
          "px-(--space) py-[calc(var(--space)*0.5)]",
          "flex flex-1 shrink-0 items-center gap-2",
          "rounded-t-2xl border-b border-border bg-muted/50",
          "overflow-hidden",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className,
        )}
        {...props}
      />
    </FloatingPanelDragTrigger>
  )
}

function FloatingPanelControl({
  className,
  ...props
}: React.ComponentProps<typeof ArkFloatingPanel.Control>) {
  return (
    <ArkFloatingPanel.Control
      data-slot="floating-panel-control"
      className={cn("ms-auto flex items-center gap-2 rtl:me-auto", className)}
      {...props}
    />
  )
}

interface FloatingPanelStageTriggerProps extends Omit<
  React.ComponentProps<typeof ArkFloatingPanel.StageTrigger>,
  "stage"
> {
  size?: React.ComponentProps<typeof Button>["size"]
  variant?: React.ComponentProps<typeof Button>["variant"]
}

function FloatingPanelMinimize({
  size = "icon-xs",
  variant = "ghost",
  ...props
}: FloatingPanelStageTriggerProps) {
  return (
    <ArkFloatingPanel.StageTrigger
      data-slot="floating-panel-minimize"
      {...props}
      asChild
      stage="minimized"
    >
      <Button aria-label="Minimize" size={size} variant={variant}>
        <MinusIcon />
      </Button>
    </ArkFloatingPanel.StageTrigger>
  )
}

function FloatingPanelMaximize({
  size = "icon-xs",
  variant = "ghost",
  ...props
}: FloatingPanelStageTriggerProps) {
  return (
    <ArkFloatingPanel.StageTrigger
      data-slot="floating-panel-maximize"
      {...props}
      asChild
      stage="maximized"
    >
      <Button aria-label="Maximize" size={size} variant={variant}>
        <Maximize />
      </Button>
    </ArkFloatingPanel.StageTrigger>
  )
}

function FloatingPanelRestore({
  size = "icon-xs",
  variant = "outline",
  className,
  ...props
}: FloatingPanelStageTriggerProps) {
  return (
    <ArkFloatingPanel.StageTrigger
      data-slot="floating-panel-restore"
      {...props}
      asChild
      stage="default"
    >
      <Button
        aria-label="Restore"
        size={size}
        variant={variant}
        className={cn(
          "hidden group-data-maximized/floating-panel:inline-flex group-data-minimized/floating-panel:inline-flex",
          className,
        )}
      >
        <MinimizeIcon className="hidden group-data-maximized/floating-panel:block" />
        <MaximizeIcon className="hidden group-data-minimized/floating-panel:block" />
      </Button>
    </ArkFloatingPanel.StageTrigger>
  )
}

function FloatingPanelTitle({
  className,
  ...props
}: React.ComponentProps<typeof ArkFloatingPanel.Title>) {
  return (
    <ArkFloatingPanel.Title
      data-slot="floating-panel-title"
      className={cn(
        "min-w-0 flex-1",
        "flex items-center gap-2",
        "truncate text-sm leading-none font-medium whitespace-nowrap",
        className,
      )}
      {...props}
    />
  )
}

function FloatingPanelResizeTrigger(
  props: React.ComponentProps<typeof ArkFloatingPanel.ResizeTrigger>,
) {
  return (
    <ArkFloatingPanel.ResizeTrigger
      data-slot="floating-panel-resize-handle"
      {...props}
    />
  )
}

function FloatingPanelStageTrigger(
  props: React.ComponentProps<typeof ArkFloatingPanel.StageTrigger>,
) {
  return (
    <ArkFloatingPanel.StageTrigger
      data-slot="floating-panel-stage-trigger"
      {...props}
    />
  )
}

function FloatingPanelCloseTrigger(
  props: React.ComponentProps<typeof ArkFloatingPanel.CloseTrigger>,
) {
  return (
    <ArkFloatingPanel.CloseTrigger
      data-slot="floating-panel-close-trigger"
      {...props}
    />
  )
}

function FloatingPanelBody({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ArkFloatingPanel.Body>) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <ArkFloatingPanel.Body
        data-slot="floating-panel-body"
        className={cn(
          "flex flex-col gap-4",
          "p-(--space)",
          "overflow-auto",
          className,
        )}
        {...props}
      >
        {children}
      </ArkFloatingPanel.Body>
    </ScrollArea>
  )
}

function FloatingPanelFooter({
  className,
  ...props
}: React.ComponentProps<typeof ark.div>) {
  return (
    <ark.div
      data-slot="floating-panel-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        "sm:rounded-b-[calc(var(--radius-2xl)-1px)]",
        "px-(--space) py-4",
        "border-t border-border bg-muted/50",
        className,
      )}
      {...props}
    />
  )
}

export {
  FloatingPanel,
  FloatingPanelBody,
  FloatingPanelCloseTrigger,
  FloatingPanelContent,
  FloatingPanelControl,
  FloatingPanelDragTrigger,
  FloatingPanelFooter,
  FloatingPanelHeader,
  FloatingPanelMaximize,
  FloatingPanelMinimize,
  FloatingPanelResizeTrigger,
  FloatingPanelRestore,
  FloatingPanelStageTrigger,
  FloatingPanelTitle,
  FloatingPanelTrigger,
  useFloatingPanel,
}
