"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { Direction, Slot } from "radix-ui"

import { useComposedRefs } from "@workspace/ui/lib/compose-refs"
import { useIsomorphicLayoutEffect } from "@workspace/ui/hooks/use-isomorphic-layout-effect"
import { useLazyRef } from "@workspace/ui/hooks/use-lazy-ref"
import { cn } from "@workspace/ui/lib/utils"

type Dir = "ltr" | "rtl"
type Orientation = "vertical" | "horizontal"
type Variant = "default" | "alternate"
type Status = "completed" | "active" | "pending"

const ROOT_NAME = "Timeline"
const ITEM_NAME = "TimelineItem"
const DOT_NAME = "TimelineDot"
const CONNECTOR_NAME = "TimelineConnector"
const CONTENT_NAME = "TimelineContent"

interface DivProps extends React.ComponentProps<"div"> {
  asChild?: boolean
}

type ItemElement = HTMLDivElement

function itemStatus(itemIndex: number, activeIndex?: number): Status {
  if (activeIndex === undefined) return "pending"
  if (itemIndex < activeIndex) return "completed"
  if (itemIndex === activeIndex) return "active"
  return "pending"
}

function sortedEntries(
  entries: [string, React.RefObject<ItemElement | null>][],
) {
  return entries.sort((a, b) => {
    const elA = a[1].current
    const elB = b[1].current
    if (!elA || !elB) return 0
    const pos = elA.compareDocumentPosition(elB)
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  })
}

interface StoreState {
  items: Map<string, React.RefObject<ItemElement | null>>
}

interface Store {
  subscribe: (cb: () => void) => () => void
  getState: () => StoreState
  notify: () => void
  onItemRegister: (id: string, ref: React.RefObject<ItemElement | null>) => void
  onItemUnregister: (id: string) => void
  getNextItemStatus: (id: string, activeIndex?: number) => Status | undefined
  getItemIndex: (id: string) => number
}

const StoreContext = React.createContext<Store | null>(null)

function useStoreContext(consumer: string) {
  const ctx = React.useContext(StoreContext)
  if (!ctx)
    throw new Error(`\`${consumer}\` must be used within \`${ROOT_NAME}\``)
  return ctx
}

