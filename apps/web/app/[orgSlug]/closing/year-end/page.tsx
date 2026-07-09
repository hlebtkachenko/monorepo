import { YearEndLandingView } from "./_components/year-end-landing-view"

export const metadata = { title: "Year-end" }

/** Year-end landing — a launchpad to Statements, the only real year-end output built so far. */
export default async function YearEndPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <YearEndLandingView slug={orgSlug} />
}
