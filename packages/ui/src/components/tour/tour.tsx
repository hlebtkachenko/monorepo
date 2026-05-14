"use client"

import * as React from "react"
import * as ReactDOM from "react-dom"
import {
  autoUpdate,
  flip,
  limitShift,
  offset,
  arrow as onArrow,
  type Middleware,
  type Placement,
  shift,
  useFloating,
} from "@floating-ui/react-dom"
import { ChevronLeft, ChevronRight, X } from "@workspace/ui/lib/icons"
import {
  Direction as DirectionPrimitive,
  Slot as SlotPrimitive,
} from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"
import { useComposedRefs } from "@workspace/ui/lib/compose-refs"
import { useAsRef } from "@workspace/ui/hooks/use-as-ref"
import { useIsomorphicLayoutEffect } from "@workspace/ui/hooks/use-isomorphic-layout-effect"
import { useLazyRef } from "@workspace/ui/hooks/use-lazy-ref"
import { Button } from "@workspace/ui/components/button"

const ROOT_NAME = "Tour"
const STEP_NAME = "TourStep"
const ARROW_NAME = "TourArrow"
const HEADER_NAME = "TourHeader"
const TITLE_NAME = "TourTitle"
const DESCRIPTION_NAME = "TourDescription"
const CLOSE_NAME = "TourClose"
const PREV_NAME = "TourPrev"
const NEXT_NAME = "TourNext"

const DEFAULT_ALIGN_OFFSET = 0
const DEFAULT_SIDE_OFFSET = 16
const DEFAULT_SPOTLIGHT_PADDING = 4

const SIDE_OPTIONS = ["top", "right", "bottom", "left"] as const
const ALIGN_OPTIONS = ["start", "center", "end"] as const

type Side = (typeof SIDE_OPTIONS)[number]
type Align = (typeof ALIGN_OPTIONS)[number]
type Direction = "ltr" | "rtl"

const OPPOSITE_SIDE: Record<Side, Side> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
}

interface DivProps extends React.ComponentProps<"div"> {
  asChild?: boolean
}

interface StepData {
  target: string | React.RefObject<HTMLElement> | HTMLElement
  align?: Align
  alignOffset?: number
  side?: Side
  sideOffset?: number
  avoidCollisions?: boolean
  sticky?: "partial" | "always"
}

interface SpotlightRect {
  x: number
  y: number
  width: number
  height: number
}

interface StoreState {
  open: boolean
  value: number
  steps: StepData[]
  maskPath: string
  spotlightRect: SpotlightRect | null
}

interface Store {
  subscribe: (callback: () => void) => () => void
  getState: () => StoreState
  setState: <K extends keyof StoreState>(key: K, value: StoreState[K]) => void
  notify: () => void
  addStep: (stepData: StepData) => { id: string; index: number }
  removeStep: (id: string) => void
}

const StoreContext = React.createContext<Store | null>(null)

function useStoreContext(consumerName: string) {
  const context = React.useContext(StoreContext)
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``)
  }
  return context
}

