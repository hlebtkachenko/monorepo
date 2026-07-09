export interface EffectiveFact<T> {
  sourceId: string
  validFrom: string
  validTo: string | null
  value: T
}

export type EffectiveSegment<T> =
  | {
      status: "KNOWN"
      from: string
      to: string
      fact: EffectiveFact<T>
    }
  | {
      status: "UNKNOWN"
      from: string
      to: string
    }

function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function laterDate(a: string, b: string): string {
  return a > b ? a : b
}

function earlierDate(a: string, b: string): string {
  return a < b ? a : b
}

/**
 * Resolve non-overlapping, effective-dated facts over one inclusive interval.
 * Gaps stay UNKNOWN. Overlaps fail loudly because both profile tables reject
 * them at the database boundary and silently choosing one would hide drift.
 */
export function resolveEffectiveTimeline<T>(input: {
  from: string
  to: string
  facts: ReadonlyArray<EffectiveFact<T>>
}): EffectiveSegment<T>[] {
  const facts = [...input.facts]
    .filter(
      (fact) =>
        fact.validFrom <= input.to &&
        (fact.validTo === null || fact.validTo >= input.from),
    )
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom))

  const segments: EffectiveSegment<T>[] = []
  let cursor = input.from

  for (const fact of facts) {
    const from = laterDate(input.from, fact.validFrom)
    const to = earlierDate(input.to, fact.validTo ?? input.to)

    if (from < cursor) {
      throw new Error(
        `Overlapping effective facts ${fact.sourceId} at ${from}; expected ${cursor} or later.`,
      )
    }
    if (from > cursor) {
      segments.push({
        status: "UNKNOWN",
        from: cursor,
        to: shiftIsoDate(from, -1),
      })
    }
    segments.push({ status: "KNOWN", from, to, fact })
    cursor = shiftIsoDate(to, 1)
  }

  if (cursor <= input.to) {
    segments.push({ status: "UNKNOWN", from: cursor, to: input.to })
  }

  return segments
}

/** Return one value only when the complete interval is known and invariant. */
export function singleEffectiveValue<T>(
  timeline: ReadonlyArray<EffectiveSegment<T>>,
  equals: (a: T, b: T) => boolean,
): T | undefined {
  const first = timeline[0]
  if (!first || first.status !== "KNOWN") return undefined
  const value = first.fact.value
  for (const segment of timeline) {
    if (segment.status !== "KNOWN" || !equals(value, segment.fact.value)) {
      return undefined
    }
  }
  return value
}
