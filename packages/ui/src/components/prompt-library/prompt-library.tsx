"use client"

import * as React from "react"
import { LibraryIcon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@workspace/ui/lib/utils"
import { makeId } from "@workspace/ui/lib/id"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Textarea } from "@workspace/ui/components/textarea"

export interface Prompt {
  id: string
  title: string
  description: string
  prompt: string
  category?: string
  isCustom?: boolean
}

interface PromptLibraryContextValue {
  prompts: Prompt[]
  addCustom: (prompt: Omit<Prompt, "id" | "isCustom">) => void
  removeCustom: (id: string) => void
  selectPrompt: (prompt: Prompt) => void
  lastSelectedId: string | null
  open: boolean
  setOpen: (open: boolean) => void
  createDialogOpen: boolean
  setCreateDialogOpen: (open: boolean) => void
}

const PromptLibraryContext =
  React.createContext<PromptLibraryContextValue | null>(null)

function usePromptLibrary() {
  const ctx = React.useContext(PromptLibraryContext)
  if (!ctx) {
    throw new Error(
      "usePromptLibrary must be used within a PromptLibrary provider",
    )
  }
  return ctx
}

export type PromptLibraryProps = React.PropsWithChildren<{
  prompts?: Prompt[]
  onPromptsChange?: (prompts: Prompt[]) => void
  onSelect?: (prompt: Prompt) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}>

function PromptLibrary({
  prompts: controlledPrompts,
  onPromptsChange,
  onSelect,
  open: controlledOpen,
  onOpenChange,
  children,
}: PromptLibraryProps) {
  const [internalPrompts, setInternalPrompts] = React.useState<Prompt[]>(
    controlledPrompts ?? [],
  )
  const prompts = controlledPrompts ?? internalPrompts

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isOpenControlled = controlledOpen !== undefined
  const open = isOpenControlled ? controlledOpen : uncontrolledOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isOpenControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isOpenControlled, onOpenChange],
  )

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [lastSelectedId, setLastSelectedId] = React.useState<string | null>(
    null,
  )

  const selectPrompt = React.useCallback(
    async (prompt: Prompt) => {
      setLastSelectedId(prompt.id)
      try {
        await navigator.clipboard.writeText(prompt.prompt)
      } catch {
        // Clipboard may be unavailable
      }
      setOpen(false)
      onSelect?.(prompt)
    },
    [setOpen, onSelect],
  )

  const addCustom = React.useCallback(
    (prompt: Omit<Prompt, "id" | "isCustom">) => {
      const newPrompt: Prompt = {
        ...prompt,
        id: makeId("custom"),
        isCustom: true,
      }
      if (controlledPrompts) {
        onPromptsChange?.([...controlledPrompts, newPrompt])
      } else {
        setInternalPrompts((prev) => [...prev, newPrompt])
      }
    },
    [controlledPrompts, onPromptsChange],
  )

  const removeCustom = React.useCallback(
    (id: string) => {
      if (controlledPrompts) {
        onPromptsChange?.(controlledPrompts.filter((p) => p.id !== id))
      } else {
        setInternalPrompts((prev) => prev.filter((p) => p.id !== id))
      }
    },
    [controlledPrompts, onPromptsChange],
  )

  const value = React.useMemo<PromptLibraryContextValue>(
    () => ({
      prompts,
      addCustom,
      removeCustom,
      selectPrompt,
      lastSelectedId,
      open,
      setOpen,
      createDialogOpen,
      setCreateDialogOpen,
    }),
    [
      prompts,
      addCustom,
      removeCustom,
      selectPrompt,
      lastSelectedId,
      open,
      setOpen,
      createDialogOpen,
    ],
  )

  return (
    <PromptLibraryContext.Provider value={value}>
      <Popover onOpenChange={setOpen} open={open}>
        <span data-slot="prompt-library" className="contents">
          {children}
        </span>
      </Popover>
    </PromptLibraryContext.Provider>
  )
}

export type PromptLibraryTriggerProps = React.ComponentProps<typeof Button> & {
  label?: React.ReactNode
}

function PromptLibraryTrigger({
  className,
  label,
  children,
  ...props
}: PromptLibraryTriggerProps) {
  return (
    <PopoverTrigger asChild>
      <Button
        data-slot="prompt-library-trigger"
        className={cn("gap-1.5", className)}
        size="sm"
        type="button"
        variant="ghost"
        {...props}
      >
        {children ?? (
          <>
            <HugeiconsIcon
              className="size-3.5"
              icon={LibraryIcon}
              strokeWidth={2}
            />
            {label ?? "Prompts"}
          </>
        )}
      </Button>
    </PopoverTrigger>
  )
}

export type PromptLibraryContentProps = React.ComponentProps<
  typeof PopoverContent
>