function useStore<T>(
  selector: (state: StoreState) => T,
  ogStore?: Store | null,
): T {
  const contextStore = React.useContext(StoreContext)
  const store = ogStore ?? contextStore

  if (!store) {
    throw new Error(`\`useStore\` must be used within \`${ROOT_NAME}\``)
  }

  const getSnapshot = React.useCallback(
    () => selector(store.getState()),
    [store, selector],
  )

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

function getTargetElement(
  target: string | React.RefObject<HTMLElement> | HTMLElement,
): HTMLElement | null {
  if (typeof target === "string") {
    // Trust boundary: target is a CSS selector supplied by the developer
    // configuring the tour, never by user input. No HTML escaping needed.
    return document.querySelector(target)
  }
  if (target && "current" in target) {
    return target.current
  }
  if (target instanceof HTMLElement) {
    return target
  }
  return null
}

function getSideAndAlignFromPlacement(placement: Placement): [Side, Align] {
  const [side, align = "center"] = placement.split("-") as [Side, Align?]
  return [side, align]
}

function getPlacement(side: Side, align: Align): Placement {
  if (align === "center") {
    return side as Placement
  }
  return `${side}-${align}` as Placement
}

function updateMask(
  store: Store,
  targetElement: HTMLElement,
  padding: number = DEFAULT_SPOTLIGHT_PADDING,
) {
  const clientRect = targetElement.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const x = Math.max(0, clientRect.left - padding)
  const y = Math.max(0, clientRect.top - padding)
  const width = Math.min(viewportWidth - x, clientRect.width + padding * 2)
  const height = Math.min(viewportHeight - y, clientRect.height + padding * 2)

  const path = `polygon(0% 0%, 0% 100%, ${x}px 100%, ${x}px ${y}px, ${x + width}px ${y}px, ${x + width}px ${y + height}px, ${x}px ${y + height}px, ${x}px 100%, 100% 100%, 100% 0%)`
  store.setState("maskPath", path)
  store.setState("spotlightRect", { x, y, width, height })
}

interface TourContextValue {
  dir: Direction
  alignOffset: number
  sideOffset: number
  spotlightPadding: number
  dismissible: boolean
  modal: boolean
}

const TourContext = React.createContext<TourContextValue | null>(null)

function useTourContext(consumerName: string) {
  const context = React.useContext(TourContext)
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``)
  }
  return context
}

interface StepContextValue {
  arrowX?: number
  arrowY?: number
  placedAlign: Align
  placedSide: Side
  shouldHideArrow: boolean
  onArrowChange: (arrow: HTMLSpanElement | null) => void
}

const StepContext = React.createContext<StepContextValue | null>(null)

function useStepContext(consumerName: string) {
  const context = React.useContext(StepContext)
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${STEP_NAME}\``)
  }
  return context
}

function useScrollLock(enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) return

    const originalStyle = window.getComputedStyle(document.body).overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = originalStyle
    }
  }, [enabled])
}

interface TourProps extends DivProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  value?: number
  defaultValue?: number
  onValueChange?: (step: number) => void
  onComplete?: () => void
  onSkip?: () => void
  dir?: Direction
  alignOffset?: number
  sideOffset?: number
  spotlightPadding?: number
  dismissible?: boolean
  modal?: boolean
}

