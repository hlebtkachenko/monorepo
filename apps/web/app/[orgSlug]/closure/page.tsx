import { SectionStub } from "../_components/section-stub"

export const metadata = { title: "Closure" }

export default async function ClosurePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <SectionStub title="Closure" orgSlug={orgSlug} />
}
