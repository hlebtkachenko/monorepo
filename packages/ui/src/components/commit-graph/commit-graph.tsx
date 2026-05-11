"use client"

import * as React from "react"
import { Popover } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

interface CommitAuthor {
  name: string
  avatarUrl?: string
}

interface Commit {
  hash: string
  message: string
  author: CommitAuthor
  date: string | Date
  parents: string[]
  refs?: string[]
  tag?: string
}

interface CommitGraphProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  commits: Commit[]
  truncateHash?: number
  railWidth?: number
}

const RAIL_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--info)",
  "var(--success)",
  "var(--warning)",
]

function railColor(rail: number): string {
  return RAIL_COLORS[rail % RAIL_COLORS.length]!
}

function alphaTint(color: string, percent: number): string {
  return `color-mix(in oklab, ${color} ${percent}%, transparent)`
}

interface Edge {
  fromRail: number
  toRail: number
  color: string
  type: "straight" | "merge-in" | "fork-out"
}

interface GraphRow {
  commit: Commit
  rail: number
  rails: (string | null)[]
  edges: Edge[]
}

function computeLayout(commits: Commit[]): GraphRow[] {
  const rows: GraphRow[] = []
  const rails: (string | null)[] = []

  for (const commit of commits) {
    const hash = commit.hash
    let commitRail = rails.indexOf(hash)
    if (commitRail === -1) {
      const emptySlot = rails.indexOf(null)
      if (emptySlot !== -1) {
        commitRail = emptySlot
        rails[commitRail] = hash
      } else {
        commitRail = rails.length
        rails.push(hash)
      }
    }

    const commitColor = railColor(commitRail)
    const edges: Edge[] = []

    for (let r = 0; r < rails.length; r++) {
      if (r !== commitRail && rails[r] !== null) {
        edges.push({
          fromRail: r,
          toRail: r,
          color: railColor(r),
          type: "straight",
        })
      }
    }

    rails[commitRail] = null

    const parents = commit.parents
    if (parents.length >= 1) {
      const firstParent = parents[0]!
      const existingRail = rails.indexOf(firstParent)
      if (existingRail !== -1) {
        edges.push({
          fromRail: commitRail,
          toRail: existingRail,
          color: commitColor,
          type: "merge-in",
        })
      } else {
        rails[commitRail] = firstParent
        edges.push({
          fromRail: commitRail,
          toRail: commitRail,
          color: commitColor,
          type: "straight",
        })
      }
    }

    for (let p = 1; p < parents.length; p++) {
      const parentHash = parents[p]!
      const existingRail = rails.indexOf(parentHash)
      if (existingRail !== -1) {
        edges.push({
          fromRail: existingRail,
          toRail: commitRail,
          color: railColor(existingRail),
          type: "merge-in",
        })
      } else {
        const emptySlot = rails.indexOf(null)
        const newRail = emptySlot !== -1 ? emptySlot : rails.length
        if (newRail >= rails.length) rails.push(null)
        rails[newRail] = parentHash
        edges.push({
          fromRail: commitRail,
          toRail: newRail,
          color: railColor(newRail),
          type: "fork-out",
        })
      }
    }

    while (rails.length > 0 && rails[rails.length - 1] === null) {
      rails.pop()
    }

    rows.push({ commit, rail: commitRail, rails: [...rails], edges })
  }

  return rows
}

const ROW_HEIGHT = 40