function Tour({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  value: valueProp,
  defaultValue = 0,
  onValueChange,
  onComplete,
  onSkip,
  dir: dirProp,
  alignOffset = DEFAULT_ALIGN_OFFSET,
  sideOffset = DEFAULT_SIDE_OFFSET,
  spotlightPadding = DEFAULT_SPOTLIGHT_PADDING,
  dismissible = true,
  modal = true,
  asChild,
  ...rootProps
}: TourProps) {
  const dir = DirectionPrimitive.useDirection(dirProp)

  const stateRef = useLazyRef<StoreState>(() => ({
    open: openProp ?? defaultOpen,
    value: valueProp ?? defaultValue,
    steps: [],
    maskPath: "",
    spotlightRect: null,
  }))
  const listenersRef = useLazyRef<Set<() => void>>(() => new Set())
  const stepIdsMapRef = useLazyRef<Map<string, number>>(() => new Map())
  const stepIdCounterRef = useLazyRef(() => ({ current: 0 }))
  const propsRef = useAsRef({
    valueProp,
    onOpenChange,
    onValueChange,
    onComplete,
    onSkip,
  })

  const store: Store = React.useMemo(
    () => ({
      subscribe: (cb) => {
        listenersRef.current.add(cb)
        return () => {
          listenersRef.current.delete(cb)
        }
      },
      getState: () => stateRef.current,
      setState: (key, value) => {
        if (Object.is(stateRef.current[key], value)) return
        stateRef.current[key] = value

        if (key === "open" && typeof value === "boolean") {
          propsRef.current.onOpenChange?.(value)

          if (value) {
            if (stateRef.current.steps.length > 0) {
              if (stateRef.current.value >= stateRef.current.steps.length) {
                store.setState("value", 0)
              }
            }
          } else {
            if (
              stateRef.current.value <
              (stateRef.current.steps.length || 0) - 1
            ) {
              propsRef.current.onSkip?.()
            }
          }
        } else if (key === "value" && typeof value === "number") {
          if (value >= stateRef.current.steps.length) {
            propsRef.current.onComplete?.()

            if (propsRef.current.valueProp !== undefined) {
              propsRef.current.onValueChange?.(value)
            }

            store.setState("open", false)
            return
          }

          if (propsRef.current.valueProp !== undefined) {
            propsRef.current.onValueChange?.(value)
            return
          }

          propsRef.current.onValueChange?.(value)
        }

        store.notify()
      },
      notify: () => {
        listenersRef.current.forEach((l) => {
          l()
        })
      },
      addStep: (stepData) => {
        const id = `step-${stepIdCounterRef.current.current++}`
        const index = stateRef.current.steps.length
        stepIdsMapRef.current.set(id, index)
        stateRef.current.steps = [...stateRef.current.steps, stepData]
        store.notify()
        return { id, index }
      },
      removeStep: (id) => {
        const index = stepIdsMapRef.current.get(id)
        if (index === undefined) return

        stateRef.current.steps = stateRef.current.steps.filter(
          (_, i) => i !== index,
        )
        stepIdsMapRef.current.delete(id)

        for (const [stepId, stepIndex] of stepIdsMapRef.current.entries()) {
          if (stepIndex > index) {
            stepIdsMapRef.current.set(stepId, stepIndex - 1)
          }
        }

        store.notify()
      },
    }),
    [stateRef, listenersRef, stepIdsMapRef, stepIdCounterRef, propsRef],
  )

  const open = useStore((state) => state.open, store)

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (open && event.key === "Escape") {
        store.setState("open", false)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [store, open])

  useIsomorphicLayoutEffect(() => {
    if (openProp !== undefined) {
      store.setState("open", openProp)
    }
  }, [openProp, store])

  useIsomorphicLayoutEffect(() => {
    if (valueProp !== undefined) {
      store.setState("value", valueProp)
    }
  }, [valueProp, store])

  const contextValue = React.useMemo<TourContextValue>(
    () => ({
      dir,
      alignOffset,
      sideOffset,
      spotlightPadding,
      dismissible,
      modal,
    }),
    [dir, alignOffset, sideOffset, spotlightPadding, dismissible, modal],
  )

  useScrollLock(open && modal)

  const RootPrimitive = asChild ? SlotPrimitive.Slot : "div"

  return (
    <StoreContext.Provider value={store}>
      <TourContext.Provider value={contextValue}>
        <RootPrimitive data-slot="tour" dir={dir} {...rootProps} />
      </TourContext.Provider>
    </StoreContext.Provider>
  )
}

interface TourStepProps extends DivProps {
  target: string | React.RefObject<HTMLElement> | HTMLElement
  side?: Side
  sideOffset?: number
  align?: Align
  alignOffset?: number
  sticky?: "partial" | "always"
  avoidCollisions?: boolean
  forceMount?: boolean
}

