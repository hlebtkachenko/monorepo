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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
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
  /**
   * Promote this page to a wide HERO card (spans 2 columns, shows the
   * description + `metric`). Lets a group mix one prominent entry with the
   * smaller default cards instead of every card looking identical.
   */
  featured?: boolean
  /** A key stat shown on the hero card (e.g. "128 documents", "3 accounts"). */
  metric?: React.ReactNode
}

/**
 * The five navigation shapes a launchpad can lay out, matching the sidebar's
 * own structure possibilities:
 *   - `pinned` — featured / quick-access pages, always first.
 *   - `single` — ungrouped top-level pages.
 *   - `group`  — pages under a labelled heading (each may carry subpages).
 *   - `footer` — utility links, compact, no star.
 */
export type LaunchpadSectionKind = "pinned" | "single" | "group" | "footer"

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

/**
 * Uniform card grid — a fixed column COUNT keyed off the content-panel width via
 * container queries (the `@container` wrapper in `Section`). Every section reads
 * the same panel width, so every card is the same width regardless of how many
 * pages a section holds — a sparse section just leaves trailing empty cells
 * instead of stretching its cards into odd big blocks. Columns step 1 → 2 → 3 → 4
 * as the panel widens, and because it's a CONTAINER query it reflows when the
 * frame is resized, not only the viewport.
 */
const CARD_GRID =
  "grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5"

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

/** Subpage flyout — the ONLY "open deeper" affordance, shown only when there
 * are subpages (no decorative chevron on leaf cards). */
function SubpagesPopover({
  page,
  Link,
  className,
}: {
  page: LaunchpadPage
  Link: React.ElementType
  className?: string
}) {
  const icons = useIcons()
  const ChevronRight = icons.ChevronRight
  const subpages = page.subpages ?? []
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          icon="ChevronsRight"
          aria-label={`Open ${page.title}`}
          className={cn("text-muted-foreground", className)}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        {page.href ? (
          <Link
            href={page.href}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <span className="flex-1 truncate">Open {page.title}</span>
          </Link>
        ) : null}
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
      </PopoverContent>
    </Popover>
  )
}

