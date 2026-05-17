import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { Heading } from "@workspace/ui/components/heading"
import { Marquee } from "@workspace/ui/components/marquee"
import { Text } from "@workspace/ui/components/text"
import { cn } from "@workspace/ui/lib/utils"

const authAsideVariants = cva(
  "relative flex h-full min-h-svh flex-col overflow-hidden p-10",
  {
    variants: {
      variant: {
        // photo + dark: a permanently-dark surface (photo sits under a
        // hardcoded-black scrim). Text is fixed light, never theme-flipped —
        // text-background would turn near-black in dark mode and vanish.
        photo: "bg-neutral-950 text-white",
        dark: "bg-neutral-950 text-white",
        tone: "bg-muted text-foreground",
      },
    },
    defaultVariants: {
      variant: "photo",
    },
  },
)

const bgAlignClass = {
  center: "bg-center",
  left: "bg-left",
  right: "bg-right",
} as const

type BgAlign = keyof typeof bgAlignClass

interface AuthAsideProps
  extends
    React.ComponentProps<"aside">,
    VariantProps<typeof authAsideVariants> {
  image?: string
  /** Background image alignment when variant="photo". Defaults to "center". */
  bgAlign?: BgAlign
}

/**
 * Detect whether children include a Top or Bottom slot. When present, the
 * inner content wrapper switches to `flex-1 justify-between` so the two
 * clusters anchor to top + bottom of the aside. Otherwise the original
 * `flex flex-col gap-6` (top-stacked) layout applies so existing usages
 * don't shift.
 */
function hasAnchorSlot(children: React.ReactNode): boolean {
  let found = false
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const componentType = child.type as { displayName?: string } | string
    if (typeof componentType === "string") return
    const name = componentType.displayName
    if (name === "AuthAsideTop" || name === "AuthAsideBottom") found = true
  })
  return found
}

