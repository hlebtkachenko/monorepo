"use client"

import * as React from "react"

import type {
  InspectorBadge,
  InspectorCopyTarget,
  InspectorFlagValue,
  InspectorFooterProps,
  InspectorTab,
} from "@workspace/ui/blocks/inspector-sheet"

/**
 * Inspector-rail seam between the persistent shell and the active page — the
 * same portal-of-state idea as `AppPageHeader`, but for the right-docked record
 * inspector.
 *
 * The shell owns the LAYOUT of the inspector rail (a full-height `<aside>` that
 * shrinks the content beside it, its own resize/collapse/Escape handling, no
 * scrim — rendered inside AppBody, filled with an `InspectorSheet`). But WHETHER
 * it's open, and the record data/actions shown inside it, are the active page's
 * concern (a table row's maximize affordance lives deep in the archetype). A
 * page publishes that state through this context; AppBody's aside consumes it.
 *
 * Two contexts, deliberately: a STABLE publish fn (page side) and the STATE
 * (aside side). Splitting them keeps `AppInspectorRail` from re-rendering when it
 * publishes.
 */
interface InspectorRailState {
  /** Whether the rail is shown (drives the aside's presence + layout width). */
  open: boolean
  /** Exactly two ancestor crumbs for the sheet header. */
  breadcrumb: readonly [string, string]
  /** Editable record name shown in the body header. */
  name: string
  /** Optional posting-status badge shown next to the name. */
  badge?: InspectorBadge
  /** Optional sticky decline/approve footer for the sheet. */
  footer?: InspectorFooterProps
  /** Record flag/tone value shown in the body header. */
  flag: InspectorFlagValue
  /** Active rail tab. Owned by `AppInspectorRail` (resets per `recordKey`). */
  activeTab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  /** Per-tab body content. The sheet renders `content[activeTab]`. */
  content?: Partial<Record<InspectorTab, React.ReactNode>>
  onPrevious?: () => void
  onNext?: () => void
  onCopy?: (what: InspectorCopyTarget) => void
  onSwitchLayout?: () => void
  /** Dismiss handler wired by the page; the sheet's close button calls it. */
  onClose: () => void
  onNameChange: (name: string) => void
  onFlagChange: (flag: InspectorFlagValue) => void
}

/**
 * True when a real transient overlay (dropdown menu, popover, dialog, select
 * / combobox trigger) is open — as opposed to an ordinary persistent
 * disclosure like a Collapsible or Accordion, which also carries
 * `data-state="open"` + `aria-expanded="true"` but isn't an overlay.
 */
function hasOpenTransientOverlay(): boolean {
  return Boolean(
    document.querySelector(
      '[data-state="open"][aria-haspopup]:not([aria-haspopup="false"]), [data-state="open"][role="combobox"]',
    ),
  )
}

const NOOP = () => {}
const DEFAULT_FLAG: InspectorFlagValue = { tone: "none" }
const CLOSED: InspectorRailState = {
  open: false,
  breadcrumb: ["", ""],
  name: "",
  flag: DEFAULT_FLAG,
  activeTab: "details",
  onTabChange: NOOP,
  onClose: NOOP,
  onNameChange: NOOP,
  onFlagChange: NOOP,
}

const PublishCtx = React.createContext<
  ((next: Partial<InspectorRailState>) => void) | null
>(null)
const StateCtx = React.createContext<InspectorRailState>(CLOSED)

/** Wraps the shell body so the aside (shell) and the page share rail state. */
export function AppInspectorRailProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [state, setState] = React.useState<InspectorRailState>(CLOSED)
  const publish = React.useCallback(
    (next: Partial<InspectorRailState>) =>
      setState((prev) => ({ ...prev, ...next })),
    [],
  )
  return (
    <PublishCtx.Provider value={publish}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </PublishCtx.Provider>
  )
}

/** Read the current rail state — consumed by AppBody's inspector aside. */
export function useAppInspectorRail(): InspectorRailState {
  return React.useContext(StateCtx)
}