function PromptLibraryContent({
  className,
  children,
  ...props
}: PromptLibraryContentProps) {
  return (
    <PopoverContent
      align="start"
      className={cn("w-80 p-0", className)}
      side="top"
      sideOffset={8}
      {...props}
    >
      <Command data-slot="prompt-library-content">{children}</Command>
    </PopoverContent>
  )
}

export type PromptLibrarySearchProps = React.ComponentProps<typeof CommandInput>

function PromptLibrarySearch({
  placeholder = "Search prompts...",
  ...props
}: PromptLibrarySearchProps) {
  return (
    <CommandInput
      data-slot="prompt-library-search"
      placeholder={placeholder}
      {...props}
    />
  )
}

export type PromptLibraryListProps = React.ComponentProps<typeof CommandList>

function PromptLibraryList({
  className,
  children,
  ...props
}: PromptLibraryListProps) {
  return (
    <CommandList
      className={cn("max-h-64", className)}
      data-slot="prompt-library-list"
      {...props}
    >
      {children}
    </CommandList>
  )
}

export type PromptLibraryEmptyProps = React.ComponentProps<typeof CommandEmpty>

function PromptLibraryEmpty({
  children = "No prompts found.",
  className,
  ...props
}: PromptLibraryEmptyProps) {
  return (
    <CommandEmpty
      className={cn("text-muted-foreground", className)}
      data-slot="prompt-library-empty"
      {...props}
    >
      {children}
    </CommandEmpty>
  )
}

export type PromptLibraryCategoryProps = React.ComponentProps<
  typeof CommandGroup
>

function PromptLibraryCategory({
  className,
  ...props
}: PromptLibraryCategoryProps) {
  return (
    <CommandGroup
      className={cn(className)}
      data-slot="prompt-library-category"
      {...props}
    />
  )
}

export type PromptLibrarySeparatorProps = React.ComponentProps<"div">

function PromptLibrarySeparator({
  className,
  ...props
}: PromptLibrarySeparatorProps) {
  return (
    <CommandSeparator
      className={cn(className)}
      data-slot="prompt-library-separator"
      {...props}
    />
  )
}

export type PromptLibraryItemProps = Omit<
  React.ComponentProps<typeof CommandItem>,
  "value" | "onSelect"
> & {
  prompt: Prompt
  disablePreview?: boolean
}

function PromptLibraryItem({
  prompt,
  disablePreview = false,
  className,
  children,
  ...props
}: PromptLibraryItemProps) {
  const { selectPrompt, lastSelectedId } = usePromptLibrary()
  const isLastSelected = lastSelectedId === prompt.id

  const handleSelect = () => {
    selectPrompt(prompt)
  }

  const itemContent = (
    <CommandItem
      className={cn(
        "flex cursor-pointer items-start gap-3 py-2",
        isLastSelected && "bg-muted/60",
        className,
      )}
      data-slot="prompt-library-item"
      data-state={isLastSelected ? "selected" : "idle"}
      onSelect={handleSelect}
      value={prompt.title}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {children ?? (
          <>
            <PromptLibraryItemTitle>{prompt.title}</PromptLibraryItemTitle>
            <PromptLibraryItemDescription>
              {prompt.description}
            </PromptLibraryItemDescription>
          </>
        )}
      </div>
      {prompt.category ? (
        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-primary">
          {prompt.category}
        </span>
      ) : null}
    </CommandItem>
  )

  if (disablePreview || !prompt.prompt) {
    return itemContent
  }

  return (
    <PromptLibraryPreview prompt={prompt}>{itemContent}</PromptLibraryPreview>
  )
}

export type PromptLibraryItemTitleProps = React.ComponentProps<"span">

function PromptLibraryItemTitle({
  className,
  ...props
}: PromptLibraryItemTitleProps) {
  return (
    <span
      className={cn("text-xs font-medium text-foreground", className)}
      data-slot="prompt-library-item-title"
      {...props}
    />
  )
}

export type PromptLibraryItemDescriptionProps = React.ComponentProps<"span">

function PromptLibraryItemDescription({
  className,
  ...props
}: PromptLibraryItemDescriptionProps) {
  return (
    <span
      className={cn("line-clamp-2 text-xs text-muted-foreground", className)}
      data-slot="prompt-library-item-description"
      {...props}
    />
  )
}

export interface PromptLibraryPreviewProps {
  prompt: Prompt
  children: React.ReactNode
}