/** The default icon-centered card. */
function DefaultCard({
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
  const hasSubs = (page.subpages?.length ?? 0) > 0
  const unread = page.unread ?? 0

  return (
    <Card
      data-slot="launchpad-card"
      className="group/card relative min-h-36 items-center justify-center gap-2 p-4 text-center transition-colors hover:ring-foreground/20"
    >
      {page.href && !hasSubs ? (
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
      {hasSubs ? (
        <SubpagesPopover
          page={page}
          Link={Link}
          className="absolute top-1.5 right-1.5 z-10"
        />
      ) : null}

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
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {page.description}
        </p>
      ) : null}
    </Card>
  )
}

/** The wide HERO card (featured page) — spans 2 columns, icon + title +
 * description + a key metric. Gives a group visual hierarchy. */
function FeatureCard({
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
  const hasSubs = (page.subpages?.length ?? 0) > 0
  const unread = page.unread ?? 0

  return (
    <Card
      data-slot="launchpad-card"
      className="group/card relative min-h-36 flex-row items-center gap-4 p-4 transition-colors hover:ring-foreground/20 @md:col-span-2"
    >
      {page.href && !hasSubs ? (
        <Link
          href={page.href}
          aria-label={page.title}
          className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : null}

      {Icon ? (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon className="size-7" />
        </span>
      ) : null}

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="font-heading text-base leading-snug font-medium">
            {page.title}
          </span>
          {unread > 0 ? <UnreadBadge count={unread} /> : null}
        </div>
        {page.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {page.description}
          </p>
        ) : null}
        {page.metric ? (
          <p className="font-heading text-sm font-medium">{page.metric}</p>
        ) : null}
      </div>

      <div className="relative z-10 flex shrink-0 items-start gap-1">
        {hasSubs ? <SubpagesPopover page={page} Link={Link} /> : null}
        <FollowStar page={page} onToggleFollow={onToggleFollow} />
      </div>
    </Card>
  )
}

/** A compact, star-able utility row (footer pages) — the dense variant. */
function CompactRow({
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
    <Item
      data-slot="launchpad-card"
      variant="outline"
      size="sm"
      className="group/card"
    >
      {Icon ? (
        <ItemMedia variant="icon">
          <Icon className="text-muted-foreground" />
        </ItemMedia>
      ) : null}
      <ItemContent>
        <ItemTitle>
          {page.href ? (
            <Link href={page.href} className="hover:underline">
              {page.title}
            </Link>
          ) : (
            page.title
          )}
        </ItemTitle>
        {page.description ? (
          <ItemDescription>{page.description}</ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions>
        <FollowStar page={page} onToggleFollow={onToggleFollow} />
      </ItemActions>
    </Item>
  )
}

function Section({
  label,
  kind,
  pages,
  Link,
  onToggleFollow,
}: {
  label?: React.ReactNode
  kind: LaunchpadSectionKind
  pages: LaunchpadPage[]
  Link: React.ElementType
  onToggleFollow?: (pageId: string) => void
}) {
  if (pages.length === 0) return null
  return (
    <section className="@container space-y-3">
      {label ? (
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </h3>
      ) : null}
      {kind === "footer" ? (
        <div className="grid grid-cols-1 gap-2 @md:grid-cols-2 @3xl:grid-cols-3">
          {pages.map((page) => (
            <CompactRow
              key={page.id}
              page={page}
              Link={Link}
              onToggleFollow={onToggleFollow}
            />
          ))}
        </div>
      ) : (
        <div className={CARD_GRID}>
          {pages.map((page) =>
            page.featured ? (
              <FeatureCard
                key={page.id}
                page={page}
                Link={Link}
                onToggleFollow={onToggleFollow}
              />
            ) : (
              <DefaultCard
                key={page.id}
                page={page}
                Link={Link}
                onToggleFollow={onToggleFollow}
              />
            ),
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Launchpad archetype — a folder / overview hub that lays out a page's
 * navigation structure as cards. Mirrors the sidebar's shapes (pinned, single,
 * grouped + subpages, footer), hoists followed pages to the top with a filled
 * star, and filters by the header view tabs. Presentational and data-driven:
 * feed `sections` + `view` and handle `onToggleFollow`. Drop into a
 * `ContentPanel`'s `children`.
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
      <div data-slot="launchpad" className={cn("space-y-6", className)}>
        {followed.length > 0 ? (
          <Section
            kind="single"
            pages={followed}
            Link={Link}
            onToggleFollow={onToggleFollow}
          />
        ) : (
          <LaunchpadEmpty
            title="No followed pages yet"
            description="Star a page to pin it here for quick access."
          />
        )}
      </div>
    )
  }

  // Unread view — every page with something unread, flat.
  if (view === "unread") {
    const unread = allPages.filter(isUnread)
    return (
      <div data-slot="launchpad" className={cn("space-y-6", className)}>
        {unread.length > 0 ? (
          <Section
            kind="single"
            pages={unread}
            Link={Link}
            onToggleFollow={onToggleFollow}
          />
        ) : (
          <LaunchpadEmpty
            title="Nothing unread"
            description="New activity on your pages shows up here."
          />
        )}
      </div>
    )
  }

  // All view — Pinned, then a hoisted Followed strip (pulled from single/group
  // sections), then the structural sections in order, footer last.
  const followedLoose = sections
    .filter((s) => s.kind === "single" || s.kind === "group")
    .flatMap((s) => s.pages)
    .filter((p) => p.followed)
  const followedIds = new Set(followedLoose.map((p) => p.id))

  return (
    <div data-slot="launchpad" className={cn("space-y-6", className)}>
      {sections
        .filter((s) => s.kind === "pinned")
        .map((s) => (
          <Section
            key={s.id}
            kind="pinned"
            label={s.label ?? "Pinned"}
            pages={s.pages}
            Link={Link}
            onToggleFollow={onToggleFollow}
          />
        ))}

      {followedLoose.length > 0 ? (
        <Section
          kind="single"
          label="Followed"
          pages={followedLoose}
          Link={Link}
          onToggleFollow={onToggleFollow}
        />
      ) : null}

      {sections
        .filter((s) => s.kind === "single" || s.kind === "group")
        .map((s) => (
          <Section
            key={s.id}
            kind={s.kind}
            label={s.label}
            pages={s.pages.filter((p) => !followedIds.has(p.id))}
            Link={Link}
            onToggleFollow={onToggleFollow}
          />
        ))}

      {sections
        .filter((s) => s.kind === "footer")
        .map((s) => (
          <Section
            key={s.id}
            kind="footer"
            label={s.label}
            pages={s.pages}
            Link={Link}
          />
        ))}
    </div>
  )
}

function LaunchpadEmpty({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
