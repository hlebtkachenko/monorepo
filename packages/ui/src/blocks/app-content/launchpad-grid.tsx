"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { IconButton } from "@workspace/ui/components/icon-button"
import { useIcons, type IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

/** The header-tab views a Launchpad filters by. */
export type LaunchpadView = "all" | "followed" | "unread"

/** A nested child link under a page (mirrors the sidebar `Subpage`). */
export interface LaunchpadSubpage {
  id: string
  title: string
  href?: string
  /** Unread count — surfaces a badge and feeds the page's "unread" rollup. */
  unread?: number
}

/**
 * One launchpad card. Mirrors a sidebar `Page`: a destination with an icon,
 * optional nested `subpages`, an `unread` count, and a `followed` flag (the
 * star). The page using the block owns this data and the follow toggle.
 *
 * Card size is derived, not free-form:
 *   - `compact: true` → a Small dense cell (footer / utility pages).
 *   - has `subpages`  → a foldable card: Standard while folded, Large
 *     (`col-span-2`, subpages rendered inline) once unfolded.
 *   - otherwise       → a Standard icon-centered card.
 */
export interface LaunchpadPage {
  id: string
  title: string
  description?: string
  icon?: IconName
  href?: string
  unread?: number
  followed?: boolean
  subpages?: LaunchpadSubpage[]
  /** Render as the Small dense cell (footer / utility). Cannot unfold. */
  compact?: boolean
  /** Start a subpage card unfolded (Large) rather than the default folded. */
  defaultUnfolded?: boolean
}

/**
 * The navigation shapes a launchpad lays out, matching the sidebar's structure:
 *   - `single` — ungrouped top-level pages.
 *   - `group`  — pages under a labelled heading (each may carry subpages).
 *   - `footer` — utility links, dense Small cells.
 *
 * There is no `pinned` kind — the Followed group is always first instead.
 */
export type LaunchpadSectionKind = "single" | "group" | "footer"

export interface LaunchpadSection {
  id: string
  kind: LaunchpadSectionKind
  /** Heading shown above the section (required for `group`, optional otherwise). */
  label?: string
  pages: LaunchpadPage[]
}

export interface LaunchpadGridProps {
  /** The page structure, supplied and owned by the consuming page. */
  sections: LaunchpadSection[]
  /** Active header-tab view. Default `"all"`. */
  view?: LaunchpadView
  /** Star click — the consumer flips `followed` and re-renders. */
  onToggleFollow?: (pageId: string) => void
  /**
   * The link element. Pass Next's `Link` for client navigation; defaults to a
   * plain `<a>` so the block stays router-agnostic.
   */
  linkComponent?: React.ElementType
  className?: string
}

/** Whether a page (or any of its subpages) has something unread. */
function isUnread(page: LaunchpadPage): boolean {
  return (
    (page.unread ?? 0) > 0 ||
    (page.subpages?.some((s) => (s.unread ?? 0) > 0) ?? false)
  )
}

/** Tab counts for the header (`All n · Followed n · Unread n`). */
export function getLaunchpadCounts(sections: LaunchpadSection[]): {
  all: number
  followed: number
  unread: number
} {
  const pages = sections.flatMap((s) => s.pages)
  return {
    all: pages.length,
    followed: pages.filter((p) => p.followed).length,
    unread: pages.filter(isUnread).length,
  }
}

/** One unread pip / count badge, or nothing. */
function UnreadBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null
  return (
    <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5">
      {count}
    </Badge>
  )
}

/** The follow star — a real toggle, present on every card variant. */
function FollowStar({
  page,
  onToggleFollow,
  className,
}: {
  page: LaunchpadPage
  onToggleFollow?: (pageId: string) => void
  className?: string
}) {
  return (
    <IconButton
      icon="Star"
      aria-label={page.followed ? "Unfollow" : "Follow"}
      tooltip={page.followed ? "Following" : "Follow"}
      tooltipSide="bottom"
      onClick={() => onToggleFollow?.(page.id)}
      className={cn(
        page.followed
          ? "text-primary [&_svg]:fill-current"
          : "text-muted-foreground opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100",
        className,
      )}
    />
  )
}

/** The Standard icon-centered card (1 column). Its `description` is clamped to
 * two lines; the full text shows on hover via a native `title`. `foldButton`
 * is the optional top-right control rendered by a foldable card when folded. */
