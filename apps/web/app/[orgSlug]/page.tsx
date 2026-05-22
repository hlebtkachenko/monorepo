import { AppShell } from "@workspace/ui/blocks/app-shell"

export const metadata = {
  title: "Dashboard",
}

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return (
    <AppShell
      header={<div className="size-full" />}
      rail={<div className="size-full" />}
      sidebar={<div className="size-full" />}
      assistant={<div className="size-full" />}
      logoHref={`/${orgSlug}`}
    >
      <div className="size-full" />
    </AppShell>
  )
}
