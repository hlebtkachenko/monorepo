"use client"

import { useState, useCallback } from "react"

type ButtonState = "idle" | "loading" | "success" | "error"

interface UseStatefulButtonOptions {
  onAction: () => Promise<void> | void
  successDuration?: number
  errorDuration?: number
}

interface UseStatefulButtonReturn {
  state: ButtonState
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  handleClick: () => Promise<void>
}

function useStatefulButton({
  onAction,
  successDuration = 2000,
  errorDuration = 2000,
}: UseStatefulButtonOptions): UseStatefulButtonReturn {
  const [state, setState] = useState<ButtonState>("idle")

  const handleClick = useCallback(async () => {
    if (state === "loading") return

    setState("loading")
    try {
      await onAction()
      setState("success")
      setTimeout(() => setState("idle"), successDuration)
    } catch {
      setState("error")
      setTimeout(() => setState("idle"), errorDuration)
    }
  }, [onAction, state, successDuration, errorDuration])

  return {
    state,
    isLoading: state === "loading",
    isSuccess: state === "success",
    isError: state === "error",
    handleClick,
  }
}

export {
  useStatefulButton,
  type ButtonState,
  type UseStatefulButtonOptions,
  type UseStatefulButtonReturn,
}