function useStore<T>(selector: (store: Store) => T): T {
  const store = useStoreContext("useStore")
  const getSnapshot = React.useCallback(
    () => selector(store),
    [store, selector],
  )
  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

interface TimelineContextValue {
  dir: Dir
  orientation: Orientation
  variant: Variant
  activeIndex?: number
}

const TimelineContext = React.createContext<TimelineContextValue | null>(null)

function useTimelineContext(consumer: string) {
  const ctx = React.useContext(TimelineContext)
  if (!ctx)
    throw new Error(`\`${consumer}\` must be used within \`${ROOT_NAME}\``)
  return ctx
}

const timelineVariants = cva(
  "relative flex [--timeline-connector-thickness:0.125rem] [--timeline-dot-size:0.875rem]",
  {
    variants: {
      orientation: {
        vertical: "flex-col",
        horizontal: "flex-row items-start",
      },
      variant: {
        default: "",
        alternate: "",
      },
    },
    compoundVariants: [
      { orientation: "vertical", variant: "default", class: "gap-6" },
      { orientation: "horizontal", variant: "default", class: "gap-8" },
      {
        orientation: "vertical",
        variant: "alternate",
        class: "relative w-full gap-3",
      },
      {
        orientation: "horizontal",
        variant: "alternate",
        class: "items-center gap-4",
      },
    ],
    defaultVariants: { orientation: "vertical", variant: "default" },
  },
)

interface TimelineProps extends DivProps {
  dir?: Dir
  orientation?: Orientation
  variant?: Variant
  activeIndex?: number
}

function Timeline({
  orientation = "vertical",
  variant = "default",
  dir: dirProp,
  activeIndex,
  asChild,
  className,
  ...rootProps
}: TimelineProps) {
  const dir = Direction.useDirection(dirProp)

  const listenersRef = useLazyRef(() => new Set<() => void>())
  const stateRef = useLazyRef<StoreState>(() => ({ items: new Map() }))

  const store = React.useMemo<Store>(() => {
    return {
      subscribe: (cb) => {
        listenersRef.current.add(cb)
        return () => {
          listenersRef.current.delete(cb)
        }
      },
      getState: () => stateRef.current,
      notify: () => {
        for (const cb of listenersRef.current) cb()
      },
      onItemRegister: (id, ref) => {
        stateRef.current.items.set(id, ref)
        store.notify()
      },
      onItemUnregister: (id) => {
        stateRef.current.items.delete(id)
        store.notify()
      },
      getNextItemStatus: (id, activeIdx) => {
        const entries = Array.from(stateRef.current.items.entries())
        const sorted = sortedEntries(entries)
        const currentIndex = sorted.findIndex(([key]) => key === id)
        if (currentIndex === -1 || currentIndex === sorted.length - 1) {
          return undefined
        }
        return itemStatus(currentIndex + 1, activeIdx)
      },
      getItemIndex: (id) => {
        const entries = Array.from(stateRef.current.items.entries())
        const sorted = sortedEntries(entries)
        return sorted.findIndex(([key]) => key === id)
      },
    }
  }, [listenersRef, stateRef])

  const ctxValue = React.useMemo<TimelineContextValue>(() => {
    const v: TimelineContextValue = { dir, orientation, variant }
    if (activeIndex !== undefined) v.activeIndex = activeIndex
    return v
  }, [dir, orientation, variant, activeIndex])

  const Comp = asChild ? Slot.Root : "div"

  return (
    <StoreContext.Provider value={store}>
      <TimelineContext.Provider value={ctxValue}>
        <Comp
          role="list"
          aria-orientation={orientation}
          data-slot="timeline"
          data-orientation={orientation}
          data-variant={variant}
          dir={dir}
          {...rootProps}
          className={cn(timelineVariants({ orientation, variant, className }))}
        />
      </TimelineContext.Provider>
    </StoreContext.Provider>
  )
}

interface TimelineItemContextValue {
  id: string
  status: Status
  isAlternateRight: boolean
}

const TimelineItemContext =
  React.createContext<TimelineItemContextValue | null>(null)

function useTimelineItemContext(consumer: string) {
  const ctx = React.useContext(TimelineItemContext)
  if (!ctx)
    throw new Error(`\`${consumer}\` must be used within \`${ITEM_NAME}\``)
  return ctx
}

const timelineItemVariants = cva("relative flex", {
  variants: {
    orientation: { vertical: "", horizontal: "" },
    variant: { default: "", alternate: "" },
    isAlternateRight: { true: "", false: "" },
  },
  compoundVariants: [
    {
      orientation: "vertical",
      variant: "default",
      class: "gap-3 pb-8 last:pb-0",
    },
    {
      orientation: "horizontal",
      variant: "default",
      class: "flex-col gap-3",
    },
    {
      orientation: "vertical",
      variant: "alternate",
      isAlternateRight: false,
      class: "w-1/2 gap-3 pr-6 pb-12 last:pb-0",
    },
    {
      orientation: "vertical",
      variant: "alternate",
      isAlternateRight: true,
      class: "ml-auto w-1/2 flex-row-reverse gap-3 pb-12 pl-6 last:pb-0",
    },
    {
      orientation: "horizontal",
      variant: "alternate",
      class: "grid min-w-0 grid-rows-[1fr_auto_1fr] gap-3",
    },
  ],
  defaultVariants: {
    orientation: "vertical",
    variant: "default",
    isAlternateRight: false,
  },
})

function TimelineItem({ asChild, className, id, ref, ...itemProps }: DivProps) {
  const { dir, orientation, variant, activeIndex } =
    useTimelineContext(ITEM_NAME)
  const store = useStoreContext(ITEM_NAME)

  const instanceId = React.useId()
  const itemId = id ?? instanceId
  const itemRef = React.useRef<ItemElement | null>(null)
  const composedRef = useComposedRefs(ref, itemRef)

  const itemIndex = useStore((state) => state.getItemIndex(itemId))
  const status = React.useMemo<Status>(
    () => itemStatus(itemIndex, activeIndex),
    [activeIndex, itemIndex],
  )

  useIsomorphicLayoutEffect(() => {
    store.onItemRegister(itemId, itemRef)
    return () => {
      store.onItemUnregister(itemId)
    }
  }, [id, store])

  const isAlternateRight = variant === "alternate" && itemIndex % 2 === 1

  const ctxValue = React.useMemo<TimelineItemContextValue>(
    () => ({ id: itemId, status, isAlternateRight }),
    [itemId, status, isAlternateRight],
  )

  const Comp = asChild ? Slot.Root : "div"

  return (
    <TimelineItemContext.Provider value={ctxValue}>
      <Comp
        role="listitem"
        aria-current={status === "active" ? "step" : undefined}
        data-slot="timeline-item"
        data-status={status}
        data-orientation={orientation}
        data-alternate-right={isAlternateRight ? "" : undefined}
        id={itemId}
        dir={dir}
        {...itemProps}
        ref={composedRef}
        className={cn(
          timelineItemVariants({
            orientation,
            variant,
            isAlternateRight,
            className,
          }),
        )}
      />
    </TimelineItemContext.Provider>
  )
}

const timelineContentVariants = cva("flex-1", {
  variants: {
    orientation: { vertical: "", horizontal: "" },
    variant: { default: "", alternate: "" },
    isAlternateRight: { true: "", false: "" },
  },
  compoundVariants: [
    {
      variant: "alternate",
      orientation: "vertical",
      isAlternateRight: false,
      class: "text-right",
    },
    {
      variant: "alternate",
      orientation: "horizontal",
      isAlternateRight: false,
      class: "row-start-3 pt-2",
    },
    {
      variant: "alternate",
      orientation: "horizontal",
      isAlternateRight: true,
      class: "row-start-1 pb-2",
    },
  ],
  defaultVariants: {
    orientation: "vertical",
    variant: "default",
    isAlternateRight: false,
  },
})

function TimelineContent({ asChild, className, ...contentProps }: DivProps) {
  const { variant, orientation } = useTimelineContext(CONTENT_NAME)
  const { status, isAlternateRight } = useTimelineItemContext(CONTENT_NAME)
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="timeline-content"
      data-status={status}
      {...contentProps}
      className={cn(
        timelineContentVariants({
          orientation,
          variant,
          isAlternateRight,
          className,
        }),
      )}
    />
  )
}