function TourStep({
  target,
  side = "bottom",
  sideOffset,
  align = "center",
  alignOffset,
  sticky = "partial",
  avoidCollisions = true,
  forceMount = false,
  children,
  className,
  style,
  asChild,
  ...stepProps
}: TourStepProps) {
  const store = useStoreContext(STEP_NAME)

  const [arrow, setArrow] = React.useState<HTMLSpanElement | null>(null)
  const stepRef = React.useRef<HTMLDivElement | null>(null)
  const stepIdRef = React.useRef<string>("")
  const stepOrderRef = React.useRef<number>(-1)

  const open = useStore((state) => state.open)
  const value = useStore((state) => state.value)
  const steps = useStore((state) => state.steps)
  const context = useTourContext(STEP_NAME)

  const resolvedSideOffset = sideOffset ?? context.sideOffset
  const resolvedAlignOffset = alignOffset ?? context.alignOffset

  useIsomorphicLayoutEffect(() => {
    const stepData: StepData = {
      target,
      align,
      alignOffset: resolvedAlignOffset,
      side,
      sideOffset: resolvedSideOffset,
      sticky,
      avoidCollisions,
    }
    const { id, index } = store.addStep(stepData)
    stepIdRef.current = id
    stepOrderRef.current = index

    return () => {
      store.removeStep(stepIdRef.current)
    }
  }, [
    target,
    side,
    resolvedSideOffset,
    align,
    resolvedAlignOffset,
    sticky,
    avoidCollisions,
    store,
  ])

  const stepData = steps[value]
  const targetElement = stepData ? getTargetElement(stepData.target) : null
  const isCurrentStep = stepOrderRef.current === value

  const middleware = React.useMemo(() => {
    if (!stepData) return []

    const mainAxisOffset = stepData.sideOffset ?? resolvedSideOffset
    const crossAxisOffset = stepData.alignOffset ?? resolvedAlignOffset

    return [
      offset({ mainAxis: mainAxisOffset, alignmentAxis: crossAxisOffset }),
      stepData.avoidCollisions &&
        shift({
          mainAxis: true,
          crossAxis: false,
          ...(stepData.sticky === "partial" ? { limiter: limitShift() } : {}),
        }),
      stepData.avoidCollisions && flip(),
      arrow && onArrow({ element: arrow }),
    ].filter(Boolean) as Middleware[]
  }, [stepData, resolvedSideOffset, resolvedAlignOffset, arrow])

  const placement = getPlacement(
    stepData?.side ?? side,
    stepData?.align ?? align,
  )

  const {
    refs,
    floatingStyles,
    placement: finalPlacement,
    middlewareData,
  } = useFloating({
    placement,
    middleware,
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    elements: { reference: targetElement },
  })

  const composedRef = useComposedRefs(refs.setFloating, stepRef)

  const [placedSide, placedAlign] = getSideAndAlignFromPlacement(finalPlacement)
  const arrowX = middlewareData.arrow?.x
  const arrowY = middlewareData.arrow?.y
  const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0

  const stepContextValue = React.useMemo<StepContextValue>(() => {
    const value: StepContextValue = {
      placedAlign,
      placedSide,
      shouldHideArrow: cannotCenterArrow,
      onArrowChange: setArrow,
    }
    if (arrowX !== undefined) value.arrowX = arrowX
    if (arrowY !== undefined) value.arrowY = arrowY
    return value
  }, [arrowX, arrowY, placedSide, placedAlign, cannotCenterArrow])

  React.useEffect(() => {
    if (open && targetElement && isCurrentStep) {
      updateMask(store, targetElement, context.spotlightPadding)

      let rafId: number | null = null

      function onResize() {
        if (targetElement) {
          updateMask(store, targetElement, context.spotlightPadding)
        }
      }

      function onScroll() {
        if (rafId !== null) return
        rafId = requestAnimationFrame(() => {
          if (targetElement) {
            updateMask(store, targetElement, context.spotlightPadding)
          }
          rafId = null
        })
      }

      window.addEventListener("resize", onResize)
      window.addEventListener("scroll", onScroll, { passive: true })
      return () => {
        window.removeEventListener("resize", onResize)
        window.removeEventListener("scroll", onScroll)
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
        }
      }
    }
  }, [open, targetElement, isCurrentStep, store, context.spotlightPadding])

  if (!open || !stepData || (!targetElement && !forceMount) || !isCurrentStep) {
    return null
  }

  const StepPrimitive = asChild ? SlotPrimitive.Slot : "div"

  return (
    <StepContext.Provider value={stepContextValue}>
      <StepPrimitive
        ref={composedRef}
        data-slot="tour-content"
        data-side={placedSide}
        data-align={placedAlign}
        dir={context.dir}
        tabIndex={-1}
        {...stepProps}
        className={cn(
          "fixed z-50 flex w-80 flex-col gap-4 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none",
          className,
        )}
        style={{ ...style, ...floatingStyles }}
      >
        {children}
      </StepPrimitive>
    </StepContext.Provider>
  )
}

interface TourSpotlightProps extends DivProps {
  forceMount?: boolean
}

// Dim overlay disabled by design: the spotlight ring alone is enough,
// and the masked overlay was visually heavy. Component kept as a no-op
// so consumers can compose it without breaking their layouts.
function TourSpotlight(_props: TourSpotlightProps) {
  return null
}

