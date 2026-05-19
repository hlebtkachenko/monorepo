import Link from "next/link"
import { getTranslations } from "@workspace/i18n/server"
import { Button } from "@workspace/ui/components/button"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import { ArrowRightIcon, ArrowUpRight } from "@workspace/ui/lib/icons"

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata() {
  const t = await getTranslations("auth.signup.landing")
  return { title: t("metaTitle") }
}

/**
 * GET /auth/signup/landing?token=<raw>
 *
 * Intermediate "Click to continue" landing page. Renders a confirm card
 * so the user (not an email prefetch scanner) is the one who POSTs the
 * token for consumption. The token is read from the URL query param and
 * placed in a hidden form field — it is never written to a cookie here.
 *
 * If ?invalid=1 is present (set by the POST handler on any failure),
 * renders a generic error card with no failure-mode details.
 *
 * ADR-0022 §"Mandatory companions" #1.
 */
export default async function SignupLandingPage({ searchParams }: Props) {
  const t = await getTranslations("auth.signup.landing")
  const tBrand = await getTranslations("brand")
  const brandName = tBrand("name")

  const params = await searchParams
  const token = typeof params["token"] === "string" ? params["token"] : null
  const isInvalid = params["invalid"] === "1"

  if (isInvalid || !token) {
    return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Heading level={2} className="mt-0">
            {t("invalid.title")}
          </Heading>
          <Text variant="muted">{t("invalid.description")}</Text>
        </header>
        <Button asChild size="xl">
          <Link href="#">
            {t("invalid.contactSupport")}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {t("title")}
        </Heading>
        <Text variant="muted">{t("descriptionGeneric")}</Text>
      </header>

      <form method="POST" action="/auth/signup/landing/consume">
        <input type="hidden" name="token" value={token} />
        <Button type="submit" size="xl" className="w-full">
          {t("continue")}
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Button>
      </form>

      <Text variant="muted" className="text-sm">
        {brandName}
      </Text>
    </div>
  )
}
