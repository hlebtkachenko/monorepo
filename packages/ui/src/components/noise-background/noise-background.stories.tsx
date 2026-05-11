import type { Meta, StoryObj } from "@storybook/react"
import { NoiseBackground } from "./noise-background"

const meta: Meta<typeof NoiseBackground> = {
  title: "Components/NoiseBackground",
  component: NoiseBackground,
}
export default meta
type Story = StoryObj<typeof NoiseBackground>

export const Default: Story = {
  render: () => (
    <NoiseBackground containerClassName="h-60 w-full max-w-lg">
      <div className="flex h-full items-center justify-center text-lg font-semibold text-foreground">
        Animated noise background
      </div>
    </NoiseBackground>
  ),
}

export const HighIntensity: Story = {
  render: () => (
    <NoiseBackground
      containerClassName="h-60 w-full max-w-lg"
      noiseIntensity={0.5}
    >
      <div className="flex h-full items-center justify-center text-lg font-semibold text-foreground">
        Heavy noise
      </div>
    </NoiseBackground>
  ),
}

export const Static: Story = {
  render: () => (
    <NoiseBackground
      containerClassName="h-60 w-full max-w-lg"
      animating={false}
    >
      <div className="flex h-full items-center justify-center text-lg font-semibold text-foreground">
        No motion
      </div>
    </NoiseBackground>
  ),
}

export const BackdropBlur: Story = {
  render: () => (
    <NoiseBackground containerClassName="h-60 w-full max-w-lg" backdropBlur>
      <div className="flex h-full items-center justify-center text-lg font-semibold text-foreground">
        Blurred backdrop
      </div>
    </NoiseBackground>
  ),
}

export const CustomTokens: Story = {
  render: () => (
    <NoiseBackground
      containerClassName="h-60 w-full max-w-lg"
      gradientColors={["var(--destructive)", "var(--purple)", "var(--info)"]}
    >
      <div className="flex h-full items-center justify-center text-lg font-semibold text-foreground">
        Custom tokens
      </div>
    </NoiseBackground>
  ),
}
