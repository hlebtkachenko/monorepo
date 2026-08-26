import { redirect } from "next/navigation"

import { nastaveniHref, NASTAVENI_DEFAULT_SLUG } from "./_nav/nastaveni-nav"

/**
 * `/[orgSlug]/nastaveni` — the route the spec names (§2.10) and the account
 * menu links to. It has no body of its own: Nastavení is a set of tabs, and the
 * first one is Společnost.
 *
 * A redirect rather than rendering Společnost here, so there is exactly ONE
 * canonical URL per tab — two routes rendering the same page would make the tab
 * row's active state depend on which link the user happened to follow.
 */
export default async function NastaveniIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  redirect(nastaveniHref(orgSlug, NASTAVENI_DEFAULT_SLUG))
}
