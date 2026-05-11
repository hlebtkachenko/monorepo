"use client"

import * as React from "react"
import { Slot } from "radix-ui"

import { useComposedRefs } from "@workspace/ui/lib/compose-refs"
import { useLazyRef } from "@workspace/ui/hooks/use-lazy-ref"
import { cn } from "@workspace/ui/lib/utils"

const ROOT_NAME = "QRCode"
const CANVAS_NAME = "QRCodeCanvas"
const SVG_NAME = "QRCodeSvg"
const IMAGE_NAME = "QRCodeImage"
const SKELETON_NAME = "QRCodeSkeleton"

type QRCodeLevel = "L" | "M" | "Q" | "H"

interface QRCodeCanvasOpts {
  errorCorrectionLevel: QRCodeLevel
  type?: "image/png" | "image/jpeg" | "image/webp"
  quality?: number
  margin?: number
  color?: { dark: string; light: string }
  width?: number
}

interface StoreState {
  dataUrl: string | null
  svgString: string | null
  isGenerating: boolean
  error: Error | null
  generationKey: string
}

interface Store {
  subscribe: (cb: () => void) => () => void
  getState: () => StoreState
  setState: <K extends keyof StoreState>(key: K, value: StoreState[K]) => void
  setStates: (updates: Partial<StoreState>) => void
  notify: () => void
}

interface QRCodeContextValue {
  value: string
  size: number
  margin: number
  level: QRCodeLevel
  backgroundColor: string
  foregroundColor: string
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}

const StoreContext = React.createContext<Store | null>(null)

function useStore<T>(selector: (state: StoreState) => T): T {
  const store = React.useContext(StoreContext)
  if (!store) {
    throw new Error(`\`useQRCode\` must be used within \`${ROOT_NAME}\``)
  }
  const getSnapshot = React.useCallback(
    () => selector(store.getState()),
    [store, selector],
  )
  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

const QRCodeContext = React.createContext<QRCodeContextValue | null>(null)

function useQRCodeContext(consumerName: string) {
  const ctx = React.useContext(QRCodeContext)
  if (!ctx) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``)
  }
  return ctx
}

interface QRCodeProps extends Omit<React.ComponentProps<"div">, "onError"> {
  value: string
  size?: number
  level?: QRCodeLevel
  margin?: number
  quality?: number
  backgroundColor?: string
  foregroundColor?: string
  onError?: (error: Error) => void
  onGenerated?: () => void
  asChild?: boolean
}

