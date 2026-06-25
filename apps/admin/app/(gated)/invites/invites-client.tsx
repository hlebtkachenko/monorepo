"use client"

import { useCallback, useEffect, useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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
  generateInviteTokenAction,
  generateSignupTokenAction,
  listOrganizationsAction,
  type OrgChoice,
} from "./actions"

/** Signup + invite token issuing, lifted out of the old dev dashboard. */
export function InvitesClient() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6 lg:grid-cols-2">
      <SignupTokenSection />
      <InviteTokenSection />
    </div>
  )
}

function SignupTokenSection() {
  const [email, setEmail] = useState("")
  const [workspace, setWorkspace] = useState("")
  const [ttlDays, setTtlDays] = useState("14")
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(
    null,
  )

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const res = await generateSignupTokenAction({
        email,
        workspace,
        ttlDays: Number(ttlDays),
      })
      setResult(res.ok ? { url: res.url } : { error: res.error })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signup token</CardTitle>
        <Text variant="small" className="text-muted-foreground">
          Mints a signup link for a new workspace owner. The recipient runs the
          7-step owner onboarding.
        </Text>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="signup-email">Email</FieldLabel>
              <Input
                id="signup-email"
                type="email"
                required
                placeholder="owner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="signup-workspace">Workspace name</FieldLabel>
              <Input
                id="signup-workspace"
                type="text"
                required
                placeholder="Acme Accounting"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="signup-ttl">TTL (days)</FieldLabel>
              <Input
                id="signup-ttl"
                type="number"
                required
                min={1}
                max={90}
                value={ttlDays}
                onChange={(e) => setTtlDays(e.target.value)}
              />
            </Field>
          </FieldGroup>
          {result?.error && (
            <Text variant="small" className="text-destructive" role="alert">
              {result.error}
            </Text>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Generating…" : "Generate signup link"}
          </Button>
          {result?.url && <TokenResult label="Signup URL" url={result.url} />}
        </form>
      </CardContent>
    </Card>
  )
}

function InviteTokenSection() {
  const [email, setEmail] = useState("")
  const [organizationId, setOrganizationId] = useState("")
  const [role, setRole] = useState("member")
  const [ttlDays, setTtlDays] = useState("7")
  const [isPending, startTransition] = useTransition()
  const [orgs, setOrgs] = useState<OrgChoice[]>([])
  const [orgsLoading, setOrgsLoading] = useState(false)
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(
    null,
  )

  const loadOrgs = useCallback(async () => {
    setOrgsLoading(true)
    try {
      const list = await listOrganizationsAction()
      setOrgs(list)
      if (list[0] && !organizationId) setOrganizationId(list[0].id)
    } finally {
      setOrgsLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void loadOrgs()
  }, [loadOrgs])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const res = await generateInviteTokenAction({
        email,
        organizationId,
        role: role as "owner" | "admin" | "member",
        ttlDays: Number(ttlDays),
      })
      setResult(res.ok ? { url: res.url } : { error: res.error })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite token</CardTitle>
        <Text variant="small" className="text-muted-foreground">
          Issues an invite for an existing organization and sends the invite
          email.
        </Text>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invite-email">Recipient email</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-org">Organization</FieldLabel>
              {orgs.length > 0 ? (
                <Select
                  value={organizationId}
                  onValueChange={setOrganizationId}
                >
                  <SelectTrigger id="invite-org">
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
                    id="invite-org"
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
            <Field>
              <FieldLabel htmlFor="invite-role">Role</FieldLabel>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">owner</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-ttl">TTL (days)</FieldLabel>
              <Input
                id="invite-ttl"
                type="number"
                required
                min={1}
                max={30}
                value={ttlDays}
                onChange={(e) => setTtlDays(e.target.value)}
              />
            </Field>
          </FieldGroup>
          {result?.error && (
            <Text variant="small" className="text-destructive" role="alert">
              {result.error}
            </Text>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Issuing…" : "Issue invite"}
          </Button>
          {result?.url && <TokenResult label="Invite URL" url={result.url} />}
        </form>
      </CardContent>
    </Card>
  )
}

function TokenResult({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-input bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={url} target="_blank" rel="noreferrer">
              Open
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void (async () => {
                await navigator.clipboard.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })()
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <code className="block w-full text-xs break-all">{url}</code>
    </div>
  )
}
