"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Heading } from "@workspace/ui/components/heading"
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
  fetchOutboxAction,
  generateInviteTokenAction,
  generateSignupTokenAction,
  listOrganizationsAction,
  type OrgChoice,
  type OutboxMessage,
} from "./actions"

interface QuickLinkGroup {
  title: string
  description: string
  pages: { label: string; path: string; note?: string }[]
}

const QUICK_LINKS: QuickLinkGroup[] = [
  {
    title: "Auth",
    description: "Public + protected sign-in / recovery surfaces",
    pages: [
      { label: "Login (email step)", path: "/auth/login" },
      { label: "Login — password", path: "/auth/login/password" },
      { label: "Login — MFA verify", path: "/auth/login/mfa" },
      { label: "Forgot password", path: "/auth/forgot-password" },
      {
        label: "Reset password",
        path: "/auth/reset-password?token=preview-token",
      },
      { label: "Signup welcome", path: "/auth/signup" },
      { label: "Invite welcome", path: "/auth/invite" },
      { label: "MFA setup (TOTP enroll)", path: "/auth/mfa/setup" },
    ],
  },
  {
    title: "Onboarding — owner",
    description: "7-step owner wizard",
    pages: [
      { label: "1 · Profile", path: "/onboarding/profile" },
      { label: "2 · Experience", path: "/onboarding/experience" },
      { label: "3 · Password", path: "/onboarding/password" },
      { label: "4 · Workspace", path: "/onboarding/workspace" },
      { label: "5 · Plan", path: "/onboarding/plan" },
      { label: "6 · Team", path: "/onboarding/team" },
      { label: "7 · Done", path: "/onboarding/done" },
    ],
  },
  {
    title: "Onboarding — member (subset)",
    description: "Member runs profile → experience → password → done",
    pages: [
      { label: "Profile", path: "/onboarding/profile", note: "shared route" },
      {
        label: "Experience",
        path: "/onboarding/experience",
        note: "shared route",
      },
      { label: "Password", path: "/onboarding/password", note: "shared route" },
      { label: "Done", path: "/onboarding/done", note: "shared route" },
    ],
  },
]

export function DevDashboard({ webBaseUrl }: { webBaseUrl: string }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Heading level={1} className="mt-0">
          Dev tools
        </Heading>
        <Text variant="muted">
          Local-only dashboard. Toggle preview mode, jump to any auth or
          onboarding screen, mint signup / invite tokens, and inspect the email
          outbox.
        </Text>
      </header>

      <PreviewSection webBaseUrl={webBaseUrl} />
      <QuickLinksSection webBaseUrl={webBaseUrl} />
      <SignupTokenSection />
      <InviteTokenSection />
      <OutboxSection webBaseUrl={webBaseUrl} />
    </div>
  )
}

function PreviewSection({ webBaseUrl }: { webBaseUrl: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dev preview mode</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Text variant="muted">
          When ON, auth + onboarding pages render without requiring real session
          cookies, signup tokens, or invite tokens. Statically dead- coded in
          production builds — cannot be forged in deployed envs.
        </Text>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a
              href={`${webBaseUrl}/api/dev/preview?on=1&to=/`}
              target="_blank"
              rel="noreferrer"
            >
              Turn ON
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`${webBaseUrl}/api/dev/preview?off=1&to=/`}
              target="_blank"
              rel="noreferrer"
            >
              Turn OFF
            </a>
          </Button>
        </div>
        <Text variant="small" className="text-muted-foreground">
          Toggling opens the web app in a new tab so the cookie is set on its
          origin. The buttons are 1-click, no extra confirmation.
        </Text>
      </CardContent>
    </Card>
  )
}