function AuthAside({
  className,
  variant = "photo",
  image,
  bgAlign = "center",
  children,
  ...props
}: AuthAsideProps) {
  const isPhoto = variant === "photo"
  const split = hasAnchorSlot(children)

  return (
    <aside
      role="complementary"
      data-slot="auth-aside"
      data-variant={variant}
      className={cn(authAsideVariants({ variant }), className)}
      style={
        isPhoto && image
          ? ({
              "--auth-aside-image": `url(${JSON.stringify(image)})`,
            } as React.CSSProperties)
          : undefined
      }
      {...props}
    >
      {isPhoto && (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 bg-[image:var(--auth-aside-image)] bg-cover [@media(prefers-reduced-data:reduce)]:hidden",
              bgAlignClass[bgAlign],
            )}
          />
          {/* Two stacked radial gradients, each anchored to a text
              cluster region (top-left + bottom-left of the aside). The
              scrim spans the FULL aside via `inset-0`, so there is no
              container edge to terminate the gradient against — alpha
              fades smoothly into the photo. Stops mirror the design
              source (Onboarding-monorepo/auth/styles.css). */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_35%_at_28%_18%,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.35)_35%,rgba(0,0,0,0.15)_65%,rgba(0,0,0,0.05)_85%,transparent_100%),radial-gradient(ellipse_55%_30%_at_25%_82%,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0.35)_35%,rgba(0,0,0,0.15)_65%,rgba(0,0,0,0.05)_85%,transparent_100%)] [@media(prefers-reduced-data:reduce)]:hidden"
          />
          {/* Dark-mode-only dim layer — deepens the photo so it sits
              quieter behind the app's dark theme. No-op in light mode. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden bg-black/25 dark:block [@media(prefers-reduced-data:reduce)]:!hidden"
          />
        </>
      )}
      <div
        className={cn(
          "relative flex flex-col gap-6",
          split && "h-full flex-1 justify-between",
        )}
      >
        {children}
      </div>
    </aside>
  )
}

function AuthAsideHeadline({
  className,
  children,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <Heading
      level={1}
      data-slot="auth-aside-headline"
      className={cn("mt-0 max-w-xl font-semibold lg:text-4xl", className)}
      {...props}
    >
      {children}
    </Heading>
  )
}

function AuthAsideSubtitle({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <Text
      variant="muted"
      data-slot="auth-aside-subtitle"
      className={cn("max-w-xl text-current opacity-80", className)}
      {...props}
    >
      {children}
    </Text>
  )
}

interface AuthAsideQuoteProps extends React.ComponentProps<"figure"> {
  author: string
  role?: string
}

function AuthAsideQuote({
  className,
  children,
  author,
  role,
  ...props
}: AuthAsideQuoteProps) {
  return (
    <figure
      data-slot="auth-aside-quote"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      <Text
        asChild
        variant="lead"
        className="max-w-xl text-current opacity-95 before:content-['“'] after:content-['”']"
      >
        <blockquote>{children}</blockquote>
      </Text>
      <Text asChild variant="small" className="text-current opacity-75">
        <figcaption>
          <span className="font-medium">{author}</span>
          {role && <span className="font-normal opacity-80"> — {role}</span>}
        </figcaption>
      </Text>
    </figure>
  )
}

interface LogoItem {
  src: string
  alt: string
}

interface AuthAsideLogoMarqueeProps extends React.ComponentProps<"div"> {
  logos: LogoItem[]
  speed?: string
}

function AuthAsideLogoMarquee({
  className,
  logos,
  speed = "30s",
  ...props
}: AuthAsideLogoMarqueeProps) {
  if (logos.length === 0) return null

  return (
    <div
      data-slot="auth-aside-logo-marquee"
      className={cn("w-full overflow-hidden", className)}
      {...props}
    >
      <Marquee
        repeat={3}
        pauseOnHover
        className="[--duration:var(--marquee-speed,30s)] [--gap:2rem]"
        style={{ "--marquee-speed": speed } as React.CSSProperties}
      >
        {logos.map((logo) => (
          <img
            key={logo.src}
            src={logo.src}
            alt={logo.alt}
            className="h-6 w-auto max-w-[80px] object-contain opacity-70"
          />
        ))}
      </Marquee>
    </div>
  )
}

/**
 * Slot wrapper that anchors its contents to the TOP of the aside.
 * Use with `<AuthAside.Bottom>` to get a top+bottom split layout
 * (headline+subtitle at top, quote+marquee at bottom). When either
 * Top or Bottom is present, AuthAside swaps its inner wrapper to
 * `flex-1 justify-between` so the clusters anchor properly.
 */
function AuthAsideTop({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="auth-aside-top"
      className={cn("relative flex max-w-xl flex-col gap-3", className)}
      {...props}
    >
      {children}
    </div>
  )
}
AuthAsideTop.displayName = "AuthAsideTop"

/** See `AuthAsideTop` — anchors contents to the BOTTOM of the aside. */
function AuthAsideBottom({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="auth-aside-bottom"
      className={cn("relative flex max-w-xl flex-col gap-5", className)}
      {...props}
    >
      {children}
    </div>
  )
}
AuthAsideBottom.displayName = "AuthAsideBottom"

AuthAside.Headline = AuthAsideHeadline
AuthAside.Subtitle = AuthAsideSubtitle
AuthAside.Quote = AuthAsideQuote
AuthAside.LogoMarquee = AuthAsideLogoMarquee
AuthAside.Top = AuthAsideTop
AuthAside.Bottom = AuthAsideBottom

export {
  AuthAside,
  AuthAsideHeadline,
  AuthAsideSubtitle,
  AuthAsideQuote,
  AuthAsideLogoMarquee,
  AuthAsideTop,
  AuthAsideBottom,
  authAsideVariants,
}
export type {
  AuthAsideProps,
  AuthAsideQuoteProps,
  AuthAsideLogoMarqueeProps,
  LogoItem,
  BgAlign,
}