function RailsSVG({
  row,
  prevRow,
  railWidth,
  maxRails,
}: {
  row: GraphRow
  prevRow: GraphRow | null
  railWidth: number
  maxRails: number
}) {
  const w = maxRails * railWidth
  const h = ROW_HEIGHT
  const cy = h / 2
  const rx = (rail: number) => rail * railWidth + railWidth / 2
  const commitX = rx(row.rail)

  const activeAbove = new Set<number>()
  if (prevRow) {
    for (let r = 0; r < prevRow.rails.length; r++) {
      if (prevRow.rails[r] !== null) activeAbove.add(r)
    }
  }
  const activeBelow = new Set<number>()
  for (let r = 0; r < row.rails.length; r++) {
    if (row.rails[r] !== null) activeBelow.add(r)
  }

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden="true"
    >
      {Array.from(activeAbove).map((r) => {
        if (r === row.rail) return null
        if (!activeBelow.has(r)) return null
        const x = rx(r)
        return (
          <line
            key={`pt-${r}`}
            x1={x}
            y1={0}
            x2={x}
            y2={h}
            stroke={railColor(r)}
            strokeWidth={2}
            strokeOpacity={0.6}
          />
        )
      })}
      {activeAbove.has(row.rail) && (
        <line
          x1={commitX}
          y1={0}
          x2={commitX}
          y2={cy}
          stroke={railColor(row.rail)}
          strokeWidth={2}
          strokeOpacity={0.6}
        />
      )}
      {activeBelow.has(row.rail) && (
        <line
          x1={commitX}
          y1={cy}
          x2={commitX}
          y2={h}
          stroke={railColor(row.rail)}
          strokeWidth={2}
          strokeOpacity={0.6}
        />
      )}
      {row.edges
        .filter((e) => e.type === "fork-out")
        .map((edge, i) => (
          <path
            key={`f-${i}`}
            d={`M${rx(edge.fromRail)},${cy} C${rx(edge.fromRail)},${h} ${rx(edge.toRail)},${cy} ${rx(edge.toRail)},${h}`}
            stroke={edge.color}
            strokeWidth={2}
            strokeOpacity={0.6}
            fill="none"
          />
        ))}
      {row.edges
        .filter((e) => e.type === "merge-in")
        .map((edge, i) => {
          const isOutgoing = edge.fromRail === row.rail
          const x1 = rx(edge.fromRail)
          const x2 = rx(edge.toRail)
          const d = isOutgoing
            ? `M${x1},${cy} C${x1},${h} ${x2},${cy} ${x2},${h}`
            : `M${x1},${0} C${x1},${cy} ${x2},${0} ${x2},${cy}`
          return (
            <path
              key={`m-${i}`}
              d={d}
              stroke={edge.color}
              strokeWidth={2}
              strokeOpacity={0.6}
              fill="none"
            />
          )
        })}
      {Array.from(activeAbove).map((r) => {
        if (r === row.rail) return null
        if (activeBelow.has(r)) return null
        const x = rx(r)
        return (
          <line
            key={`end-${r}`}
            x1={x}
            y1={0}
            x2={x}
            y2={cy}
            stroke={railColor(r)}
            strokeWidth={2}
            strokeOpacity={0.6}
          />
        )
      })}
      <circle
        cx={commitX}
        cy={cy}
        r={5}
        fill={railColor(row.rail)}
        stroke="var(--background)"
        strokeWidth={2}
      />
    </svg>
  )
}

function formatDate(date: string | Date, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  })
}

function formatFullDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function RelativeTime({
  date,
  className,
}: {
  date: string | Date
  className?: string
}) {
  const [label, setLabel] = React.useState<string | null>(null)
  React.useEffect(() => {
    const update = () => setLabel(formatDate(date))
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [date])
  const initial = React.useMemo(
    () =>
      (typeof date === "string" ? new Date(date) : date)
        .toISOString()
        .slice(0, 10),
    [date],
  )
  return (
    <span className={className} suppressHydrationWarning>
      {label ?? initial}
    </span>
  )
}

function AuthorAvatar({ author }: { author: CommitAuthor }) {
  if (author.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={author.avatarUrl}
        alt=""
        width={16}
        height={16}
        className="size-4 rounded-full border border-border/60 bg-muted"
      />
    )
  }
  const initials = author.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
  return (
    <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[8px] font-bold text-muted-foreground">
      {initials}
    </span>
  )
}

