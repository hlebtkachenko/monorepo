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
  /** Followed flag — a starred subpage is hoisted into "Followed" as a Small card. */
  followed?: boolean
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
  /**
   * Parent page title — set only on a followed SUBPAGE promoted to a Small card
   * in the Followed group. Renders a `★ {parent} »` breadcrumb before the title
   * so the small card shows where the subpage lives.
   */
  parentTitle?: string
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

/**
 * The Followed collection: followed top-level pages (foldable ones forced
 * FOLDED — `defaultUnfolded` stripped) plus followed subpages as Small cards,
 * de-duped by id. Shared by the "Followed" tab view and the "all" view's
 * hoisted Followed group so the two never diverge.
 */
function collectFollowed(sections: LaunchpadSection[]): LaunchpadPage[] {
  // Footer sections are utility links rendered as their own dense row, never
  // hoisted into Followed — so counts, the Followed tab, and the "all" view's
  // Followed group all read from the same structural set and never diverge.
  const pages = sections
    .filter((s) => s.kind !== "footer")
    .flatMap((s) => s.pages)

  const topLevel = pages
    .filter((p) => p.followed)
    .map(({ defaultUnfolded: _drop, ...p }) => p)

  // A followed subpage becomes a Small card carrying its parent's title as a
  // breadcrumb, so it reads `★ {parent} » {subpage}` in the Followed group.
  const subs: LaunchpadPage[] = pages.flatMap((parent) =>
    (parent.subpages ?? [])
      .filter((sub) => sub.followed)
      .map((sub) => ({
        id: sub.id,
        title: sub.title,
        href: sub.href,
        unread: sub.unread,
        followed: true,
        compact: true,
        parentTitle: parent.title,
      })),
  )

  const seen = new Set<string>()
  return [...topLevel, ...subs].filter((p) =>
    seen.has(p.id) ? false : (seen.add(p.id), true),
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
    followed: collectFollowed(sections).length,
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

/** The follow star — a real toggle, usable on any card variant or subpage row.
 * Takes primitive `id` + `followed` so a subpage (not a full `LaunchpadPage`)
 * can carry its own star. `alwaysVisible` keeps the star painted even when
 * unfollowed (used for subpage rows, which have no reveal-on-hover affordance). */
function FollowStar({
  id,
  followed,
  onToggleFollow,
  className,
  alwaysVisible,
}: {
  id: string
  followed?: boolean
  onToggleFollow?: (pageId: string) => void
  className?: string
  alwaysVisible?: boolean
}) {
  return (
    <IconButton
      icon="Star"
      aria-label={followed ? "Unfollow" : "Follow"}
      tooltip={followed ? "Following" : "Follow"}
      tooltipSide="bottom"
      onClick={() => onToggleFollow?.(id)}
      className={cn(
        followed
          ? "text-primary [&_svg]:fill-current"
          : alwaysVisible
            ? "text-muted-foreground"
            : "text-muted-foreground opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100",
        className,
      )}
    />
  )
}

/** The inner content of a Standard card — a stretched nav link, the follow star
 * (+ optional fold button) top-right, a centered icon, the title, and a 2-line
 * clamped description. Extracted so the Large card's LEFT half renders the
 * IDENTICAL content (no re-positioning, no re-alignment, no button migration). */
function StandardInner({
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
    <>
      {page.href ? (
        <Link
          href={page.href}
          aria-label={page.title}
          className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : null}

      {/* Top-right controls: follow star, then the optional expand button. */}
      <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5">
        <FollowStar
          id={page.id}
          followed={page.followed}
          onToggleFollow={onToggleFollow}
        />
        {foldButton}
      </div>

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
    </>
  )
}

/** The Standard icon-centered card (1 column). `foldButton` is the optional
 * expand control a foldable card adds beside the star when folded. */
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
  return (
    <Card
      data-slot="launchpad-card"
      className="group/card relative min-h-36 items-center justify-center gap-2 p-4 text-center transition-colors hover:ring-foreground/20"
    >
      <StandardInner
        page={page}
        Link={Link}
        onToggleFollow={onToggleFollow}
        foldButton={foldButton}
      />
    </Card>
  )
}

/** The Large card (spans 2 columns) — a subpage card UNFOLDED. LEFT half is the
 * UNCHANGED Standard card content (icon centered, title, description, star
 * top-right). RIGHT half is the subpages list, which has its own width, with the
 * `«` collapse control sitting BESIDE it (top-right), not over it. No separator,
 * no text transform, no button migration. */
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
  const subpages = page.subpages ?? []

  return (
    <Card
      data-slot="launchpad-card"
      className="group/card relative min-h-36 flex-row gap-2 p-0 transition-colors hover:ring-foreground/20 @md:col-span-2"
    >
      {/* Left half — the identical Standard card content, untouched. */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
        <StandardInner
          page={page}
          Link={Link}
          onToggleFollow={onToggleFollow}
        />
      </div>

      {/* Right half — the subpages list (its own width) with the `«` collapse
          control beside it, top-aligned. Each row: a navigating title link + its
          own follow star. No leading chevron, no left border. */}
      <div className="flex flex-1 gap-1 p-4">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          {subpages.map((sub) => (
            <div
              key={sub.id}
              className="group/sub flex items-center gap-2 rounded-md px-2 hover:bg-accent"
            >
              <Link
                href={sub.href ?? "#"}
                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-sm text-muted-foreground group-hover/sub:text-foreground"
              >
                <span className="min-w-0 flex-1 truncate">{sub.title}</span>
                <UnreadBadge count={sub.unread} />
              </Link>
              <FollowStar
                id={sub.id}
                followed={sub.followed}
                onToggleFollow={onToggleFollow}
                alwaysVisible
                className="shrink-0"
              />
            </div>
          ))}
        </div>
        <IconButton
          icon="ChevronsLeft"
          aria-label={`Collapse ${page.title}`}
          tooltip="Collapse"
          tooltipSide="bottom"
          onClick={onFold}
          className="shrink-0 self-start text-muted-foreground"
        />
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
          icon="ChevronsRight"
          aria-label={`Expand ${page.title}`}
          tooltip="Expand"
          tooltipSide="bottom"
          onClick={() => setUnfolded(true)}
          className="text-muted-foreground"
        />
      }
    />
  )
}

/** The Small dense cell — a fixed-height horizontal tile. Every Small card is
 * the SAME height (`h-14`) and `self-start`, so a followed subpage's Small card
 * in the Followed group matches the footer's Small cards and can sit inline
 * among Standard cards without stretching to their height. A promoted subpage
 * shows a muted `★ {parent} »` breadcrumb before its title. */
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
  const StarIcon = icons.Star
  const ChevronsRightIcon = icons.ChevronsRight

  return (
    <Card
      data-slot="launchpad-card"
      className="group/card relative h-14 flex-row items-center gap-2.5 self-start p-2.5 transition-colors hover:ring-foreground/20"
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
      <div className="flex min-w-0 flex-1 items-center gap-1 truncate">
        {page.parentTitle ? (
          <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
            <StarIcon className="size-3.5" />
            <span className="max-w-24 truncate">{page.parentTitle}</span>
            <ChevronsRightIcon className="size-3.5" />
          </span>
        ) : null}
        <span className="min-w-0 truncate text-sm font-medium">
          {page.title}
        </span>
      </div>
      <FollowStar
        id={page.id}
        followed={page.followed}
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

  // Followed view — every starred page + starred subpage, flat.
  if (view === "followed") {
    const followed = collectFollowed(sections)
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

  // The Followed group = followed top-level pages (folded) + followed subpages
  // (Small cards), de-duped. Only followed TOP-LEVEL pages are removed from
  // their structural group — a followed subpage's parent stays put.
  const followedPages = collectFollowed(sections.filter(isStructural))
  const followedIds = new Set(
    sections
      .filter(isStructural)
      .flatMap((s) => s.pages)
      .filter((p) => p.followed)
      .map((p) => p.id),
  )

  const renderSections: RenderSection[] = []

  if (followedPages.length > 0) {
    renderSections.push({
      id: "__followed__",
      label: "Followed",
      pages: followedPages,
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
