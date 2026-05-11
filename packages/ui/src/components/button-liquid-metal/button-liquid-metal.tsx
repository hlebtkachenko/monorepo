"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"

type ButtonProps = React.ComponentProps<typeof Button>

interface LiquidMetalButtonProps extends ButtonProps {}

const LIQUID_METAL_STYLE_ID = "liquid-metal-shader-style"
const LIQUID_METAL_STYLE_CONTENT =
  ".liquid-metal-shader canvas { width: 100% !important; height: 100% !important; display: block !important; position: absolute !important; inset: 0 !important; border-radius: inherit !important; }"

let liquidMetalStylesInjected = false

function useEnsureLiquidMetalStyles() {
  React.useInsertionEffect(() => {
    if (liquidMetalStylesInjected) return
    if (typeof document === "undefined") return
    if (document.getElementById(LIQUID_METAL_STYLE_ID)) {
      liquidMetalStylesInjected = true
      return
    }
    const style = document.createElement("style")
    style.id = LIQUID_METAL_STYLE_ID
    style.textContent = LIQUID_METAL_STYLE_CONTENT
    document.head.appendChild(style)
    liquidMetalStylesInjected = true
  }, [])
}

function LiquidMetalButton({
  className,
  children,
  onClick: onClickProp,
  disabled,
  ref,
  ...props
}: LiquidMetalButtonProps) {
  const shaderRef = React.useRef<HTMLDivElement>(null)
  const shaderMount = React.useRef<any>(null)
  const [isHovered, setIsHovered] = React.useState(false)

  useEnsureLiquidMetalStyles()

  React.useEffect(() => {
    const loadShader = async () => {
      try {
        const { liquidMetalFragmentShader, ShaderMount } =
          await import("@paper-design/shaders")
        if (shaderRef.current) {
          if (shaderMount.current?.destroy) shaderMount.current.destroy()
          shaderMount.current = new ShaderMount(
            shaderRef.current,
            liquidMetalFragmentShader,
            {
              u_repetition: 4,
              u_softness: 0.5,
              u_shiftRed: 0.3,
              u_shiftBlue: 0.3,
              u_distortion: 0,
              u_contour: 0,
              u_angle: 45,
              u_scale: 8,
              u_shape: 1,
              u_offsetX: 0.1,
              u_offsetY: -0.1,
            },
            undefined,
            0.6,
          )
        }
      } catch {
        // shader load failure is non-critical
      }
    }

    loadShader()
    return () => {
      if (shaderMount.current?.destroy) {
        shaderMount.current.destroy()
        shaderMount.current = null
      }
    }
  }, [])

  const handleMouseEnter = () => {
    setIsHovered(true)
    shaderMount.current?.setSpeed?.(1)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    shaderMount.current?.setSpeed?.(0.6)
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (shaderMount.current?.setSpeed) {
      shaderMount.current.setSpeed(2.4)
      setTimeout(() => {
        shaderMount.current?.setSpeed?.(isHovered ? 1 : 0.6)
      }, 300)
    }
    onClickProp?.(e)
  }

  return (
    <div
      className={cn(
        "relative inline-flex rounded-lg",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div
        ref={shaderRef}
        aria-hidden
        className="liquid-metal-shader pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      />
      <Button
        ref={ref}
        data-slot="button-liquid-metal"
        className={cn(
          "relative z-10 border-transparent bg-transparent hover:bg-transparent",
          className,
        )}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        disabled={disabled}
        {...props}
      >
        {children}
      </Button>
    </div>
  )
}

export { LiquidMetalButton, type LiquidMetalButtonProps }