function CommitDetail({
  commit,
  hashLength,
  color,
  children,
}: {
  commit: Commit
  hashLength: number
  color: string
  children: React.ReactNode
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 w-80 animate-in rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md fade-in-0 zoom-in-95"
        >
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-snug font-medium">{commit.message}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <AuthorAvatar author={commit.author} />
                {commit.author.name}
              </span>
              <span className="text-border">·</span>
              <code className="rounded-md bg-muted px-1 py-0.5 font-mono text-[10px]">
                {commit.hash.slice(0, hashLength)}
              </code>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {formatFullDate(commit.date)}
            </div>
            {(commit.refs || commit.tag) && (
              <div className="flex flex-wrap gap-1">
                {commit.refs?.map((ref) => (
                  <span
                    key={ref}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {ref}
                  </span>
                ))}
                {commit.tag && (
                  <span
                    className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: alphaTint(color, 20),
                      color,
                    }}
                  >
                    {commit.tag}
                  </span>
                )}
              </div>
            )}
            {commit.parents.length > 0 && (
              <div className="text-[10px] text-muted-foreground/60">
                {commit.parents.length === 1 ? "Parent" : "Parents"}:{" "}
                {commit.parents.map((p) => p.slice(0, hashLength)).join(", ")}
              </div>
            )}
          </div>
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function CommitGraph({
  commits,
  truncateHash = 7,
  railWidth = 24,
  className,
  ...props
}: CommitGraphProps) {
  const hasTopology = commits.some((c) => c.parents && c.parents.length > 0)
  const resolvedCommits = hasTopology
    ? commits
    : commits.map((c, i) => ({
        ...c,
        parents: i < commits.length - 1 ? [commits[i + 1]!.hash] : [],
      }))

  if (resolvedCommits.length === 0) {
    return (
      <div
        data-slot="commit-graph"
        className={cn(
          "flex items-center justify-center rounded-xl border border-border/60 bg-card py-10 text-sm text-muted-foreground shadow-sm",
          className,
        )}
        {...props}
      >
        No commits.
      </div>
    )
  }

  const rows = computeLayout(resolvedCommits)
  const maxRails = Math.max(
    ...rows.map((r) =>
      Math.max(
        r.rail + 1,
        r.rails.length,
        ...r.edges.map((e) => Math.max(e.fromRail, e.toRail) + 1),
      ),
    ),
  )
  const svgWidth = maxRails * railWidth

  return (
    <div
      data-slot="commit-graph"
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm",
        className,
      )}
      {...props}
    >
      <div className="overflow-x-auto">
        {rows.map((row, i) => {
          const rowColor = railColor(row.rail)
          return (
            <CommitDetail
              key={`${row.commit.hash}-${i}`}
              commit={row.commit}
              hashLength={truncateHash}
              color={rowColor}
            >
              <button
                type="button"
                data-slot="commit-entry"
                className="flex w-full items-center gap-0 border-b border-border/30 transition-colors last:border-b-0 hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"
                style={{ height: ROW_HEIGHT }}
              >
                <div style={{ width: svgWidth }} className="shrink-0">
                  <RailsSVG
                    row={row}
                    prevRow={i > 0 ? rows[i - 1]! : null}
                    railWidth={railWidth}
                    maxRails={maxRails}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1 px-2">
                  {row.commit.refs?.map((ref) => (
                    <span
                      key={ref}
                      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-none font-semibold"
                      style={{
                        borderColor: alphaTint(rowColor, 40),
                        backgroundColor: alphaTint(rowColor, 10),
                        color: rowColor,
                      }}
                    >
                      {ref}
                    </span>
                  ))}
                  {row.commit.tag && (
                    <span
                      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] leading-none font-semibold"
                      style={{
                        backgroundColor: alphaTint(rowColor, 20),
                        color: rowColor,
                      }}
                    >
                      {row.commit.tag}
                    </span>
                  )}
                </div>
                <p className="min-w-0 flex-1 truncate px-2 text-left text-sm text-foreground/80">
                  {row.commit.message}
                </p>
                <div className="flex shrink-0 items-center gap-3 px-3">
                  <code className="font-mono text-[11px] text-muted-foreground/60">
                    {row.commit.hash.slice(0, truncateHash)}
                  </code>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <AuthorAvatar author={row.commit.author} />
                    <span className="hidden sm:inline">
                      {row.commit.author.name}
                    </span>
                  </span>
                  <RelativeTime
                    date={row.commit.date}
                    className="text-[11px] text-muted-foreground/50"
                  />
                </div>
              </button>
            </CommitDetail>
          )
        })}
      </div>
    </div>
  )
}

export { CommitGraph }
export type { CommitGraphProps, Commit, CommitAuthor }
