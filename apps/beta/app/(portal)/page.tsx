import { getBetaTranslations } from "@/i18n/translations-server"

/**
 * Portal root. A landing card until auth lands (PR 06), at which point this
 * route becomes the membership resolver: one active org → redirect to it,
 * several → the org picker, none → sign-in.
 */
export default async function PortalHomePage() {
  const t = await getBetaTranslations()
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {t("landing.heading")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("landing.intro")}</p>
      </div>
    </div>
  )
}
