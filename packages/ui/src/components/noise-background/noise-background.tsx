"use client"

import * as React from "react"
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react"

import { cn } from "@workspace/ui/lib/utils"

const NOISE_FILTER_ID = "noise-background-noise"

const DEFAULT_GRADIENT_COLORS = [
  "var(--info)",
  "var(--success)",
  "var(--warning)",
] as const

function GradientLayer({
  springX,
  springY,
  gradientColor,
  opacity,
  multiplier,
}: {
  springX: MotionValue<number>
  springY: MotionValue<number>
  gradientColor: string
  opacity: number
  multiplier: number
}) {
  const x = useTransform(springX, (val) => val * multiplier)
  const y = useTransform(springY, (val) => val * multiplier)
  const background = useMotionTemplate`radial-gradient(circle at ${x}px ${y}px, ${gradientColor} 0%, transparent 50%)`
  return (
    <motion.div
      aria-hidden
      className="absolute inset-0"
      style={{ opacity, background }}
    />
  )
}

interface NoiseBackgroundProps {
  children?: React.ReactNode
  className?: string
  containerClassName?: string
  gradientColors?: readonly string[]
  noiseIntensity?: number
  speed?: number
  backdropBlur?: boolean
  animating?: boolean
}

function NoiseBackground({
  children,
  className,
  containerClassName,
  gradientColors = DEFAULT_GRADIENT_COLORS,
  noiseIntensity = 0.2,
  speed = 0.1,
  backdropBlur = false,
  animating = true,
}: NoiseBackgroundProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const springX = useSpring(x, { stiffness: 100, damping: 30 })
  const springY = useSpring(y, { stiffness: 100, damping: 30 })

  const topGradientX = useTransform(springX, (val) => val * 0.1 - 50)

  const velocityRef = React.useRef({ x: 0, y: 0 })
  const lastDirectionChangeRef = React.useRef(0)

  React.useEffect(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    x.set(rect.width / 2)
    y.set(rect.height / 2)
  }, [x, y])

  const generateRandomVelocityRef = React.useRef(() => {
    const angle = Math.random() * Math.PI * 2
    const magnitude = speed * (0.5 + Math.random() * 0.5)
    return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude }
  })

  React.useEffect(() => {
    generateRandomVelocityRef.current = () => {
      const angle = Math.random() * Math.PI * 2
      const magnitude = speed * (0.5 + Math.random() * 0.5)
      return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude }
    }
    velocityRef.current = generateRandomVelocityRef.current()
  }, [speed])

  useAnimationFrame((time) => {
    if (!animating || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const maxX = rect.width
    const maxY = rect.height
    if (time - lastDirectionChangeRef.current > 1500 + Math.random() * 1500) {
      velocityRef.current = generateRandomVelocityRef.current()
      lastDirectionChangeRef.current = time
    }
    const deltaTime = 16
    const currentX = x.get()
    const currentY = y.get()
    let newX = currentX + velocityRef.current.x * deltaTime
    let newY = currentY + velocityRef.current.y * deltaTime
    const padding = 20
    if (
      newX < padding ||
      newX > maxX - padding ||
      newY < padding ||
      newY > maxY - padding
    ) {
      const angle = Math.random() * Math.PI * 2
      const magnitude = speed * (0.5 + Math.random() * 0.5)
      velocityRef.current = {
        x: Math.cos(angle) * magnitude,
        y: Math.sin(angle) * magnitude,
      }
      lastDirectionChangeRef.current = time
      newX = Math.max(padding, Math.min(maxX - padding, newX))
      newY = Math.max(padding, Math.min(maxY - padding, newY))
    }
    x.set(newX)
    y.set(newY)
  })

  const colors =
    gradientColors.length > 0 ? gradientColors : DEFAULT_GRADIENT_COLORS

  return (
    <div
      ref={containerRef}
      data-slot="noise-background"
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-muted p-2 shadow-sm backdrop-blur-sm",
        backdropBlur &&
          "after:absolute after:inset-0 after:h-full after:w-full after:backdrop-blur-lg after:content-['']",
        containerClassName,
      )}
      style={{ "--noise-opacity": noiseIntensity } as React.CSSProperties}
    >
      <GradientLayer
        springX={springX}
        springY={springY}
        gradientColor={colors[0]!}
        opacity={0.4}
        multiplier={1}
      />
      <GradientLayer
        springX={springX}
        springY={springY}
        gradientColor={colors[1] ?? colors[0]!}
        opacity={0.3}
        multiplier={0.7}
      />
      <GradientLayer
        springX={springX}
        springY={springY}
        gradientColor={colors[2] ?? colors[0]!}
        opacity={0.25}
        multiplier={1.2}
      />

      <motion.div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 rounded-t-2xl opacity-80 blur-sm"
        style={{
          background: `linear-gradient(to right, ${colors.join(", ")})`,
          x: animating ? topGradientX : 0,
        }}
      />

      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{
          opacity: "var(--noise-opacity, 0.2)",
          mixBlendMode: "overlay",
        }}
      >
        <filter id={NOISE_FILTER_ID}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${NOISE_FILTER_ID})`} />
      </svg>

      <div className={cn("relative z-10", className)}>{children}</div>
    </div>
  )
}

export { NoiseBackground }
export type { NoiseBackgroundProps }
