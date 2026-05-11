import { Marquee } from "@workspace/ui/components/marquee"

const items = [
  "Next.js",
  "React",
  "TypeScript",
  "Tailwind",
  "Vitest",
  "Storybook",
  "Turborepo",
  "Radix UI",
]

export function MarqueeDemo() {
  return (
    <div className="flex flex-col gap-6">
      <Marquee pauseOnHover className="max-w-2xl">
        {items.map((label) => (
          <span
            key={label}
            className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-sm"
          >
            {label}
          </span>
        ))}
      </Marquee>
      <Marquee
        reverse
        pauseOnHover
        style={{ "--duration": "20s" } as React.CSSProperties}
        className="max-w-2xl"
      >
        {items.map((label) => (
          <span
            key={label}
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1 text-sm shadow-sm"
          >
            {label}
          </span>
        ))}
      </Marquee>
    </div>
  )
}
