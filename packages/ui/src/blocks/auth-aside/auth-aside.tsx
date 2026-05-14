import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { Marquee } from "@workspace/ui/components/marquee"
import { cn } from "@workspace/ui/lib/utils"

const authAsideVariants = cva(
  "relative flex h-full min-h-svh flex-col justify-between overflow-hidden p-10",
  {
    variants: {
      variant: {
        photo: "bg-foreground text-background",
        dark: "bg-foreground text-background",
        tone: "bg-muted text-foreground",
      },
    },
    defaultVariants: {
      variant: "photo",
    },
  },
)

interface AuthAsideProps
  extends
    React.ComponentProps<"aside">,
    VariantProps<typeof authAsideVariants> {
  image?: string
}

function AuthAside({
  className,
  variant = "photo",
  image,
  children,
  ...props
}: AuthAsideProps) {
  const isPhoto = variant === "photo"

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
          {/* Background image layer — hidden when prefers-reduced-data */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[image:var(--auth-aside-image)] bg-cover bg-center [@media(prefers-reduced-data:reduce)]:hidden"
          />
          {/* Radial dark scrim for legibility */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.55)_100%)] [@media(prefers-reduced-data:reduce)]:hidden"
          />
        </>
      )}
      <div className="relative flex flex-col gap-6">{children}</div>
    </aside>
  )
}

function AuthAsideHeadline({
  className,
  children,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="auth-aside-headline"
      className={cn(
        "font-heading text-2xl leading-tight font-semibold tracking-tight md:text-3xl",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  )
}

function AuthAsideSubtitle({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="auth-aside-subtitle"
      className={cn("text-base opacity-80", className)}
      {...props}
    >
      {children}
    </p>
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
      <blockquote className="text-sm leading-relaxed opacity-90 before:content-['“'] after:content-['”']">
        {children}
      </blockquote>
      <figcaption className="flex flex-col gap-0.5 text-xs opacity-70">
        <span className="font-medium">{author}</span>
        {role && <span>{role}</span>}
      </figcaption>
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

AuthAside.Headline = AuthAsideHeadline
AuthAside.Subtitle = AuthAsideSubtitle
AuthAside.Quote = AuthAsideQuote
AuthAside.LogoMarquee = AuthAsideLogoMarquee

export {
  AuthAside,
  AuthAsideHeadline,
  AuthAsideSubtitle,
  AuthAsideQuote,
  AuthAsideLogoMarquee,
  authAsideVariants,
}
export type {
  AuthAsideProps,
  AuthAsideQuoteProps,
  AuthAsideLogoMarqueeProps,
  LogoItem,
}
