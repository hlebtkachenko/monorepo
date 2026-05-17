"use client"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace/ui/components/carousel"
import { Card, CardContent } from "@workspace/ui/components/card"

const slides = [
  { title: "Design System", description: "Consistent UI components" },
  { title: "TypeScript First", description: "Full type safety" },
  { title: "Accessible", description: "ARIA compliant by default" },
  { title: "Themeable", description: "Dark and light mode" },
]

export function CarouselDemo() {
  return (
    <div className="flex flex-col gap-8">
      <Carousel className="mx-auto w-full max-w-xs">
        <CarouselContent>
          {slides.map((slide, index) => (
            <CarouselItem key={index}>
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                  <p className="text-lg font-semibold">{slide.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {slide.description}
                  </p>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
      <Carousel
        orientation="vertical"
        opts={{ align: "start" }}
        className="mx-auto w-full max-w-xs"
      >
        <CarouselContent className="-mt-1 h-[200px]">
          {[1, 2, 3, 4, 5].map((i) => (
            <CarouselItem key={i} className="basis-1/3 pt-1">
              <div className="flex h-full items-center justify-center rounded-md border bg-card p-4">{`Slide ${i}`}</div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  )
}