function QRCode({
  value,
  size = 200,
  level = "M",
  margin = 1,
  quality = 0.92,
  backgroundColor = "#ffffff",
  foregroundColor = "#000000",
  onError,
  onGenerated,
  className,
  style,
  asChild,
  ...rootProps
}: QRCodeProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const listenersRef = useLazyRef(() => new Set<() => void>())
  const stateRef = useLazyRef<StoreState>(() => ({
    dataUrl: null,
    svgString: null,
    isGenerating: false,
    error: null,
    generationKey: "",
  }))

  const store = React.useMemo<Store>(() => {
    return {
      subscribe: (cb) => {
        listenersRef.current.add(cb)
        return () => {
          listenersRef.current.delete(cb)
        }
      },
      getState: () => stateRef.current,
      setState: (key, v) => {
        if (Object.is(stateRef.current[key], v)) return
        stateRef.current[key] = v
        store.notify()
      },
      setStates: (updates) => {
        let changed = false
        for (const key of Object.keys(updates) as Array<keyof StoreState>) {
          const v = updates[key]
          if (v !== undefined && !Object.is(stateRef.current[key], v)) {
            Object.assign(stateRef.current, { [key]: v })
            changed = true
          }
        }
        if (changed) store.notify()
      },
      notify: () => {
        for (const cb of listenersRef.current) cb()
      },
    }
  }, [listenersRef, stateRef])

  const canvasOpts = React.useMemo<QRCodeCanvasOpts>(
    () => ({
      errorCorrectionLevel: level,
      type: "image/png",
      quality,
      margin,
      color: { dark: foregroundColor, light: backgroundColor },
      width: size,
    }),
    [level, margin, foregroundColor, backgroundColor, size, quality],
  )

  const generationKey = React.useMemo(() => {
    if (!value) return ""
    return JSON.stringify({
      value,
      size,
      level,
      margin,
      quality,
      foregroundColor,
      backgroundColor,
    })
  }, [value, level, margin, foregroundColor, backgroundColor, size, quality])

  const generate = React.useCallback(
    async (targetKey: string) => {
      if (!value || !targetKey) return
      const cur = store.getState()
      if (cur.isGenerating || cur.generationKey === targetKey) return

      store.setStates({ isGenerating: true, error: null })

      try {
        const QR = (await import("qrcode")).default
        let dataUrl: string | null = null
        try {
          dataUrl = await QR.toDataURL(value, canvasOpts)
        } catch {
          dataUrl = null
        }
        if (canvasRef.current) {
          await QR.toCanvas(canvasRef.current, value, canvasOpts)
        }
        const svgString = await QR.toString(value, {
          errorCorrectionLevel: canvasOpts.errorCorrectionLevel,
          margin: canvasOpts.margin,
          color: canvasOpts.color,
          width: canvasOpts.width,
          type: "svg",
        })
        store.setStates({
          dataUrl,
          svgString,
          isGenerating: false,
          generationKey: targetKey,
        })
        onGenerated?.()
      } catch (err) {
        const parsed =
          err instanceof Error ? err : new Error("Failed to generate QR code")
        store.setStates({ error: parsed, isGenerating: false })
        onError?.(parsed)
      }
    },
    [value, canvasOpts, store, onError, onGenerated],
  )

  const contextValue = React.useMemo<QRCodeContextValue>(
    () => ({
      value,
      size,
      level,
      margin,
      backgroundColor,
      foregroundColor,
      canvasRef,
    }),
    [value, size, backgroundColor, foregroundColor, level, margin],
  )

  React.useLayoutEffect(() => {
    if (!generationKey) return
    const rafId = requestAnimationFrame(() => {
      void generate(generationKey)
    })
    return () => cancelAnimationFrame(rafId)
  }, [generationKey, generate])

  const Comp = asChild ? Slot.Root : "div"

  return (
    <StoreContext.Provider value={store}>
      <QRCodeContext.Provider value={contextValue}>
        <Comp
          data-slot="qr-code"
          {...rootProps}
          className={cn("relative flex flex-col items-center gap-2", className)}
          style={
            { "--qr-code-size": `${size}px`, ...style } as React.CSSProperties
          }
        />
      </QRCodeContext.Provider>
    </StoreContext.Provider>
  )
}

interface QRCodeCanvasProps extends React.ComponentProps<"canvas"> {
  asChild?: boolean
}

function QRCodeCanvas({
  asChild,
  className,
  ref,
  ...canvasProps
}: QRCodeCanvasProps) {
  const ctx = useQRCodeContext(CANVAS_NAME)
  const generationKey = useStore((s) => s.generationKey)
  const composedRef = useComposedRefs(ref, ctx.canvasRef)
  const Comp = asChild ? Slot.Root : "canvas"
  return (
    <Comp
      data-slot="qr-code-canvas"
      {...canvasProps}
      ref={composedRef}
      width={ctx.size}
      height={ctx.size}
      className={cn(
        "relative max-h-(--qr-code-size) max-w-(--qr-code-size)",
        !generationKey && "invisible",
        className,
      )}
    />
  )
}

interface QRCodeSvgProps extends React.ComponentProps<"div"> {
  asChild?: boolean
}

