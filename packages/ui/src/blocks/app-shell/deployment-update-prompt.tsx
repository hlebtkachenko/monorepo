"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  deploymentKey,
  isDeploymentVersionPayload,
  type DeploymentIdentity,
  type DeploymentVersionPayload,
} from "@workspace/ui/lib/deployment-version"

const POLL_INTERVAL_MS = 60_000
const DISMISSED_DEPLOYMENT_KEY = "afframe.dismissed-deployment"

export function DeploymentUpdatePrompt({
  initialDeployment,
  endpoint = "/api/version",
  reloadPage = () => window.location.reload(),
}: {
  initialDeployment: DeploymentIdentity
  endpoint?: string
  reloadPage?: () => void
}) {
  const initialKey = deploymentKey(initialDeployment)
  const [available, setAvailable] =
    React.useState<DeploymentVersionPayload | null>(null)
  const dismissedKey = React.useRef<string | null>(null)
  const checking = React.useRef(false)
  const reloadButton = React.useRef<HTMLButtonElement>(null)

  const checkForUpdate = React.useCallback(async () => {
    if (!initialKey || checking.current) return
    checking.current = true

    try {
      const separator = endpoint.includes("?") ? "&" : "?"
      const response = await fetch(`${endpoint}${separator}t=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      if (!response.ok) return

      const payload: unknown = await response.json()
      if (!isDeploymentVersionPayload(payload)) return

      const nextKey = deploymentKey(payload)
      const storedDismissedKey = window.localStorage.getItem(
        DISMISSED_DEPLOYMENT_KEY,
      )
      if (
        !nextKey ||
        nextKey === initialKey ||
        nextKey === dismissedKey.current ||
        nextKey === storedDismissedKey
      ) {
        return
      }

      setAvailable(payload)
    } catch {
      return
    } finally {
      checking.current = false
    }
  }, [endpoint, initialKey])

  React.useEffect(() => {
    if (!initialKey) return

    const initialCheck = window.setTimeout(() => {
      void checkForUpdate()
    }, 0)
    const interval = window.setInterval(() => {
      void checkForUpdate()
    }, POLL_INTERVAL_MS)
    const onFocus = () => void checkForUpdate()
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate()
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.clearTimeout(initialCheck)
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [checkForUpdate, initialKey])

  const dismiss = React.useCallback(() => {
    if (available) {
      const key = deploymentKey(available)
      dismissedKey.current = key
      if (key) window.localStorage.setItem(DISMISSED_DEPLOYMENT_KEY, key)
    }
    setAvailable(null)
  }, [available])

  return (
    <Dialog
      open={available !== null}
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          reloadButton.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Update ready</DialogTitle>
          <DialogDescription>
            A new version has been deployed. Reload to apply it.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={dismiss}>
            Later
          </Button>
          <Button ref={reloadButton} onClick={reloadPage}>
            Reload now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