const timelineDotVariants = cva(
  "relative z-10 flex size-[var(--timeline-dot-size)] shrink-0 items-center justify-center rounded-full border-2 bg-background",
  {
    variants: {
      status: {
        completed: "border-primary",
        active: "border-primary",
        pending: "border-border",
      },
      orientation: { vertical: "", horizontal: "" },
      variant: { default: "", alternate: "" },
      isAlternateRight: { true: "", false: "" },
    },
    compoundVariants: [
      {
        variant: "alternate",
        orientation: "vertical",
        isAlternateRight: false,
        class:
          "absolute -right-[calc(var(--timeline-dot-size)/2-var(--timeline-connector-thickness)/2)] bg-background",
      },
      {
        variant: "alternate",
        orientation: "vertical",
        isAlternateRight: true,
        class:
          "absolute -left-[calc(var(--timeline-dot-size)/2-var(--timeline-connector-thickness)/2)] bg-background",
      },
      {
        variant: "alternate",
        orientation: "horizontal",
        class: "row-start-2 bg-background",
      },
      {
        variant: "alternate",
        status: "completed",
        class: "bg-background",
      },
      {
        variant: "alternate",
        status: "active",
        class: "bg-background",
      },
    ],
    defaultVariants: {
      status: "pending",
      orientation: "vertical",
      variant: "default",
      isAlternateRight: false,
    },
  },
)

function TimelineDot({ asChild, className, ...dotProps }: DivProps) {
  const { orientation, variant } = useTimelineContext(DOT_NAME)
  const { status, isAlternateRight } = useTimelineItemContext(DOT_NAME)
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="timeline-dot"
      data-status={status}
      data-orientation={orientation}
      {...dotProps}
      className={cn(
        timelineDotVariants({
          status,
          orientation,
          variant,
          isAlternateRight,
          className,
        }),
      )}
    />
  )
}

