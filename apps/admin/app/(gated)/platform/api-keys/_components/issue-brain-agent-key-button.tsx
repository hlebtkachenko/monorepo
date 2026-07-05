"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Text } from "@workspace/ui/components/text"

import {
  issueBrainAgentKey,
  listOrganizationsForKeyAction,
  type ApiKeyOrgChoice,
} from "../actions"

/**
 * Mints an `actor_kind='agent'` Brain key. The raw secret is returned once by
 * the server action and shown here a single time — it is never persisted, so a
 * "you won't see this again" note gates the operator before they close.
 */
export function IssueBrainAgentKeyButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [organizationId, setOrganizationId] = useState("")
  const [orgs, setOrgs] = useState<ApiKeyOrgChoice[]>([])
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [rawKey, setRawKey] = useState<string | null>(null)

  const loadOrgs = useCallback(async () => {
    setOrgsLoading(true)
    try {
      const list = await listOrganizationsForKeyAction()
      setOrgs(list)
      setOrganizationId((prev) => prev || (list[0]?.id ?? ""))
    } finally {
      setOrgsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && orgs.length === 0) void loadOrgs()
  }, [open, orgs.length, loadOrgs])

  function reset() {
    setName("")
    setError(null)
    setRawKey(null)
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await issueBrainAgentKey({ name, organizationId })
      if (res.ok && res.raw) {
        setRawKey(res.raw)
        router.refresh()
      } else {
        setError(res.error ?? "Failed to issue key")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Issue Brain agent key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue Brain agent key</DialogTitle>
          <DialogDescription>
            Mints an <code className="font-mono">actor_kind=agent</code> API key
            for the Afframe Brain client. Agent keys may propose gated writes
            but are denied the held-write review surface (they can never approve
            their own writes).
          </DialogDescription>
        </DialogHeader>

        {rawKey ? (
          <RawKeyResult raw={rawKey} />
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="brain-key-name">Name</FieldLabel>
                <Input
                  id="brain-key-name"
                  type="text"
                  required
                  placeholder="Afframe Brain — Acme"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="brain-key-org">Organization</FieldLabel>
                {orgs.length > 0 ? (
                  <Select
                    value={organizationId}
                    onValueChange={setOrganizationId}
                  >
                    <SelectTrigger id="brain-key-org">
                      <SelectValue placeholder="Pick an organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.slug} — {o.legalName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      id="brain-key-org"
                      type="text"
                      required
                      placeholder="organization UUID"
                      value={organizationId}
                      onChange={(e) => setOrganizationId(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void loadOrgs()}
                      disabled={orgsLoading}
                    >
                      {orgsLoading ? "…" : "Load"}
                    </Button>
                  </div>
                )}
              </Field>
            </FieldGroup>
            {error && (
              <Text variant="small" className="text-destructive" role="alert">
                {error}
              </Text>
            )}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Issuing…" : "Issue key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RawKeyResult({ raw }: { raw: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border border-input bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Raw key</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void (async () => {
                await navigator.clipboard.writeText(raw)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })()
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <code className="block w-full text-xs break-all">{raw}</code>
      </div>
      <Text variant="small" className="text-destructive" role="alert">
        Copy it now — this key is shown once and is never stored. Closing this
        dialog discards it permanently.
      </Text>
    </div>
  )
}
