import type { Meta, StoryObj } from "@storybook/react"
import { expect, within } from "storybook/test"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./carousel"

const meta: Meta<typeof Carousel> = {
  title: "Components/Carousel",
  component: Carousel,
}
export default meta
type Story = StoryObj<typeof Carousel>

export const Default: Story = {
  render: () => (
    <div className="flex justify-center px-16 py-8">
      <Carousel className="w-full max-w-sm">
        <CarouselContent>
          {[1, 2, 3].map((n) => (
            <CarouselItem key={n}>
              <div className="flex h-32 items-center justify-center rounded-lg border bg-muted text-2xl font-semibold">
                Slide {n}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("Slide 1")).toBeVisible()
    const next = canvas.getByRole("button", { name: /next/i })
    await expect(next).toBeInTheDocument()
  },
}

export const Vertical: Story = {
  render: () => (
    <div className="flex justify-center py-8">
      <Carousel orientation="vertical" className="w-full max-w-sm">
        <CarouselContent className="h-48">
          {[1, 2, 3].map((n) => (
            <CarouselItem key={n}>
              <div className="flex h-32 items-center justify-center rounded-lg border bg-muted text-2xl font-semibold">
                Slide {n}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
}

export const OrientationHorizontal: Story = {
  render: () => (
    <div className="flex justify-center px-16 py-8">
      <Carousel orientation="horizontal" className="w-full max-w-sm">
        <CarouselContent>
          {[1, 2, 3].map((n) => (
            <CarouselItem key={n}>
              <div className="flex h-32 items-center justify-center rounded-lg border bg-muted text-2xl font-semibold">
                Slide {n}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
}

export const OrientationVertical: Story = {
  render: () => (
    <div className="flex justify-center py-8">
      <Carousel orientation="vertical" className="w-full max-w-sm">
        <CarouselContent className="h-48">
          {[1, 2, 3].map((n) => (
            <CarouselItem key={n}>
              <div className="flex h-32 items-center justify-center rounded-lg border bg-muted text-2xl font-semibold">
                Slide {n}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
}
