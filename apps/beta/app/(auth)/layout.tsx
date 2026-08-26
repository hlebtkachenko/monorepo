import { Logo } from "@workspace/ui/brand-assets"
import { Badge } from "@workspace/ui/components/badge"

import { getBetaTranslations } from "@/i18n/translations-server"

/**
 * The unauthenticated surface: sign-in and the one-time link flows. It lives
 * OUTSIDE the `(portal)` group on purpose — the app shell (rail, header,
 * org chrome) is never drawn for a visitor who has no session.
 */
export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const t = await getBetaTranslations()
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-canvas p-6">
      <div className="flex items-center gap-2">
        <Logo variant="horizontal" className="h-6 w-auto" />
        <Badge variant="secondary">{t("app.badge")}</Badge>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}
