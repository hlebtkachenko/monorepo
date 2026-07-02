import { AccountingOverview } from "../../_components/accounting-overview/accounting-overview"

export const metadata = { title: "Accounting" }

/**
 * Accounting module overview hub — the Launchpad archetype landing page for the
 * accounting module. Renders into the persistent org shell: the overview body
 * portals its own header (title + view tabs) into the shell's content-header
 * slot via `OrgPageHeader` and fills the `ContentPanel` with the card grid.
 *
 * The relative page slugs in the launchpad data are resolved against the org
 * here — `orgSlug` (from the route) is passed down so each card links to
 * `/${orgSlug}/${slug}`.
 */
export default async function AccountingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <AccountingOverview orgSlug={orgSlug} />
}
