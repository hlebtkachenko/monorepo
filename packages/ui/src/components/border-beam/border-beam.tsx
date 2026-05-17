"use client"

import type { CSSProperties, ReactNode } from "react"
import * as React from "react"
import {
  BorderBeam as NpmBorderBeam,
  type BorderBeamProps as NpmBorderBeamProps,
  type BorderBeamSize,
} from "border-beam"

type BorderBeamProps = Pick<
  NpmBorderBeamProps,
  | "size"
  | "theme"
  | "colorVariant"
  | "staticColors"
  | "duration"
  | "active"
  | "borderRadius"
  | "brightness"
  | "saturation"
  | "hueRange"
  | "strength"
  | "onActivate"
  | "onDeactivate"
  | "className"
  | "style"
> & {
  children: ReactNode
}

function BorderBeam({
  children,
  size = "sm",
  theme = "auto",
  colorVariant,
  staticColors,
  duration,
  active,
  borderRadius,
  brightness,
  saturation,
  hueRange,
  strength,
  onActivate,
  onDeactivate,
  className,
  style,
  ref,
}: BorderBeamProps & { ref?: React.Ref<HTMLDivElement> }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // SSR / pre-mount: render children plain so markup stays stable
    // until the beam wrapper hydrates on the client.
    return <>{children}</>
  }

  return (
    <NpmBorderBeam
      {...(active !== undefined ? { active } : {})}
      {...(borderRadius !== undefined ? { borderRadius } : {})}
      {...(brightness !== undefined ? { brightness } : {})}
      {...(className !== undefined ? { className } : {})}
      {...(colorVariant !== undefined ? { colorVariant } : {})}
      {...(duration !== undefined ? { duration } : {})}
      {...(hueRange !== undefined ? { hueRange } : {})}
      {...(onActivate ? { onActivate } : {})}
      {...(onDeactivate ? { onDeactivate } : {})}
      ref={ref}
      {...(saturation !== undefined ? { saturation } : {})}
      size={size}
      {...(staticColors !== undefined ? { staticColors } : {})}
      {...(strength !== undefined ? { strength } : {})}
      {...(style !== undefined ? { style } : {})}
      theme={theme}
    >
      {children}
    </NpmBorderBeam>
  )
}

export { BorderBeam, type BorderBeamProps, type BorderBeamSize }
