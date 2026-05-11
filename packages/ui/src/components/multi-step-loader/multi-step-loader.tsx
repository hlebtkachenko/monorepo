"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import { CheckCircle2Icon, CircleIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

interface LoadingState {
  text: string
}

interface MultiStepLoaderProps {
  loadingStates: LoadingState[]
  loading?: boolean
  duration?: number
  loop?: boolean
}

function LoaderCore({
  loadingStates,
  value = 0,
}: {
  loadingStates: LoadingState[]
  value?: number
}) {
  return (
    <div className="relative mx-auto mt-40 flex max-w-xl flex-col justify-start">
      {loadingStates.map((state, index) => {
        const distance = Math.abs(index - value)
        const opacity = Math.max(1 - distance * 0.2, 0)
        const isCurrent = index === value
        const isDone = index < value
        return (
          <motion.div
            key={index}
            className="mb-4 flex gap-2 text-left"
            initial={{ opacity: 0, y: -(value * 40) }}
            animate={{ opacity, y: -(value * 40) }}
            transition={{ duration: 0.5 }}
          >
            <div>
              {isDone || isCurrent ? (
                <CheckCircle2Icon
                  className={cn(
                    "size-6 text-foreground",
                    isCurrent && "text-primary",
                  )}
                />
              ) : (
                <CircleIcon className="size-6 text-muted-foreground" />
              )}
            </div>
            <span
              className={cn(
                "text-foreground",
                isCurrent && "font-medium text-primary",
              )}
            >
              {state.text}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}

function MultiStepLoader({
  loadingStates,
  loading,
  duration = 2000,
  loop = true,
}: MultiStepLoaderProps) {
  const [currentState, setCurrentState] = React.useState(0)

  React.useEffect(() => {
    if (!loading) {
      const raf = requestAnimationFrame(() => setCurrentState(0))
      return () => cancelAnimationFrame(raf)
    }
    const timeout = setTimeout(() => {
      setCurrentState((prev) =>
        loop
          ? prev === loadingStates.length - 1
            ? 0
            : prev + 1
          : Math.min(prev + 1, loadingStates.length - 1),
      )
    }, duration)
    return () => clearTimeout(timeout)
  }, [currentState, loading, loop, loadingStates.length, duration])

  return (
    <AnimatePresence mode="wait">
      {loading && (
        <motion.div
          data-slot="multi-step-loader"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex h-full w-full items-center justify-center backdrop-blur-2xl"
        >
          <div className="relative h-96">
            <LoaderCore value={currentState} loadingStates={loadingStates} />
          </div>
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 z-20 h-full bg-gradient-to-t from-background to-transparent [mask-image:radial-gradient(900px_at_center,transparent_30%,white)]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export { MultiStepLoader }
export type { MultiStepLoaderProps, LoadingState }
