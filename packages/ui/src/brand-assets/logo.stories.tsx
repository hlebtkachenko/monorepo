import type { Meta, StoryObj } from "@storybook/react"

import { Logo } from "./logo"
import type { LogoTone, LogoVariant } from "./logo-types"

const meta: Meta<typeof Logo> = {
  title: "BrandAssets/Logo",
  component: Logo,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "select",
      options: ["horizontal", "stacked", "logomark", "wordmark"],
    },
    tone: {
      control: "select",
      options: [
        "primary",
        "primary-light",
        "primary-dark",
        "admin",
        "admin-light",
        "admin-dark",
        "mono",
        "mono-light",
        "mono-dark",
      ],
    },
  },
}
export default meta

type Story = StoryObj<typeof Logo>

const VARIANTS: LogoVariant[] = [
  "horizontal",
  "stacked",
  "logomark",
  "wordmark",
]
const EXPLICIT: LogoTone[] = [
  "primary-light",
  "primary-dark",
  "admin-light",
  "admin-dark",
  "mono-light",
  "mono-dark",
]
const SUGAR: LogoTone[] = ["primary", "admin", "mono"]

const VARIANT_HEIGHT: Record<LogoVariant, string> = {
  horizontal: "h-12",
  stacked: "h-32",
  logomark: "h-16",
  wordmark: "h-12",
}

export const Default: Story = {
  args: { variant: "horizontal", tone: "primary" },
}

export const AllVariantsAdaptivePrimary: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-12">
      {VARIANTS.map((v) => (
        <div key={v} className="flex flex-col items-center gap-2">
          <Logo variant={v} tone="primary" className={VARIANT_HEIGHT[v]} />
          <span className="text-xs text-muted-foreground">{v}</span>
        </div>
      ))}
    </div>
  ),
}

export const ExplicitToneMatrix: Story = {
  render: () => (
    <div className="space-y-8">
      {EXPLICIT.map((tone) => {
        const isDarkBg = tone.endsWith("-light") && tone.startsWith("mono")
        return (
          <div
            key={tone}
            className={`rounded-lg p-6 ${isDarkBg ? "bg-neutral-900" : "bg-background"}`}
          >
            <div className="mb-3 font-mono text-xs text-muted-foreground">
              tone={tone}
            </div>
            <div className="grid grid-cols-4 items-center gap-6">
              {VARIANTS.map((v) => (
                <Logo
                  key={v}
                  variant={v}
                  tone={tone}
                  className={VARIANT_HEIGHT[v]}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  ),
}

export const SugarTonesAdaptive: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Adaptive sugar tones (primary, admin, mono) flip via the .dark class on a parent. Toggle Storybook's theme to see the swap.",
      },
    },
  },
  render: () => (
    <div className="space-y-8">
      {SUGAR.map((tone) => (
        <div key={tone} className="rounded-lg bg-background p-6">
          <div className="mb-3 font-mono text-xs text-muted-foreground">
            tone={tone}
          </div>
          <div className="grid grid-cols-4 items-center gap-6">
            {VARIANTS.map((v) => (
              <Logo
                key={v}
                variant={v}
                tone={tone}
                className={VARIANT_HEIGHT[v]}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
}

export const OnColoredHero: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Forcing mono-light on a brand-colored surface — explicit tones override theme.",
      },
    },
  },
  render: () => (
    <div className="space-y-4">
      <div className="rounded-lg bg-[var(--brand-primary-light)] p-12">
        <Logo variant="horizontal" tone="mono-light" className="h-12" />
      </div>
      <div className="rounded-lg bg-[var(--brand-admin-light)] p-12">
        <Logo variant="horizontal" tone="mono-light" className="h-12" />
      </div>
      <div className="rounded-lg bg-[var(--brand-mono-dark)] p-12">
        <Logo variant="horizontal" tone="primary-dark" className="h-12" />
      </div>
    </div>
  ),
}
