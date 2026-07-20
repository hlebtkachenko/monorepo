import { redirect } from "next/navigation"

import { orgHref } from "@/lib/org/href"

/**
 * Adresář module landing. The module has one built page so far (the Státy public
 * register); land there. As more Directories pages are rebuilt this becomes a real
 * module overview.
 */
export default async function AdresarIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(orgHref(orgSlug, "adresar/ciselniky/staty"))
}