function StandardCard({
  page,
  Link,
  onToggleFollow,
  foldButton,
}: {
  page: LaunchpadPage
  Link: React.ElementType
  onToggleFollow?: (pageId: string) => void
  foldButton?: React.ReactNode
}) {
  const icons = useIcons()
  const Icon = page.icon ? icons[page.icon] : null
  const unread = page.unread ?? 0

  return (
    <Card
      data-slot="launchpad-card"
      className="group/card relative min-h-36 items-center justify-center gap-2 p-4 text-center transition-colors hover:ring-foreground/20"
    >
      {page.href ? (
        <Link
          href={page.href}
          aria-label={page.title}
          className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : null}

      <FollowStar
        page={page}
        onToggleFollow={onToggleFollow}
        className="absolute top-1.5 left-1.5 z-10"
      />
      {foldButton}

      {Icon ? (
        <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon className="size-6" />
        </span>
      ) : null}

      <div className="flex items-center gap-1.5">
        <span className="font-heading text-sm leading-snug font-medium">
          {page.title}
        </span>
        {unread > 0 ? <UnreadBadge count={unread} /> : null}
      </div>
      {page.description ? (
        <p
          title={page.description}
          className="line-clamp-2 text-xs text-muted-foreground"
        >
          {page.description}
        </p>
      ) : null}
    </Card>
  )
}

/** The Large horizontal card (spans 2 columns) — a subpage card UNFOLDED.
 * Left half = info (icon + title + description), right half = the subpages list
 * rendered inline and visible. Star top-left, fold chevron top-right. */
function LargeCard({
  page,
  Link,
  onToggleFollow,
  onFold,
}: {
  page: LaunchpadPage
  Link: React.ElementType
  onToggleFollow?: (pageId: string) => void
  onFold: () => void
}) {
  const icons = useIcons()
  const Icon = page.icon ? icons[page.icon] : null
  const ChevronRight = icons.ChevronRight
  const unread = page.unread ?? 0
  const subpages = page.subpages ?? []

  return (
    <Card
      data-slot="launchpad-card"
      className="group/card relative min-h-36 flex-row gap-4 p-4 transition-colors hover:ring-foreground/20 @md:col-span-2"
    >
      <FollowStar
        page={page}
        onToggleFollow={onToggleFollow}
        className="absolute top-1.5 left-1.5 z-10"
      />
      <IconButton
        icon="ChevronUp"
        aria-label={`Collapse ${page.title}`}
        tooltip="Collapse"
        tooltipSide="bottom"
        onClick={onFold}
        className="absolute top-1.5 right-1.5 z-10 text-muted-foreground"
      />

      {/* Left half — info. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-6">
        {Icon ? (
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-foreground">
            <Icon className="size-6" />
          </span>
        ) : null}
        <div className="flex items-center gap-1.5">
          {page.href ? (
            <Link
              href={page.href}
              className="font-heading text-sm leading-snug font-medium hover:underline"
            >
              {page.title}
            </Link>
          ) : (
            <span className="font-heading text-sm leading-snug font-medium">
              {page.title}
            </span>
          )}
          {unread > 0 ? <UnreadBadge count={unread} /> : null}
        </div>
        {page.description ? (
          <p className="text-xs text-muted-foreground">{page.description}</p>
        ) : null}
      </div>

      {/* Right half — subpages, inline and visible. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 border-l border-border-subtle pt-6 pl-4">
        {subpages.map((sub) => (
          <Link
            key={sub.id}
            href={sub.href ?? "#"}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{sub.title}</span>
            <UnreadBadge count={sub.unread} />
          </Link>
        ))}
      </div>
    </Card>
  )
}

/** A foldable subpage card. Folded → Standard (with a fold chevron to expand);
 * unfolded → Large with inline subpages. Default folded. */
function FoldableCard({
  page,
  Link,
  onToggleFollow,
}: {
  page: LaunchpadPage
  Link: React.ElementType
  onToggleFollow?: (pageId: string) => void
}) {
  const [unfolded, setUnfolded] = React.useState(page.defaultUnfolded ?? false)

  if (unfolded) {
    return (
      <LargeCard
        page={page}
        Link={Link}
        onToggleFollow={onToggleFollow}
        onFold={() => setUnfolded(false)}
      />
    )
  }

  return (
    <StandardCard
      page={page}
      Link={Link}
      onToggleFollow={onToggleFollow}
      foldButton={
        <IconButton
          icon="ChevronDown"
          aria-label={`Expand ${page.title}`}
          tooltip="Expand"
          tooltipSide="bottom"
          onClick={() => setUnfolded(true)}
          className="absolute top-1.5 right-1.5 z-10 text-muted-foreground"
        />
      }
    />
  )
}

/** The Small dense cell (footer / utility) — ~3x shorter than a Standard card,
 * one column wide, tiles inside the same 4-col grid. Has a working star. */
function SmallCard({
  page,
  Link,
  onToggleFollow,
}: {
  page: LaunchpadPage
  Link: React.ElementType
  onToggleFollow?: (pageId: string) => void
}) {
  const icons = useIcons()
  const Icon = page.icon ? icons[page.icon] : null

  return (
    <Card
      data-slot="launchpad-card"
      className="group/card relative flex-row items-center gap-2.5 p-2.5 transition-colors hover:ring-foreground/20"
    >
      {page.href ? (
        <Link
          href={page.href}
          aria-label={page.title}
          className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : null}

      {Icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {page.title}
      </span>
      <FollowStar
        page={page}
        onToggleFollow={onToggleFollow}
        className="relative z-10 shrink-0"
      />
    </Card>
  )
}

/** Pick and render a page's card by its derived size. */
function LaunchpadCard({
  page,
  Link,
  onToggleFollow,
}: {
  page: LaunchpadPage
  Link: React.ElementType
  onToggleFollow?: (pageId: string) => void
}) {
  if (page.compact) {
    return <SmallCard page={page} Link={Link} onToggleFollow={onToggleFollow} />
  }
  if ((page.subpages?.length ?? 0) > 0) {
    return (
      <FoldableCard page={page} Link={Link} onToggleFollow={onToggleFollow} />
    )
  }
  return (
    <StandardCard page={page} Link={Link} onToggleFollow={onToggleFollow} />
  )
}

/** A full-width group label that sits inside the grid as its own row, so cards
 * keep tiling cleanly in the same 4-column grid. Body font, muted, no caps. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="col-span-full text-sm font-medium text-muted-foreground">
      {children}
    </h3>
  )
}

interface RenderSection {
  id: string
  label?: React.ReactNode
  pages: LaunchpadPage[]
}

/**
 * Launchpad archetype — a folder / overview hub that lays out a page's
 * navigation structure as cards in a STRICT 4-column grid. Followed pages are
 * hoisted to a synthetic "Followed" group first; the structural sections
 * (single / group) follow, then footer. Group labels are full-width rows inside
 * the same grid, so every card tiles cleanly with no per-section gaps.
 * Presentational and data-driven: feed `sections` + `view`, handle
 * `onToggleFollow`. Drop into a `ContentPanel`'s `children`.
 */
export function LaunchpadGrid({
  sections,
  view = "all",
  onToggleFollow,
  linkComponent,
  className,
}: LaunchpadGridProps) {
  const Link = linkComponent ?? "a"
  const allPages = sections.flatMap((s) => s.pages)

  // Followed view — every starred page, flat.
  if (view === "followed") {
    const followed = allPages.filter((p) => p.followed)
    return (
      <Grid className={className}>
        {followed.length > 0 ? (
          followed.map((page) => (
            <LaunchpadCard
              key={page.id}
              page={page}
              Link={Link}
              onToggleFollow={onToggleFollow}
            />
          ))
        ) : (
          <FullWidthEmpty
            title="No followed pages yet"
            description="Star a page to pin it here for quick access."
          />
        )}
      </Grid>
    )
  }

  // Unread view — every page with something unread, flat.
  if (view === "unread") {
    const unread = allPages.filter(isUnread)
    return (
      <Grid className={className}>
        {unread.length > 0 ? (
          unread.map((page) => (
            <LaunchpadCard
              key={page.id}
              page={page}
              Link={Link}
              onToggleFollow={onToggleFollow}
            />
          ))
        ) : (
          <FullWidthEmpty
            title="Nothing unread"
            description="New activity on your pages shows up here."
          />
        )}
      </Grid>
    )
  }

  // All view — a synthetic "Followed" group first (hoisted from the structural
  // sections), then the structural sections in order, then footer last.
  const isStructural = (s: LaunchpadSection) => s.kind !== "footer"
  const followedLoose = sections
    .filter(isStructural)
    .flatMap((s) => s.pages)
    .filter((p) => p.followed)
  const followedIds = new Set(followedLoose.map((p) => p.id))

  const renderSections: RenderSection[] = []

  if (followedLoose.length > 0) {
    renderSections.push({
      id: "__followed__",
      label: "Followed",
      pages: followedLoose,
    })
  }

  for (const section of sections.filter(isStructural)) {
    const pages = section.pages.filter((p) => !followedIds.has(p.id))
    if (pages.length === 0) continue
    renderSections.push({ id: section.id, label: section.label, pages })
  }

  for (const section of sections.filter((s) => s.kind === "footer")) {
    // Footer pages are dense Small cells regardless of their own flag.
    const pages = section.pages.map((p) => ({ ...p, compact: true }))
    if (pages.length === 0) continue
    renderSections.push({ id: section.id, label: section.label, pages })
  }

  return (
    <Grid className={className}>
      {renderSections.map((section) => (
        <React.Fragment key={section.id}>
          {section.label ? <GroupLabel>{section.label}</GroupLabel> : null}
          {section.pages.map((page) => (
            <LaunchpadCard
              key={page.id}
              page={page}
              Link={Link}
              onToggleFollow={onToggleFollow}
            />
          ))}
        </React.Fragment>
      ))}
    </Grid>
  )
}

/**
 * The single, strict grid. `@container` reads the content-panel width, so the
 * column count reflows on PANEL resize, not just viewport. Default is exactly
 * 4 columns; it only drops to 2 on a very narrow panel. Large (subpage)
 * cards take `@md:col-span-2`; group labels span the full row — so everything
 * tiles into the same 4-column lattice with no stray gaps.
 */
function Grid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  // `@container` on the wrapper; the column count is read from THIS wrapper's
  // width (a container element can't size its own utilities off itself). 4
  // columns is the default; only a very narrow panel drops to 2.
  return (
    <div className={cn("@container", className)}>
      <div
        data-slot="launchpad"
        className="grid grid-cols-2 gap-3 @md:grid-cols-4"
      >
        {children}
      </div>
    </div>
  )
}

function FullWidthEmpty({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="col-span-full">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
