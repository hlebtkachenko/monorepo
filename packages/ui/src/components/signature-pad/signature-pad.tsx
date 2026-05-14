"use client"

import {
  SignaturePad as ArkSignaturePad,
  useSignaturePadContext,
} from "@ark-ui/react/signature-pad"
import { RotateCcwIcon } from "@workspace/ui/lib/icons"
import type * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

const useSignaturePad = useSignaturePadContext

function SignaturePad({
  className,
  ...props
}: React.ComponentProps<typeof ArkSignaturePad.Root>) {
  return (
    <ArkSignaturePad.Root
      data-slot="signature-pad"
      className={cn(
        "flex h-40 min-h-40 w-full flex-col gap-1.5 data-disabled:opacity-60 data-disabled:grayscale",
        className,
      )}
      {...props}
    >
      <SignaturePadControl>
        <SignaturePadSegment />
        <SignaturePadClear />
        <SignaturePadGuide />
      </SignaturePadControl>
    </ArkSignaturePad.Root>
  )
}

function SignaturePadControl({
  className,
  ...props
}: React.ComponentProps<typeof ArkSignaturePad.Control>) {
  return (
    <ArkSignaturePad.Control
      data-slot="signature-pad-control"
      className={cn(
        "relative flex size-full min-h-0 min-w-0 flex-col rounded-lg border border-border bg-muted/60 shadow-xs data-disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  )
}

function SignaturePadSegment({
  className,
  ...props
}: React.ComponentProps<typeof ArkSignaturePad.Segment>) {
  return (
    <ArkSignaturePad.Segment
      data-slot="signature-pad-segment"
      className={cn("size-full min-h-0 touch-none fill-foreground", className)}
      {...props}
    />
  )
}

function SignaturePadClear({
  className,
  ...props
}: React.ComponentProps<typeof ArkSignaturePad.ClearTrigger>) {
  return (
    <ArkSignaturePad.ClearTrigger
      asChild
      data-slot="signature-pad-clear"
      className={cn("absolute end-2 top-2", className)}
      {...props}
    >
      <Button
        size="icon-sm"
        variant="ghost"
        type="button"
        aria-label="Clear signature"
      >
        <RotateCcwIcon />
      </Button>
    </ArkSignaturePad.ClearTrigger>
  )
}

function SignaturePadGuide({
  className,
  ...props
}: React.ComponentProps<typeof ArkSignaturePad.Guide>) {
  return (
    <ArkSignaturePad.Guide
      data-slot="signature-pad-guide"
      className={cn(
        "pointer-events-none absolute inset-x-6 bottom-6 border-b-2 border-dashed border-input",
        className,
      )}
      {...props}
    />
  )
}

export {
  SignaturePad,
  SignaturePadClear,
  SignaturePadControl,
  SignaturePadGuide,
  SignaturePadSegment,
  useSignaturePad,
}