function PromptLibraryPreview({ prompt, children }: PromptLibraryPreviewProps) {
  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-80"
        data-slot="prompt-library-preview"
        side="right"
        sideOffset={8}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{prompt.title}</span>
            <span className="text-xs text-muted-foreground">
              {prompt.description}
            </span>
          </div>
          {prompt.prompt && (
            <div className="rounded-md bg-muted/50 p-2">
              <p className="line-clamp-6 text-xs whitespace-pre-wrap text-muted-foreground">
                {prompt.prompt}
              </p>
            </div>
          )}
          {prompt.category && (
            <span className="inline-flex w-fit rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-primary">
              {prompt.category}
            </span>
          )}
          {prompt.isCustom && (
            <span className="text-[0.625rem] text-muted-foreground">
              Custom prompt
            </span>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

export type PromptLibraryFooterProps = React.ComponentProps<"div">

function PromptLibraryFooter({
  className,
  children,
  ...props
}: PromptLibraryFooterProps) {
  return (
    <div
      className={cn("border-t p-1", className)}
      data-slot="prompt-library-footer"
      {...props}
    >
      {children}
    </div>
  )
}

export type PromptLibraryCreateTriggerProps = Omit<
  React.ComponentProps<typeof CommandItem>,
  "onSelect"
> & {
  label?: React.ReactNode
}

function PromptLibraryCreateTrigger({
  label = "New Prompt",
  className,
  children,
  ...props
}: PromptLibraryCreateTriggerProps) {
  const { setCreateDialogOpen, setOpen } = usePromptLibrary()

  const handleSelect = () => {
    setOpen(false)
    setCreateDialogOpen(true)
  }

  return (
    <CommandItem
      className={cn(
        "flex cursor-pointer items-center gap-2 text-muted-foreground",
        className,
      )}
      data-slot="prompt-library-create-trigger"
      onSelect={handleSelect}
      value="__new_prompt__"
      {...props}
    >
      {children ?? (
        <>
          <HugeiconsIcon
            className="size-3.5"
            icon={PlusSignIcon}
            strokeWidth={2}
          />
          {label}
        </>
      )}
    </CommandItem>
  )
}

export type PromptLibraryCreateDialogProps = Omit<
  React.ComponentProps<typeof Dialog>,
  "open" | "onOpenChange" | "children"
> & {
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
}

function PromptLibraryCreateDialog({
  title = "Create Prompt",
  description = "Create a custom prompt template for quick access.",
  children,
  ...props
}: PromptLibraryCreateDialogProps) {
  const { createDialogOpen, setCreateDialogOpen, addCustom } =
    usePromptLibrary()
  const [formTitle, setFormTitle] = React.useState("")
  const [formDescription, setFormDescription] = React.useState("")
  const [formPrompt, setFormPrompt] = React.useState("")
  const [formCategory, setFormCategory] = React.useState("")

  const resetForm = () => {
    setFormTitle("")
    setFormDescription("")
    setFormPrompt("")
    setFormCategory("")
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!(formTitle.trim() && formDescription.trim() && formPrompt.trim())) {
      return
    }
    const trimmedCategory = formCategory.trim()
    addCustom({
      title: formTitle.trim(),
      description: formDescription.trim(),
      prompt: formPrompt.trim(),
      ...(trimmedCategory ? { category: trimmedCategory } : {}),
    })
    resetForm()
    setCreateDialogOpen(false)
  }

  const handleOpenChange = (open: boolean) => {
    setCreateDialogOpen(open)
    if (!open) resetForm()
  }

  return (
    <Dialog
      data-slot="prompt-library-create-dialog"
      onOpenChange={handleOpenChange}
      open={createDialogOpen}
      {...props}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ?? (
          <form
            className="flex flex-col gap-4"
            data-slot="prompt-library-create-form"
            onSubmit={handleSubmit}
          >
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium" htmlFor="prompt-title">
                Title
              </label>
              <Input
                id="prompt-title"
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g., Code Review"
                required
                value={formTitle}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="text-xs font-medium"
                htmlFor="prompt-description"
              >
                Description
              </label>
              <Input
                id="prompt-description"
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g., Review code for best practices"
                required
                value={formDescription}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium" htmlFor="prompt-content">
                Prompt
              </label>
              <Textarea
                className="min-h-24 resize-none"
                id="prompt-content"
                onChange={(e) => setFormPrompt(e.target.value)}
                placeholder="Enter the prompt text..."
                required
                value={formPrompt}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium" htmlFor="prompt-category">
                Category (optional)
              </label>
              <Input
                id="prompt-category"
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="e.g., Development"
                value={formCategory}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export {
  PromptLibrary,
  PromptLibraryCategory,
  PromptLibraryContent,
  PromptLibraryCreateDialog,
  PromptLibraryCreateTrigger,
  PromptLibraryEmpty,
  PromptLibraryFooter,
  PromptLibraryItem,
  PromptLibraryItemDescription,
  PromptLibraryItemTitle,
  PromptLibraryList,
  PromptLibraryPreview,
  PromptLibrarySearch,
  PromptLibrarySeparator,
  PromptLibraryTrigger,
  usePromptLibrary,
}
