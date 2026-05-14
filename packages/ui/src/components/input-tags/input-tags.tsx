"use client"

import * as TagsInputPrimitive from "@diceui/tags-input"
import { XIcon } from "@workspace/ui/lib/icons"
import type * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

function InputTags({
  className,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Root>) {
  return (
    <TagsInputPrimitive.Root
      data-slot="input-tags"
      className={cn("flex w-full flex-col gap-2", className)}
      {...props}
    />
  )
}

function InputTagsLabel({
  className,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Label>) {
  return (
    <TagsInputPrimitive.Label
      data-slot="input-tags-label"
      className={cn(
        "text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  )
}

function InputTagsList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-tags-list"
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  )
}

function InputTagsInput({
  className,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Input>) {
  return (
    <TagsInputPrimitive.Input
      data-slot="input-tags-input"
      className={cn(
        "flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}

function InputTagsItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Item>) {
  return (
    <TagsInputPrimitive.Item
      data-slot="input-tags-item"
      className={cn(
        "inline-flex max-w-[calc(100%-8px)] items-center gap-1.5 rounded-md border border-border bg-transparent px-2 py-0.5 text-sm focus:outline-none",
        "data-editable:select-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
        "data-editing:bg-transparent data-editing:ring-1 data-editing:ring-ring",
        "[&:not([data-editing])]:pr-1",
        "[&[data-highlighted]:not([data-editing])]:bg-accent [&[data-highlighted]:not([data-editing])]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <TagsInputPrimitive.ItemText className="truncate">
        {children}
      </TagsInputPrimitive.ItemText>
      <TagsInputPrimitive.ItemDelete
        data-slot="input-tags-item-delete"
        className="size-4 shrink-0 rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
      >
        <XIcon className="size-3.5" />
      </TagsInputPrimitive.ItemDelete>
    </TagsInputPrimitive.Item>
  )
}

function InputTagsClear({
  ...props
}: React.ComponentProps<typeof TagsInputPrimitive.Clear>) {
  return <TagsInputPrimitive.Clear data-slot="input-tags-clear" {...props} />
}

export {
  InputTags,
  InputTagsClear,
  InputTagsInput,
  InputTagsItem,
  InputTagsLabel,
  InputTagsList,
}
