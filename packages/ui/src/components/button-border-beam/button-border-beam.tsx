"use client"

import type { CSSProperties } from "react"
import * as React from "react"
import {
  BorderBeam,
  type BorderBeamProps,
  type BorderBeamSize,
} from "border-beam"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"

type BeamShellProps = Pick<
  BorderBeamProps,
  | "colorVariant"
  | "theme"
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
> & {
  beamSize?: BorderBeamSize
  borderBeamClassName?: string
  borderBeamStyle?: CSSProperties
}

type BorderBeamButtonProps = React.ComponentProps<typeof Button> &
  BeamShellProps

function BorderBeamButton({
  beamSize = "sm",
  borderBeamClassName,
  borderBeamStyle,
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
  ref,
  ...buttonProps
}: BorderBeamButtonProps) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        className={className}
        {...buttonProps}
        ref={ref as React.Ref<HTMLButtonElement>}
      />
    )
  }

  return (
    <BorderBeam
      {...(active !== undefined ? { active } : {})}
      {...(borderRadius !== undefined ? { borderRadius } : {})}
      {...(brightness !== undefined ? { brightness } : {})}
      className={cn(
        "inline-flex w-fit min-w-0 flex-col items-stretch overflow-visible! leading-none",
        borderBeamClassName,
      )}
      {...(colorVariant !== undefined ? { colorVariant } : {})}
      {...(duration !== undefined ? { duration } : {})}
      {...(hueRange !== undefined ? { hueRange } : {})}
      {...(onActivate ? { onActivate } : {})}
      {...(onDeactivate ? { onDeactivate } : {})}
      ref={ref as React.Ref<HTMLDivElement>}
      {...(saturation !== undefined ? { saturation } : {})}
      size={beamSize}
      {...(staticColors !== undefined ? { staticColors } : {})}
      {...(strength !== undefined ? { strength } : {})}
      {...(borderBeamStyle !== undefined ? { style: borderBeamStyle } : {})}
      theme={theme}
    >
      <Button className={className} {...buttonProps} />
    </BorderBeam>
  )
}

function BorderBeamIconButton({
  size = "icon-sm",
  className,
  ...props
}: BorderBeamButtonProps) {
  return (
    <BorderBeamButton
      className={cn("!leading-none [&_svg]:block [&_svg]:shrink-0", className)}
      size={size}
      {...props}
    />
  )
}

export { BorderBeamButton, BorderBeamIconButton, type BorderBeamButtonProps }
