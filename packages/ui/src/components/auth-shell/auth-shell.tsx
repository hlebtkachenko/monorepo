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
        "grid min-h-svh bg-background md:grid-cols-[2fr_3fr]",
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
      className={cn("flex flex-col gap-2 px-6 pt-6 pb-0", className)}
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
      className={cn(
        "flex flex-1 items-center justify-center px-6 py-8",
        className,
      )}
      {...props}
    >
      <div className="w-full max-w-lg">{children}</div>
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
        "flex items-center justify-end gap-4 px-6 py-4 text-sm text-muted-foreground",
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
      className={cn("flex flex-col", className)}
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