interface TourSpotlightRingProps extends DivProps {
  forceMount?: boolean
}

function TourSpotlightRing({
  asChild,
  className,
  style,
  forceMount = false,
  ...ringProps
}: TourSpotlightRingProps) {
  const open = useStore((state) => state.open)
  const spotlightRect = useStore((state) => state.spotlightRect)

  if (!open && !forceMount) return null
  if (!spotlightRect) return null

  const RingPrimitive = asChild ? SlotPrimitive.Slot : "div"

  return (
    <RingPrimitive
      data-slot="tour-spotlight-ring"
      data-state={open ? "open" : "closed"}
      {...ringProps}
      className={cn(
        "pointer-events-none fixed z-50 rounded-md border-2 border-primary ring-4 ring-primary/30",
        className,
      )}
      style={{
        left: spotlightRect.x,
        top: spotlightRect.y,
        width: spotlightRect.width,
        height: spotlightRect.height,
        borderRadius: "var(--radius)",
        ...style,
      }}
    />
  )
}

interface TourPortalProps {
  children?: React.ReactNode
  container?: HTMLElement | null
}

function TourPortal({ children, container }: TourPortalProps) {
  const [mounted, setMounted] = React.useState(false)

  useIsomorphicLayoutEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const portalContainer = container ?? document.body
  return ReactDOM.createPortal(children, portalContainer)
}

interface TourTooltipProps extends DivProps {}

function TourTooltip({ className, ...props }: TourTooltipProps) {
  return (
    <div
      data-slot="tour-tooltip"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  )
}

interface TourArrowProps extends React.ComponentProps<"svg"> {
  width?: number
  height?: number
  asChild?: boolean
}

function TourArrow({
  width = 10,
  height = 5,
  className,
  children,
  asChild,
  ...arrowProps
}: TourArrowProps) {
  const stepContext = useStepContext(ARROW_NAME)
  const baseSide = OPPOSITE_SIDE[stepContext.placedSide]

  return (
    <span
      ref={stepContext.onArrowChange}
      data-slot="tour-arrow"
      style={{
        position: "absolute",
        left:
          stepContext.arrowX != null ? `${stepContext.arrowX}px` : undefined,
        top: stepContext.arrowY != null ? `${stepContext.arrowY}px` : undefined,
        [baseSide]: 0,
        transformOrigin: {
          top: "",
          right: "0 0",
          bottom: "center 0",
          left: "100% 0",
        }[stepContext.placedSide],
        transform: {
          top: "translateY(100%)",
          right: "translateY(50%) rotate(90deg) translateX(-50%)",
          bottom: "rotate(180deg)",
          left: "translateY(50%) rotate(-90deg) translateX(50%)",
        }[stepContext.placedSide],
        visibility: stepContext.shouldHideArrow ? "hidden" : undefined,
      }}
    >
      <svg
        viewBox="0 0 30 10"
        preserveAspectRatio="none"
        width={width}
        height={height}
        {...arrowProps}
        className={cn("block fill-popover stroke-border", className)}
      >
        {asChild ? children : <polygon points="0,0 30,0 15,10" />}
      </svg>
    </span>
  )
}

function TourHeader({ asChild, className, ...headerProps }: DivProps) {
  const context = useTourContext(HEADER_NAME)
  const HeaderPrimitive = asChild ? SlotPrimitive.Slot : "div"

  return (
    <HeaderPrimitive
      data-slot="tour-header"
      dir={context.dir}
      {...headerProps}
      className={cn("flex flex-col gap-1.5", className)}
    />
  )
}

function TourTitle({ asChild, className, ...titleProps }: DivProps) {
  const context = useTourContext(TITLE_NAME)
  const TitlePrimitive = asChild ? SlotPrimitive.Slot : "div"

  return (
    <TitlePrimitive
      data-slot="tour-title"
      dir={context.dir}
      {...titleProps}
      className={cn(
        "text-base leading-none font-semibold tracking-tight",
        className,
      )}
    />
  )
}