function QRCodeSvg({ asChild, className, style, ...rest }: QRCodeSvgProps) {
  const ctx = useQRCodeContext(SVG_NAME)
  const svgString = useStore((s) => s.svgString)
  if (!svgString) return null
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="qr-code-svg"
      {...rest}
      className={cn(
        "relative max-h-(--qr-code-size) max-w-(--qr-code-size)",
        className,
      )}
      style={{ width: ctx.size, height: ctx.size, ...style }}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  )
}

interface QRCodeImageProps extends React.ComponentProps<"img"> {
  asChild?: boolean
}

function QRCodeImage({
  alt = "QR Code",
  asChild,
  className,
  ...rest
}: QRCodeImageProps) {
  const ctx = useQRCodeContext(IMAGE_NAME)
  const dataUrl = useStore((s) => s.dataUrl)
  if (!dataUrl) return null
  const Comp = asChild ? Slot.Root : "img"
  return (
    <Comp
      data-slot="qr-code-image"
      {...rest}
      src={dataUrl}
      alt={alt}
      width={ctx.size}
      height={ctx.size}
      className={cn(
        "relative max-h-(--qr-code-size) max-w-(--qr-code-size)",
        className,
      )}
    />
  )
}

interface QRCodeDownloadProps extends React.ComponentProps<"button"> {
  filename?: string
  format?: "png" | "svg"
  asChild?: boolean
}

function QRCodeDownload({
  filename = "qrcode",
  format = "png",
  asChild,
  className,
  children,
  onClick,
  ...rest
}: QRCodeDownloadProps) {
  const dataUrl = useStore((s) => s.dataUrl)
  const svgString = useStore((s) => s.svgString)

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event)
      if (event.defaultPrevented) return

      const link = document.createElement("a")
      let revoke: string | null = null
      if (format === "png" && dataUrl) {
        link.href = dataUrl
        link.download = `${filename}.png`
      } else if (format === "svg" && svgString) {
        const blob = new Blob([svgString], { type: "image/svg+xml" })
        link.href = URL.createObjectURL(blob)
        link.download = `${filename}.svg`
        revoke = link.href
      } else {
        return
      }
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      if (revoke) URL.revokeObjectURL(revoke)
    },
    [dataUrl, svgString, filename, format, onClick],
  )

  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      type="button"
      data-slot="qr-code-download"
      {...rest}
      className={cn("max-w-(--qr-code-size)", className)}
      onClick={handleClick}
    >
      {children ?? `Download ${format.toUpperCase()}`}
    </Comp>
  )
}

interface QRCodeOverlayProps extends React.ComponentProps<"div"> {
  asChild?: boolean
}

function QRCodeOverlay({ asChild, className, ...rest }: QRCodeOverlayProps) {
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="qr-code-overlay"
      {...rest}
      className={cn(
        "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm bg-background",
        className,
      )}
    />
  )
}

interface QRCodeSkeletonProps extends React.ComponentProps<"div"> {
  asChild?: boolean
}

function QRCodeSkeleton({
  asChild,
  className,
  style,
  ...rest
}: QRCodeSkeletonProps) {
  const ctx = useQRCodeContext(SKELETON_NAME)
  const dataUrl = useStore((s) => s.dataUrl)
  const svgString = useStore((s) => s.svgString)
  const generationKey = useStore((s) => s.generationKey)
  if (dataUrl || svgString || generationKey) return null
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      data-slot="qr-code-skeleton"
      {...rest}
      className={cn(
        "absolute max-h-(--qr-code-size) max-w-(--qr-code-size) animate-pulse bg-accent",
        className,
      )}
      style={{ width: ctx.size, height: ctx.size, ...style }}
    />
  )
}

export {
  QRCode,
  QRCodeCanvas,
  QRCodeDownload,
  QRCodeImage,
  QRCodeOverlay,
  QRCodeSkeleton,
  QRCodeSvg,
  useStore as useQRCode,
}
export type { QRCodeProps }
