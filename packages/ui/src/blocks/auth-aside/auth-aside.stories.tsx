import type { Meta, StoryObj } from "@storybook/react"

import { AuthAside } from "./auth-aside"

const meta: Meta<typeof AuthAside> = {
  title: "Blocks/AuthAside",
  component: AuthAside,
  parameters: {
    layout: "fullscreen",
  },
}
export default meta

type Story = StoryObj<typeof AuthAside>

const DEMO_LOGOS = [
  { src: "https://placehold.co/80x24/white/gray?text=Logo", alt: "Logo A" },
  { src: "https://placehold.co/80x24/white/gray?text=Brand", alt: "Brand B" },
  { src: "https://placehold.co/80x24/white/gray?text=Corp", alt: "Corp C" },
  { src: "https://placehold.co/80x24/white/gray?text=Inc", alt: "Inc D" },
]

export const AuthAsidePhoto: Story = {
  render: () => (
    <AuthAside
      variant="photo"
      image="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80"
    >
      <AuthAside.Headline>Built for modern teams.</AuthAside.Headline>
      <AuthAside.Subtitle>
        Trusted by hundreds of firms across Europe.
      </AuthAside.Subtitle>
    </AuthAside>
  ),
}

export const AuthAsideDark: Story = {
  render: () => (
    <AuthAside variant="dark">
      <AuthAside.Headline>Dark variant.</AuthAside.Headline>
      <AuthAside.Subtitle>
        Solid foreground background, no image needed.
      </AuthAside.Subtitle>
    </AuthAside>
  ),
}

export const AuthAsideTone: Story = {
  render: () => (
    <AuthAside variant="tone">
      <AuthAside.Headline>Tone variant.</AuthAside.Headline>
      <AuthAside.Subtitle>
        Muted background, foreground text.
      </AuthAside.Subtitle>
    </AuthAside>
  ),
}

export const AuthAsideAllSlots: Story = {
  render: () => (
    <AuthAside
      variant="photo"
      image="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80"
    >
      <div className="flex flex-col gap-4">
        <AuthAside.Headline>
          Built for modern accounting teams.
        </AuthAside.Headline>
        <AuthAside.Subtitle>
          Trusted by hundreds of firms across Central Europe.
        </AuthAside.Subtitle>
      </div>
      <div className="flex flex-col gap-6">
        <AuthAside.Quote author="Jana Nováková" role="Senior Accountant">
          Afframe cut our monthly close from 3 days to half a day.
        </AuthAside.Quote>
        <AuthAside.LogoMarquee logos={DEMO_LOGOS} />
      </div>
    </AuthAside>
  ),
}