function TourDescription({ asChild, className, ...descProps }: DivProps) {
  const context = useTourContext(DESCRIPTION_NAME)
  const DescriptionPrimitive = asChild ? SlotPrimitive.Slot : "div"

  return (
    <DescriptionPrimitive
      data-slot="tour-description"
      dir={context.dir}
      {...descProps}
      className={cn("text-sm text-muted-foreground", className)}
    />
  )
}

interface TourActionsProps extends DivProps {}

function TourActions({ asChild, className, ...props }: TourActionsProps) {
  const context = useTourContext(HEADER_NAME)
  const ActionsPrimitive = asChild ? SlotPrimitive.Slot : "div"

  return (
    <ActionsPrimitive
      data-slot="tour-actions"
      dir={context.dir}
      {...props}
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
    />
  )
}

interface TourCloseProps extends React.ComponentProps<"button"> {
  asChild?: boolean
}

function TourClose({
  asChild,
  className,
  onClick: onClickProp,
  ...closeButtonProps
}: TourCloseProps) {
  const store = useStoreContext(CLOSE_NAME)

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClickProp?.(event)
      if (event.defaultPrevented) return
      store.setState("open", false)
    },
    [store, onClickProp],
  )

  const ClosePrimitive = asChild ? SlotPrimitive.Slot : "button"

  return (
    <ClosePrimitive
      type="button"
      aria-label="Close tour"
      data-slot="tour-close"
      className={cn(
        "absolute top-3 right-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      onClick={onClick}
      {...closeButtonProps}
    >
      <X />
    </ClosePrimitive>
  )
}

function TourPrev({
  children,
  onClick: onClickProp,
  ...prevButtonProps
}: React.ComponentProps<typeof Button>) {
  const store = useStoreContext(PREV_NAME)
  const value = useStore((state) => state.value)

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClickProp?.(event)
      if (event.defaultPrevented) return
      if (value > 0) {
        store.setState("value", value - 1)
      }
    },
    [value, store, onClickProp],
  )

  return (
    <Button
      type="button"
      aria-label="Previous step"
      data-slot="tour-prev"
      variant="outline"
      size="sm"
      {...prevButtonProps}
      onClick={onClick}
      disabled={value === 0}
    >
      {children ?? (
        <>
          <ChevronLeft />
          Previous
        </>
      )}
    </Button>
  )
}

function TourNext({
  children,
  onClick: onClickProp,
  ...nextButtonProps
}: React.ComponentProps<typeof Button>) {
  const store = useStoreContext(NEXT_NAME)
  const value = useStore((state) => state.value)
  const steps = useStore((state) => state.steps)

  const isLastStep = value === steps.length - 1

  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClickProp?.(event)
      if (event.defaultPrevented) return
      store.setState("value", value + 1)
    },
    [value, store, onClickProp],
  )

  return (
    <Button
      type="button"
      aria-label={isLastStep ? "Finish tour" : "Next step"}
      data-slot="tour-next"
      size="sm"
      {...nextButtonProps}
      onClick={onClick}
    >
      {children ?? (
        <>
          {isLastStep ? "Finish" : "Next"}
          {!isLastStep && <ChevronRight />}
        </>
      )}
    </Button>
  )
}

interface TourProgressProps extends DivProps {
  format?: (current: number, total: number) => string
}

function TourProgress({
  format = (current, total) => `${current} / ${total}`,
  asChild,
  className,
  children,
  ...progressProps
}: TourProgressProps) {
  const value = useStore((state) => state.value)
  const steps = useStore((state) => state.steps)

  const ProgressPrimitive = asChild ? SlotPrimitive.Slot : "div"

  return (
    <ProgressPrimitive
      data-slot="tour-progress"
      {...progressProps}
      className={cn("text-sm text-muted-foreground", className)}
    >
      {children ?? format(value + 1, steps.length)}
    </ProgressPrimitive>
  )
}

export {
  Tour,
  TourActions,
  TourArrow,
  TourClose,
  TourDescription,
  TourHeader,
  TourNext,
  TourPortal,
  TourPrev,
  TourProgress,
  type TourProps,
  TourSpotlight,
  TourSpotlightRing,
  TourStep,
  TourTitle,
  TourTooltip,
}