export interface AppInspectorRailProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Exactly two ancestor crumbs shown in the sheet header. */
  breadcrumb: readonly [string, string]
  /** Stable identity of the inspected record. Local tab/name/flag state
   *  resets whenever this changes. */
  recordKey: string
  /** Editable record name. Owned locally unless `onNameChange` is also
   *  supplied, in which case the page also hears every commit. */
  name: string
  /** Optional posting-status badge shown next to the name. */
  badge?: InspectorBadge
  /** Optional sticky decline/approve footer for the sheet. */
  footer?: InspectorFooterProps
  /** Per-tab body content. The sheet renders the active tab's node. */
  content?: Partial<Record<InspectorTab, React.ReactNode>>
  /** Open ON this tab (per request): seeded when a record first opens and applied
   *  when it changes for the same record — e.g. a footer "Open in Inspector ·
   *  Export". `null`/omitted → the default "details" tab. */
  initialTab?: InspectorTab | null
  /** Initial flag value for a record not seen before. Defaults to `none`. */
  initialFlag?: InspectorFlagValue
  onPrevious?: () => void
  onNext?: () => void
  onCopy?: (what: InspectorCopyTarget) => void
  onSwitchLayout?: () => void
  onNameChange?: (name: string) => void
  onFlagChange?: (flag: InspectorFlagValue) => void
}

/**
 * Page-facing control: mount this from the active page to drive the shell's
 * inspector rail. Renders no DOM; it owns local tab/name/flag state (so the
 * sheet is interactive immediately, with no per-page wiring required),
 * resetting that state whenever `recordKey` changes, and publishes it plus
 * the record data + action callbacks up to `AppBody`'s aside.
 */
export function AppInspectorRail({
  open,
  onOpenChange,
  breadcrumb,
  recordKey,
  name,
  badge,
  footer,
  content,
  initialTab = null,
  initialFlag = DEFAULT_FLAG,
  onPrevious,
  onNext,
  onCopy,
  onSwitchLayout,
  onNameChange,
  onFlagChange,
}: AppInspectorRailProps) {
  const publish = React.useContext(PublishCtx)
  const onClose = React.useCallback(() => onOpenChange(false), [onOpenChange])

  const [activeTab, setActiveTab] = React.useState<InspectorTab>(
    initialTab ?? "details",
  )
  const [localName, setLocalName] = React.useState(name)
  const [localFlag, setLocalFlag] =
    React.useState<InspectorFlagValue>(initialFlag)
  const [prevRecordKey, setPrevRecordKey] = React.useState(recordKey)
  const [prevInitialTab, setPrevInitialTab] = React.useState(initialTab)
  if (recordKey !== prevRecordKey) {
    // A different record opened → reset to its requested tab (or details).
    setPrevRecordKey(recordKey)
    setPrevInitialTab(initialTab)
    setActiveTab(initialTab ?? "details")
    setLocalName(name)
    setLocalFlag(initialFlag)
  } else if (initialTab !== prevInitialTab) {
    // Same record, a new tab request (e.g. footer "Open · Export" on the
    // already-inspected row) → honor it; a null request leaves the tab as-is.
    setPrevInitialTab(initialTab)
    if (initialTab != null) setActiveTab(initialTab)
  }

  const handleNameChange = React.useCallback(
    (next: string) => {
      setLocalName(next)
      onNameChange?.(next)
    },
    [onNameChange],
  )
  const handleFlagChange = React.useCallback(
    (next: InspectorFlagValue) => {
      setLocalFlag(next)
      onFlagChange?.(next)
    },
    [onFlagChange],
  )

  React.useEffect(() => {
    publish?.({
      open,
      breadcrumb,
      name: localName,
      badge,
      footer,
      content,
      flag: localFlag,
      activeTab,
      onTabChange: setActiveTab,
      onPrevious,
      onNext,
      onCopy,
      onSwitchLayout,
      onClose,
      onNameChange: handleNameChange,
      onFlagChange: handleFlagChange,
    })
  }, [
    publish,
    open,
    breadcrumb,
    localName,
    badge,
    footer,
    content,
    localFlag,
    activeTab,
    onPrevious,
    onNext,
    onCopy,
    onSwitchLayout,
    onClose,
    handleNameChange,
    handleFlagChange,
  ])

  React.useEffect(() => {
    if (!open) return
    const handleKeyboard = (event: KeyboardEvent) => {
      if (
        (event.key === "Escape" || event.code === "Escape") &&
        !hasOpenTransientOverlay()
      ) {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyboard, true)
    return () => window.removeEventListener("keydown", handleKeyboard, true)
  }, [open, onClose])
  // On unmount (page navigation), retract the rail so it can't outlive the page.
  React.useEffect(() => () => publish?.(CLOSED), [publish])

  return null
}
