"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

interface LiquidMetalButtonProps extends Omit<
  React.ComponentProps<"button">,
  "children"
> {
  label?: string
  viewMode?: "text" | "icon"
  icon?: React.ReactNode
}

function LiquidMetalButton({
  label = "Get Started",
  onClick,
  viewMode = "text",
  icon,
  className,
  disabled,
  ...props
}: LiquidMetalButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false)
  const [isPressed, setIsPressed] = React.useState(false)
  const [ripples, setRipples] = React.useState<
    Array<{ x: number; y: number; id: number }>
  >([])
  const shaderRef = React.useRef<HTMLDivElement>(null)
  const shaderMount = React.useRef<any>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const rippleId = React.useRef(0)

  const isIcon = viewMode === "icon"
  const w = isIcon ? 46 : 142
  const h = 46
  const innerW = w - 4
  const innerH = h - 4

  React.useEffect(() => {
    const styleId = "liquid-metal-shader-style"
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style")
      style.id = styleId
      style.textContent = `
        .liquid-metal-shader canvas {
          width: 100% !important;
          height: 100% !important;
          display: block !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          border-radius: 100px !important;
        }
        @keyframes liquid-metal-ripple {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
      `
      document.head.appendChild(style)
    }

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
    setIsPressed(false)
    shaderMount.current?.setSpeed?.(0.6)
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (shaderMount.current?.setSpeed) {
      shaderMount.current.setSpeed(2.4)
      setTimeout(() => {
        shaderMount.current?.setSpeed?.(isHovered ? 1 : 0.6)
      }, 300)
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const ripple = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        id: rippleId.current++,
      }
      setRipples((prev) => [...prev, ripple])
      setTimeout(
        () => setRipples((prev) => prev.filter((r) => r.id !== ripple.id)),
        600,
      )
    }

    onClick?.(e)
  }

  const transition = "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)"
  const pressTransform = isPressed
    ? "translateY(1px) scale(0.98)"
    : "translateY(0) scale(1)"

  return (
    <div
      data-slot="liquid-metal-button"
      className={cn(
        "relative inline-block",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      style={{ perspective: "1000px" }}
    >
      <div
        style={{
          position: "relative",
          width: w,
          height: h,
          transformStyle: "preserve-3d",
          transition,
        }}
      >
        {/* Text/icon layer */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            transformStyle: "preserve-3d",
            transform: "translateZ(20px)",
            zIndex: 30,
            pointerEvents: "none",
            transition,
          }}
        >
          {isIcon && icon ? (
            <span className="text-muted-foreground drop-shadow-sm [&_svg]:size-4">
              {icon}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground drop-shadow-sm">
              {label}
            </span>
          )}
        </div>

        {/* Inner dark layer */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transform: `translateZ(10px) ${pressTransform}`,
            zIndex: 20,
            transition,
          }}
        >
          <div
            style={{
              width: innerW,
              height: innerH,
              margin: 2,
              borderRadius: 100,
              background:
                "linear-gradient(180deg, hsl(var(--foreground) / 0.1) 0%, hsl(var(--foreground) / 0.05) 100%)",
              boxShadow: isPressed ? "inset 0 2px 4px rgba(0,0,0,0.4)" : "none",
              transition,
            }}
          />
        </div>

        {/* Shader layer */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transform: `translateZ(0px) ${pressTransform}`,
            zIndex: 10,
            transition,
          }}
        >
          <div
            style={{
              width: w,
              height: h,
              borderRadius: 100,
              boxShadow: isPressed
                ? "0 0 0 1px rgba(0,0,0,0.5)"
                : isHovered
                  ? "0 0 0 1px rgba(0,0,0,0.4), 0 8px 5px rgba(0,0,0,0.1)"
                  : "0 0 0 1px rgba(0,0,0,0.3), 0 9px 9px rgba(0,0,0,0.12)",
              transition,
            }}
          >
            <div
              ref={shaderRef}
              className="liquid-metal-shader"
              style={{
                borderRadius: 100,
                overflow: "hidden",
                position: "relative",
                width: w,
                height: h,
              }}
            />
          </div>
        </div>

        {/* Clickable overlay */}
        <button
          ref={buttonRef}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseDown={() => setIsPressed(true)}
          onMouseUp={() => setIsPressed(false)}
          disabled={disabled}
          aria-label={label}
          style={{
            position: "absolute",
            inset: 0,
            width: w,
            height: h,
            background: "transparent",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            outline: "none",
            zIndex: 40,
            transformStyle: "preserve-3d",
            transform: "translateZ(25px)",
            overflow: "hidden",
            borderRadius: 100,
            transition,
          }}
          {...props}
        >
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              style={{
                position: "absolute",
                left: ripple.x,
                top: ripple.y,
                width: 20,
                height: 20,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 70%)",
                pointerEvents: "none",
                animation: "liquid-metal-ripple 0.6s ease-out",
              }}
            />
          ))}
        </button>
      </div>
    </div>
  )
}

export { LiquidMetalButton, type LiquidMetalButtonProps }
