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
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">/{orgSlug}</p>
      </header>
      <p className="text-sm text-muted-foreground">
        Organization dashboard: context-specific widgets land here.
      </p>
    </div>
  )
}
