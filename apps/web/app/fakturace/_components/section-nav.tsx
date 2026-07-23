"use client"

// Anchor navigation — jump to any section ("return to filling on any step"),
// while the whole editor stays a single scrollable page. Screen-only.

const SECTIONS = [
  { id: "supplier", label: "1. Dodavatel" },
  { id: "customer", label: "2. Odběratel" },
  { id: "services", label: "3. Služby" },
  { id: "output", label: "4. Faktura a report" },
]

export function SectionNav() {
  return (
    <nav className="no-print flex flex-wrap gap-2">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-blue-400 hover:text-blue-600"
        >
          {s.label}
        </a>
      ))}
    </nav>
  )
}
