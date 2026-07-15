import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"

import { ProfileAppearanceForm } from "../../../_components/workspace/profile/profile-appearance-form"
import type { ProfileAppearanceData } from "../../../_components/workspace/profile/profile-appearance-form"

export const metadata = { title: "Appearance" }

export default async function ProfileAppearancePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/auth/login")

  const [user] = await withAdminBypass((db) =>
    db
      .select({
        locale: app_user.locale,
        theme: app_user.theme,
        iconStyle: app_user.icon_style,
        timezone: app_user.timezone,
        dateFormat: app_user.date_format,
        timeFormat: app_user.time_format,
      })
      .from(app_user)
      .where(eq(app_user.id, session.user.id))
      .limit(1),
  )

  const appearance: ProfileAppearanceData = {
    locale: user?.locale === "cs" ? "cs" : "en",
    theme: (user?.theme === "light" || user?.theme === "dark"
      ? user.theme
      : "system") as "system" | "light" | "dark",
    iconStyle: (user?.iconStyle === "phosphor" ||
    user?.iconStyle === "fontawesome"
      ? user.iconStyle
      : "lucide") as "lucide" | "phosphor" | "fontawesome",
    timezone: user?.timezone ?? "UTC",
    dateFormat: (user?.dateFormat === "MM/DD/YYYY" ||
    user?.dateFormat === "YYYY-MM-DD"
      ? user.dateFormat
      : "DD/MM/YYYY") as "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD",
    timeFormat: (user?.timeFormat === "12-hour" ? "12-hour" : "24-hour") as
      "24-hour" | "12-hour",
  }

  return (
    <ProfileAppearanceForm
      key={JSON.stringify(appearance)}
      appearance={appearance}
    />
  )
}
