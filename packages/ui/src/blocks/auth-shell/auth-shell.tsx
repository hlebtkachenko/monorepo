import * as React from "react"
import { ChevronLeft } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Component used to render the back-link in `AuthShellHeader`. The UI
 * package can't depend on Next, so consumers inject a router-aware Link
 * (e.g. `next/link`) via `<AuthShellHeader.LinkComponent>` set as a
 * module-level slot, or pass `linkAs` per usage. If neither is supplied
 * we fall back to a plain `<a>` (full page reload — acceptable for
 * non-Next consumers like Storybook).
 */
type AnchorProps = Omit<React.ComponentProps<"a">, "ref">
type LinkComponentProps = AnchorProps & {
  href: string
  children: React.ReactNode
}
type LinkComponent = React.ComponentType<LinkComponentProps>
let LINK_COMPONENT: LinkComponent | null = null

/**
 * Set the router-aware link component used by every `AuthShellHeader`
 * instance in the current React tree. Call once at app boot (e.g. from
 * the root layout) with `next/link` to enable client-side navigation
 * for back links throughout auth + onboarding flows.
 */
export function setAuthShellLinkComponent(C: LinkComponent | null): void {
  LINK_COMPONENT = C
}

interface AuthShellProps extends React.ComponentProps<"div"> {
  children: React.ReactNode
}

function AuthShell({ className, children, ...props }: AuthShellProps) {
  return (
    <div
      data-slot="auth-shell"
      className={cn(
        // `minmax(0, Nfr)` instead of bare `Nfr` so aside content with
        // implicit `max-content` width (e.g. AuthAsideLogoMarquee) cannot
        // expand its track past its fraction share. Without this, the
        // marquee balloons the 3fr track and starves the 2fr form column
        // to zero width.
        "grid min-h-svh bg-background md:h-svh md:min-h-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:overflow-hidden",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface AuthShellHeaderProps extends React.ComponentProps<"header"> {
  backHref?: string
  backLabel?: string
}

function AuthShellHeader({
  className,
  children,
  backHref,
  backLabel = "Back",
  ...props
}: AuthShellHeaderProps) {
  const LinkOrAnchor: LinkComponent =
    LINK_COMPONENT ??
    (({ href, children, ...rest }) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ))

  return (
    <header
      data-slot="auth-shell-header"
      className={cn("flex flex-col gap-2 px-10 pt-10 pb-0", className)}
      {...props}
    >
      {backHref && (
        <LinkOrAnchor
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </LinkOrAnchor>
      )}
      {children}
    </header>
  )
}

function AuthShellBody({
  className,
  children,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="auth-shell-body"
      className={cn("flex flex-1 flex-col items-center px-10 py-10", className)}
      {...props}
    >
      <div className="my-auto w-full max-w-md">{children}</div>
    </main>
  )
}

function AuthShellFooter({
  className,
  children,
  ...props
}: React.ComponentProps<"footer">) {
  return (
    <footer
      data-slot="auth-shell-footer"
      className={cn(
        "flex items-center justify-end gap-4 px-10 py-10 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </footer>
  )
}

function AuthShellAside({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="auth-shell-aside"
      className={cn("hidden md:block", className)}
      {...props}
    >
      {children}
    </div>
  )
}

AuthShell.Header = AuthShellHeader
AuthShell.Body = AuthShellBody
AuthShell.Footer = AuthShellFooter
AuthShell.Aside = AuthShellAside

const AuthShellLeft = function AuthShellLeft({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="auth-shell-left"
      className={cn(
        "flex min-h-svh flex-col md:h-svh md:min-h-0 md:overflow-y-auto",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export {
  AuthShell,
  AuthShellHeader,
  AuthShellBody,
  AuthShellFooter,
  AuthShellAside,
  AuthShellLeft,
}
export type { AuthShellProps, AuthShellHeaderProps }