function QuickLinksSection({ webBaseUrl }: { webBaseUrl: string }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Heading level={3} className="mt-0">
          Quick links
        </Heading>
        <Text variant="muted">
          Each link opens the page in a new tab against the local web app.
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {QUICK_LINKS.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <Text variant="small" className="text-muted-foreground">
                {group.description}
              </Text>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5 text-sm">
                {group.pages.map((p) => (
                  <li
                    key={`${group.title}-${p.path}-${p.label}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <a
                      href={`${webBaseUrl}${p.path}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:underline"
                    >
                      {p.label}
                    </a>
                    {p.note && (
                      <span className="text-xs text-muted-foreground">
                        {p.note}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

function SignupTokenSection() {
  const [email, setEmail] = useState("")
  const [workspace, setWorkspace] = useState("")
  const [ttlDays, setTtlDays] = useState("14")
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{
    url?: string
    error?: string
  } | null>(null)

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
        <CardTitle>Generate signup token</CardTitle>
        <Text variant="small" className="text-muted-foreground">
          Mints a signup JWT for a new workspace owner. Recipient opens the URL
          and walks through the 7-step owner onboarding.
        </Text>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="signup-email">Email</FieldLabel>
              <Input
                id="signup-email"
                type="email"
                inputSize="xl"
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
                inputSize="xl"
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
                inputSize="xl"
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

          <Button type="submit" size="xl" disabled={isPending}>
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
  const [result, setResult] = useState<{
    url?: string
    error?: string
  } | null>(null)

  const loadOrgs = useCallback(async () => {
    setOrgsLoading(true)
    try {
      const list = await listOrganizationsAction()
      setOrgs(list)
      if (list[0] && !organizationId) {
        setOrganizationId(list[0].id)
      }
    } finally {
      setOrgsLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    loadOrgs()
  }, [loadOrgs])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResult(null)
    startTransition(async () => {
      const res = await generateInviteTokenAction({
        email,
        organizationId,
        role: role as "owner" | "admin" | "member" | "agent" | "guest",
        ttlDays: Number(ttlDays),
      })
      setResult(res.ok ? { url: res.url } : { error: res.error })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate invite token</CardTitle>
        <Text variant="small" className="text-muted-foreground">
          Issues an invite for an existing organization. Inserts a pending row
          in <code>auth_invite</code> + sends the invite email through the
          configured transport.
        </Text>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="invite-email">Recipient email</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                inputSize="xl"
                required
                placeholder="teammate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-org">
                Organization ID (UUID)
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="invite-org"
                  type="text"
                  inputSize="xl"
                  required
                  placeholder="00000000-0000-0000-0000-000000000000"
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="xl"
                  onClick={loadOrgs}
                  disabled={orgsLoading}
                >
                  {orgsLoading ? "Loading…" : "Refresh"}
                </Button>
              </div>
              {orgs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {orgs.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setOrganizationId(o.id)}
                      className={
                        "rounded-md border px-2 py-1 text-xs transition-colors " +
                        (organizationId === o.id
                          ? "border-foreground bg-foreground text-background"
                          : "border-input bg-muted/40 hover:bg-muted")
                      }
                      title={o.id}
                    >
                      {o.slug} — {o.legalName}
                    </button>
                  ))}
                </div>
              )}
              <Text variant="small" className="text-muted-foreground">
                Tap a chip to fill the UUID. List shows the last 20 orgs. Run
                owner onboarding step 4 to create one.
              </Text>
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
                  <SelectItem value="agent">agent</SelectItem>
                  <SelectItem value="guest">guest</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-ttl">TTL (days)</FieldLabel>
              <Input
                id="invite-ttl"
                type="number"
                inputSize="xl"
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

          <Button type="submit" size="xl" disabled={isPending}>
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
            onClick={async () => {
              await navigator.clipboard.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
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

function OutboxSection({ webBaseUrl }: { webBaseUrl: string }) {
  const [messages, setMessages] = useState<OutboxMessage[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchOutboxAction()
      setMessages(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Email outbox</CardTitle>
          <div className="flex items-center gap-2">
            <Button onClick={refresh} variant="outline" size="sm">
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`${webBaseUrl}/api/dev/outbox`}
                target="_blank"
                rel="noreferrer"
              >
                Raw JSON
              </a>
            </Button>
          </div>
        </div>
        <Text variant="small" className="text-muted-foreground">
          Live tail of the dev email transport ring buffer. Auto-refreshes every
          5s. Click a message to expand body + clickable URL.
        </Text>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <Text variant="muted">
            Outbox is empty. Trigger an email (signup link, reset password,
            magic link, invite) to populate it.
          </Text>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <OutboxItem key={`${m.at}-${i}`} message={m} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function OutboxItem({ message }: { message: OutboxMessage }) {
  const [open, setOpen] = useState(false)
  const dt = new Date(message.at)
  return (
    <li className="rounded-lg border border-input">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{message.subject}</span>
          <span className="text-xs text-muted-foreground">
            {dt.toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {message.from} → {message.to}
          </span>
          {message.url && (
            <span className="text-xs text-muted-foreground">link →</span>
          )}
        </div>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-input bg-muted/20 px-3 py-2">
          {message.url && (
            <div className="flex items-center justify-between gap-3">
              <a
                href={message.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                Open link
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(message.url!)
                }}
              >
                Copy URL
              </Button>
            </div>
          )}
          {message.text && (
            <pre className="max-h-72 overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
              {message.text}
            </pre>
          )}
        </div>
      )}
    </li>
  )
}
