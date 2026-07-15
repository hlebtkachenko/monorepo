import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"
import {
  BRAND_COOKIES_URL,
  BRAND_PRIVACY_URL,
  BRAND_TERMS_URL,
} from "@workspace/ui/brand-assets"

import { ProfilePrivacyForm } from "@/app/_components/workspace/profile/profile-privacy-form"

export const metadata = { title: "Privacy" }

export default async function ProfilePrivacyPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const [user] = await withAdminBypass((db) =>
    db
      .select({
        marketingConsent: app_user.marketing_consent,
        productUpdatesConsent: app_user.product_updates_consent,
      })
      .from(app_user)
      .where(eq(app_user.id, session.user.id))
      .limit(1),
  )

  const privacy = {
    marketingConsent: user?.marketingConsent ?? false,
    productUpdatesConsent: user?.productUpdatesConsent ?? false,
  }

  return (
    <ProfilePrivacyForm
      key={JSON.stringify(privacy)}
      privacy={privacy}
      legalUrls={{
        privacy: BRAND_PRIVACY_URL,
        cookies: BRAND_COOKIES_URL,
        terms: BRAND_TERMS_URL,
      }}
    />
  )
}
