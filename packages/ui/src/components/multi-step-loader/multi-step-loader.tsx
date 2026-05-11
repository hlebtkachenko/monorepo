"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

interface LoadingState {
  text: string
}

type FinalStatus = "success" | "failed"

interface MultiStepLoaderProps {
  loadingStates: LoadingState[]
  loading?: boolean
  duration?: number
  loop?: boolean
  /** Result shown after the last step in one-shot mode. Defaults to "success". */
  finalStatus?: FinalStatus
  /** Ms to keep the final indicator visible before auto-closing. Defaults to 1500. */
  autoCloseDelay?: number
  /** Called when the user clicks the close button or when one-shot auto-closes. */
  onClose?: () => void
}

function StepRow({
  state,
  index,
  value,
  isFinal,
  finalStatus,
}: {
  state: LoadingState
  index: number
  value: number
  isFinal: boolean
  finalStatus: FinalStatus
}) {
  const distance = Math.abs(index - value)
  const opacity = Math.max(1 - distance * 0.2, 0)
  const isCurrent = index === value
  const isDone = index < value || isFinal
  const isLastInFinal = isFinal && index === value

  const iconColor = isLastInFinal
    ? finalStatus === "success"
      ? "text-success"
      : "text-destructive"
    : isCurrent
      ? "text-primary"
      : "text-foreground"

  return (
    <motion.div
      key={index}
      className="mb-4 flex items-center gap-3 text-left"
      initial={{ opacity: 0, y: -(value * 40) }}
      animate={{ opacity, y: -(value * 40) }}
      transition={{ duration: 0.5 }}
    >
      <div>
        {isLastInFinal && finalStatus === "failed" ? (
          <XCircleIcon className={cn("size-6", iconColor)} />
        ) : isDone || isCurrent ? (
          <CheckCircle2Icon
            className={cn("size-6", iconColor)}
            fill="currentColor"
            stroke="var(--background)"
            strokeWidth={2}
          />
        ) : (
          <CircleDashedIcon className="size-6 text-muted-foreground" />
        )}
      </div>
      <span
        className={cn(
          "text-foreground",
          isCurrent && !isFinal && "font-medium text-primary",
          isLastInFinal &&
            finalStatus === "success" &&
            "font-medium text-success",
          isLastInFinal &&
            finalStatus === "failed" &&
            "font-medium text-destructive",
        )}
      >
        {state.text}
      </span>
    </motion.div>
  )
}

function FinalBanner({ status }: { status: FinalStatus }) {
  if (status === "success") {
    return (
      <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-success">
        <CheckCircle2Icon
          className="size-6"
          fill="currentColor"
          stroke="var(--background)"
          strokeWidth={2}
        />
        Successful
      </div>
    )
  }
  return (
    <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-destructive">
      <XCircleIcon className="size-6" />
      Failed
    </div>
  )
}

function LoaderCore({
  loadingStates,
  value,
  isFinal,
  finalStatus,
}: {
  loadingStates: LoadingState[]
  value: number
  isFinal: boolean
  finalStatus: FinalStatus
}) {
  return (
    <div className="relative mx-auto mt-40 flex max-w-xl flex-col justify-start">
      {isFinal && <FinalBanner status={finalStatus} />}
      {loadingStates.map((state, index) => (
        <StepRow
          key={index}
          state={state}
          index={index}
          value={value}
          isFinal={isFinal}
          finalStatus={finalStatus}
        />
      ))}
    </div>
  )
}

function MultiStepLoader({
  loadingStates,
  loading,
  duration = 2000,
  loop = true,
  finalStatus = "success",
  autoCloseDelay = 1500,
  onClose,
}: MultiStepLoaderProps) {
  const [currentState, setCurrentState] = React.useState(0)
  const [isFinal, setIsFinal] = React.useState(false)
  const onCloseRef = React.useRef(onClose)

  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    if (!loading) {
      const raf = requestAnimationFrame(() => {
        setCurrentState(0)
        setIsFinal(false)
      })
      return () => cancelAnimationFrame(raf)
    }

    if (isFinal) return

    const lastIndex = loadingStates.length - 1
    const reachedEnd = currentState >= lastIndex

    if (!loop && reachedEnd) {
      // Hold on the last step briefly, then flip to the final state.
      const holdId = setTimeout(() => setIsFinal(true), duration)
      return () => clearTimeout(holdId)
    }

    const timeout = setTimeout(() => {
      setCurrentState((prev) =>
        loop
          ? prev === lastIndex
            ? 0
            : prev + 1
          : Math.min(prev + 1, lastIndex),
      )
    }, duration)
    return () => clearTimeout(timeout)
  }, [currentState, loading, loop, loadingStates.length, duration, isFinal])

  React.useEffect(() => {
    if (!isFinal) return
    const id = setTimeout(() => onCloseRef.current?.(), autoCloseDelay)
    return () => clearTimeout(id)
  }, [isFinal, autoCloseDelay])

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
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onClose()}
              aria-label="Close loader"
              className="absolute top-4 right-4 z-30"
            >
              <XIcon />
            </Button>
          )}
          <div className="relative h-96">
            <LoaderCore
              value={currentState}
              loadingStates={loadingStates}
              isFinal={isFinal}
              finalStatus={finalStatus}
            />
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
export type { MultiStepLoaderProps, LoadingState, FinalStatus }
