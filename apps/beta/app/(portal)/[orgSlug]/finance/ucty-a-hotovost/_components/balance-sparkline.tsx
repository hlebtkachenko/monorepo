import type { AccountBalancePoint } from "@/lib/data/account-balances"

/**
 * A card's 12-period balance trend (spec §2.4: "12-mo sparkline"), as a plain
 * inline SVG.
 *
 * WHY NOT `@workspace/ui`'s `ChartSpark*`. Those are recharts components: they
 * measure their container in the browser before they draw anything, so they
 * render to nothing on the server and pull a charting library into a bundle
 * this app has so far never needed. §depth puts Účty cards under "SHALLOW
 * (table + stamp suffices)", and what this drawing has to be is small, exact
 * and assertable in a test — which a polyline over pre-computed coordinates is
 * and a measured chart is not. No new dependency either way.
 *
 * IT DOES NO ARITHMETIC ON MONEY, and cannot: the y coordinate comes from
 * `plotRatio`, a 0..1 number Postgres computed on `numeric` (see
 * `lib/data/account-balances.ts`). Nothing here parses a balance — the figures
 * the client READS are rendered by the card, as the verbatim strings the office
 * published.
 *
 * A GAP IS A GAP. A period whose předvaha does not carry the account has no
 * point and no line segment through it; the polyline restarts on the far side.
 * Joining across it would draw a trend through a number nobody stated, which is
 * §0.4's confidently-wrong data in chart form. A dot marks every stated point,
 * so a lone island of data is still visible.
 *
 * DECORATIVE BY DECLARATION (`aria-hidden`). Everything it shows — the current
 * balance, its period, how many periods there are — is text in the card next to
 * it, so a screen reader reading the polyline's coordinates would be reading a
 * worse copy of what it just read. The card's own heading is the label.
 */

/** The drawing box, in SVG user units. Scaled by CSS, so these are ratios. */
const WIDTH = 120
const HEIGHT = 32
/** Half a stroke plus a dot radius, so a peak at ratio 1 is not clipped. */
const PADDING = 3

function x(index: number, count: number): number {
  if (count <= 1) return WIDTH / 2
  return (index / (count - 1)) * WIDTH
}

function y(ratio: number | null): number {
  // A flat series has no "between" (`plotRatio` is null for every point of one),
  // and is drawn down the middle rather than pinned to the top or the bottom.
  const clamped = ratio === null ? 0.5 : Math.min(Math.max(ratio, 0), 1)
  // SVG y grows downward; a HIGHER balance has to sit HIGHER on the screen.
  return PADDING + (1 - clamped) * (HEIGHT - PADDING * 2)
}

export function BalanceSparkline({
  series,
  className,
}: {
  series: readonly AccountBalancePoint[]
  className?: string
}) {
  const points = series.map((point, index) => ({
    stated: point.closingBalance !== null,
    x: x(index, series.length),
    y: y(point.plotRatio),
  }))

  // Contiguous runs of stated points. A run of one draws no polyline (two
  // points make a line), which is what the dots are for.
  const segments: { x: number; y: number }[][] = []
  let run: { x: number; y: number }[] = []
  for (const point of points) {
    if (point.stated) {
      run.push({ x: point.x, y: point.y })
      continue
    }
    if (run.length > 0) segments.push(run)
    run = []
  }
  if (run.length > 0) segments.push(run)

  const stated = points.filter((point) => point.stated)
  if (stated.length === 0) return null

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      // No `preserveAspectRatio="none"`: stretching the box would turn the
      // point markers into ellipses. The card renders it at the viewBox's own
      // 120×32, so nothing is scaled at all.
      className={className}
    >
      {segments
        .filter((segment) => segment.length > 1)
        .map((segment) => (
          <polyline
            key={`${segment[0]!.x}-${segment.length}`}
            points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      {stated.map((point) => (
        <circle
          key={`${point.x}-${point.y}`}
          cx={point.x}
          cy={point.y}
          r={1.5}
          fill="currentColor"
        />
      ))}
    </svg>
  )
}
