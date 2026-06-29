import Link from "next/link"

const TABS = [
  { label: "Summary", slug: "" },
  { label: "Members", slug: "members" },
  { label: "Activity", slug: "activity" },
  { label: "Billing", slug: "billing" },
  { label: "Data", slug: "data" },
  { label: "Integrations", slug: "integrations" },
  { label: "Agents", slug: "agents" },
]

interface OrgTabNavProps {
  id: string
  active: string
}

export function OrgTabNav({ id, active }: OrgTabNavProps) {
  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const href = `/orgs/${id}${tab.slug ? `/${tab.slug}` : ""}`
        const isActive = tab.slug === active
        return (
          <Link
            key={tab.label}
            href={href}
            className={[
              "px-3 py-2 text-sm font-medium transition-colors hover:text-foreground",
              isActive
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
