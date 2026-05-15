import type { Meta, StoryObj } from "@storybook/react"

import { AuthAside } from "@workspace/ui/blocks/auth-aside"
import { AuthShell } from "./auth-shell"

const meta: Meta<typeof AuthShell> = {
  title: "Blocks/AuthShell",
  component: AuthShell,
  parameters: {
    layout: "fullscreen",
  },
}
export default meta

type Story = StoryObj<typeof AuthShell>

const MockLogo = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="none"
    aria-label="Afframe"
    role="img"
  >
    <rect width="32" height="32" rx="8" fill="currentColor" />
    <text x="8" y="22" fontSize="14" fontWeight="bold" fill="white">
      A
    </text>
  </svg>
)

const MockBodyCard = () => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-2">
      <h1 className="font-heading text-2xl font-semibold">Sign in</h1>
      <p className="text-sm text-muted-foreground">
        Enter your email to continue.
      </p>
    </div>
    <div className="flex flex-col gap-3">
      <div className="flex h-9 items-center rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground">
        email@example.com
      </div>
      <div className="flex h-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground">
        Continue
      </div>
    </div>
  </div>
)

const DEMO_LOGOS = [
  { src: "https://placehold.co/80x24/white/gray?text=Logo", alt: "Logo A" },
  { src: "https://placehold.co/80x24/white/gray?text=Brand", alt: "Brand B" },
  { src: "https://placehold.co/80x24/white/gray?text=Corp", alt: "Corp C" },
  { src: "https://placehold.co/80x24/white/gray?text=Inc", alt: "Inc D" },
]

export const AuthShellDefault: Story = {
  render: () => (
    <AuthShell>
      <div className="flex flex-col">
        <AuthShell.Header backHref="/landing" backLabel="Back to home">
          <MockLogo />
        </AuthShell.Header>
        <AuthShell.Body>
          <MockBodyCard />
        </AuthShell.Body>
        <AuthShell.Footer>
          <span>Privacy</span>
          <span>Terms</span>
          <span>EN</span>
        </AuthShell.Footer>
      </div>
      <AuthShell.Aside>
        <AuthAside
          variant="photo"
          image="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80"
        >
          <AuthAside.Headline>
            Built for modern accounting teams.
          </AuthAside.Headline>
          <AuthAside.Subtitle>
            Trusted by hundreds of firms across Central Europe.
          </AuthAside.Subtitle>
          <div className="mt-auto flex flex-col gap-6">
            <AuthAside.Quote author="Jana Nováková" role="Senior Accountant">
              Afframe cut our monthly close from 3 days to half a day.
            </AuthAside.Quote>
            <AuthAside.LogoMarquee logos={DEMO_LOGOS} />
          </div>
        </AuthAside>
      </AuthShell.Aside>
    </AuthShell>
  ),
}

export const AuthShellMobile: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  render: () => (
    <AuthShell>
      <div className="flex flex-col">
        <AuthShell.Header>
          <MockLogo />
        </AuthShell.Header>
        <AuthShell.Body>
          <MockBodyCard />
        </AuthShell.Body>
        <AuthShell.Footer>
          <span>Privacy</span>
          <span>Terms</span>
        </AuthShell.Footer>
      </div>
      <AuthShell.Aside>
        <AuthAside variant="dark">
          <AuthAside.Headline>Not visible on mobile</AuthAside.Headline>
        </AuthAside>
      </AuthShell.Aside>
    </AuthShell>
  ),
}
