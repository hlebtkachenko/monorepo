import { Button } from "@workspace/ui/components/button"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import { ArrowRightIcon, ArrowUpRight } from "@workspace/ui/lib/icons"

/**
 * Shared landing cards for token-link flows (signup + invite), previously
 * duplicated per page in apps/web:
 *
 *   - `AuthTokenContinueCard`: the intermediate "Continue" form a token link
 *     lands on. The POST defers the actual token redemption to a human-driven
 *     submit, so email prefetch scanners can't burn the token by GET'ing the
 *     URL.
 *   - `AuthTokenInvalidCard`: the generic error card the consume route
 *     bounces back to — deliberately free of failure-mode details.
 *
 * Presentational and server-component-safe: localized strings arrive
 * resolved via props.
 */

export interface AuthTokenContinueCardProps {
  title: string
  description: string
  continueLabel: string
  /** POST target of the consume submit (e.g. `/auth/signup/consume`). */
  action: string
  /** Raw token carried in the form body. */
  token: string
  /** Small muted footnote under the form (the brand name). */
  footnote?: string
}

export function AuthTokenContinueCard({
  title,
  description,
  continueLabel,
  action,
  token,
  footnote,
}: AuthTokenContinueCardProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {title}
        </Heading>
        <Text variant="muted">{description}</Text>
      </header>

      <form method="POST" action={action}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" size="xl" className="w-full">
          {continueLabel}
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </Button>
      </form>

      {footnote ? (
        <Text variant="muted" className="text-sm">
          {footnote}
        </Text>
      ) : null}
    </div>
  )
}

export interface AuthTokenInvalidCardProps {
  title: string
  description: string
  contactLabel: string
  /** Support destination ("#" until the support link is wired). */
  contactHref: string
}

export function AuthTokenInvalidCard({
  title,
  description,
  contactLabel,
  contactHref,
}: AuthTokenInvalidCardProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Heading level={2} className="mt-0">
          {title}
        </Heading>
        <Text variant="muted">{description}</Text>
      </header>
      <Button asChild size="xl">
        <a href={contactHref}>
          {contactLabel}
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </Button>
    </div>
  )
}