const timelineConnectorVariants = cva("absolute z-0", {
  variants: {
    isCompleted: { true: "bg-primary", false: "bg-border" },
    orientation: { vertical: "", horizontal: "" },
    variant: { default: "", alternate: "" },
    isAlternateRight: { true: "", false: "" },
  },
  compoundVariants: [
    {
      orientation: "vertical",
      variant: "default",
      class:
        "start-[calc(var(--timeline-dot-size)/2-var(--timeline-connector-thickness)/2)] top-3 h-[calc(100%+0.5rem)] w-[var(--timeline-connector-thickness)]",
    },
    {
      orientation: "horizontal",
      variant: "default",
      class:
        "start-3 top-[calc(var(--timeline-dot-size)/2-var(--timeline-connector-thickness)/2)] h-[var(--timeline-connector-thickness)] w-[calc(100%+0.5rem)]",
    },
    {
      orientation: "vertical",
      variant: "alternate",
      isAlternateRight: false,
      class:
        "top-2 -right-[calc(var(--timeline-connector-thickness)/2)] h-full w-[var(--timeline-connector-thickness)]",
    },
    {
      orientation: "vertical",
      variant: "alternate",
      isAlternateRight: true,
      class:
        "top-2 -left-[calc(var(--timeline-connector-thickness)/2)] h-full w-[var(--timeline-connector-thickness)]",
    },
    {
      orientation: "horizontal",
      variant: "alternate",
      class:
        "top-[calc(var(--timeline-dot-size)/2-var(--timeline-connector-thickness)/2)] left-3 row-start-2 h-[var(--timeline-connector-thickness)] w-[calc(100%+0.5rem)]",
    },
  ],
  defaultVariants: {
    isCompleted: false,
    orientation: "vertical",
    variant: "default",
    isAlternateRight: false,
  },
})

interface TimelineConnectorProps extends DivProps {
  forceMount?: boolean
}

function TimelineConnector({
  asChild,
  forceMount,
  className,
  ...connectorProps
}: TimelineConnectorProps) {
  const { orientation, variant, activeIndex } =
    useTimelineContext(CONNECTOR_NAME)
  const { id, status, isAlternateRight } =
    useTimelineItemContext(CONNECTOR_NAME)

  const nextStatus = useStore((state) =>
    state.getNextItemStatus(id, activeIndex),
  )

  const isLast = nextStatus === undefined
  if (!forceMount && isLast) return null

  const isConnectorCompleted =
    nextStatus === "completed" || nextStatus === "active"
  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      aria-hidden="true"
      data-slot="timeline-connector"
      data-completed={isConnectorCompleted ? "" : undefined}
      data-status={status}
      data-orientation={orientation}
      {...connectorProps}
      className={cn(
        timelineConnectorVariants({
          isCompleted: isConnectorCompleted,
          orientation,
          variant,
          isAlternateRight,
          className,
        }),
      )}
    />
  )
}

function TimelineHeader({ asChild, className, ...headerProps }: DivProps) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="timeline-header"
      {...headerProps}
      className={cn("flex flex-col gap-1", className)}
    />
  )
}

function TimelineTitle({ asChild, className, ...titleProps }: DivProps) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="timeline-title"
      {...titleProps}
      className={cn("leading-none font-semibold", className)}
    />
  )
}

function TimelineDescription({
  asChild,
  className,
  ...descriptionProps
}: DivProps) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="timeline-description"
      {...descriptionProps}
      className={cn("text-sm text-muted-foreground", className)}
    />
  )
}

interface TimelineTimeProps extends React.ComponentProps<"time"> {
  asChild?: boolean
}

function TimelineTime({ asChild, className, ...timeProps }: TimelineTimeProps) {
  const Comp = asChild ? Slot.Root : "time"
  return (
    <Comp
      data-slot="timeline-time"
      {...timeProps}
      className={cn("text-xs text-muted-foreground", className)}
    />
  )
}

export {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
}
export type { TimelineProps }
