"use client"

import { ark } from "@ark-ui/react/factory"
import { Tabs as ArkTabs } from "@ark-ui/react/tabs"
import type * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function NavigationBottomMobile({
  className,
  "aria-label": ariaLabel = "Main navigation",
  ...props
}: React.ComponentProps<typeof ArkTabs.Root>) {
  return (
    <ArkTabs.Root
      data-slot="navigation-bottom-mobile"
      aria-label={ariaLabel}
      className={cn("w-full", className)}
      style={{
        height:
          "calc(calc(var(--spacing) * 14) + env(safe-area-inset-bottom, 0px))",
      }}
      {...props}
    />
  )
}

function NavigationBottomMobileList({
  className,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<typeof ArkTabs.List>) {
  return (
    <ArkTabs.List
      data-slot="navigation-bottom-mobile-list"
      aria-label={ariaLabel ?? "Main navigation"}
      className={cn(
        "fixed inset-x-0 bottom-0 z-10",
        "flex w-full items-center justify-around",
        "min-h-14 shrink-0",
        // App-chrome surface: use the shell token family (DEV-77), matching
        // the rail/header rather than the global card/background tokens.
        "border-t border-border-subtle bg-shell-surface/60 backdrop-blur-sm",
        "pb-[env(safe-area-inset-bottom,0px)]",
        className,
      )}
      {...props}
    />
  )
}

function NavigationBottomMobileItem({
  className,
  ...props
}: React.ComponentProps<typeof ArkTabs.Trigger>) {
  return (
    <ArkTabs.Trigger
      data-slot="navigation-bottom-mobile-item"
      className={cn(
        "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 p-2",
        "cursor-pointer text-muted-foreground transition-colors",
        "hover:text-foreground aria-selected:text-primary",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        "data-disabled:pointer-events-none data-disabled:opacity-60",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      {...props}
    />
  )
}

function NavigationBottomMobileItemIcon({
  className,
  ...props
}: React.ComponentProps<typeof ark.span>) {
  return (
    <ark.span
      aria-hidden
      data-slot="navigation-bottom-mobile-item-icon"
      className={cn("flex items-center justify-center", className)}
      {...props}
    />
  )
}

function NavigationBottomMobileItemLabel({
  className,
  ...props
}: React.ComponentProps<typeof ark.span>) {
  return (
    <ark.span
      data-slot="navigation-bottom-mobile-item-label"
      className={cn("truncate text-xs font-medium", className)}
      {...props}
    />
  )
}

export {
  NavigationBottomMobile,
  NavigationBottomMobileItem,
  NavigationBottomMobileItemIcon,
  NavigationBottomMobileItemLabel,
  NavigationBottomMobileList,
}
