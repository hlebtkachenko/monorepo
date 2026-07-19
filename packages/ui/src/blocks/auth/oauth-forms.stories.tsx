import type { Meta, StoryObj } from "@storybook/react"

import {
  OAuthConsentForm,
  type OAuthConsentFormMessages,
} from "./oauth-consent-form"
import {
  OAuthSelectOrganizationForm,
  type OAuthSelectOrganizationMessages,
  type OAuthSelectOrganizationOption,
} from "./oauth-select-organization-form"
import { OAuthRedirectNotice } from "./oauth-redirect-notice"

const SCOPE_LABELS: Record<string, string> = {
  openid: "Verify your identity",
  profile: "Read your basic profile",
  "accounting:read": "Read your accounting data",
  "accounting:write": "Propose accounting entries for your approval",
}

const CONSENT_MESSAGES: OAuthConsentFormMessages = {
  title: "Authorize access",
  description: "Cursor wants to access your Afframe account.",
  scopesLabel: "This will let it:",
  scopeLabel: (scope) => SCOPE_LABELS[scope] ?? `Access: ${scope}`,
  authorize: "Authorize",
  authorizing: "Authorizing…",
  deny: "Deny",
  denying: "Denying…",
  failed: "Something went wrong. Please try again.",
}

const SELECT_ORG_MESSAGES: OAuthSelectOrganizationMessages = {
  title: "Select organization",
  description: "Choose the organization this authorization applies to.",
  continuing: "Continuing…",
  empty: "This account has no active organization to authorize.",
  failed: "Something went wrong. Please try again.",
}

const ORGS: OAuthSelectOrganizationOption[] = [
  { id: "org-1", legalName: "Acme Trading s.r.o.", slug: "acme" },
  { id: "org-2", legalName: "Northwind Holding a.s.", slug: "northwind" },
]

const noopDecide = async (): Promise<boolean> => false

const meta: Meta = {
  title: "Blocks/OAuthForms",
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md p-8">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj

// --- OAuthConsentForm ---

export const ConsentDefault: Story = {
  render: () => (
    <OAuthConsentForm
      scopes={["openid", "accounting:read", "accounting:write"]}
      clientUri="https://cursor.com"
      onDecide={noopDecide}
      messages={CONSENT_MESSAGES}
    />
  ),
}

export const ConsentNoScopes: Story = {
  render: () => (
    <OAuthConsentForm
      scopes={[]}
      clientUri={null}
      onDecide={noopDecide}
      messages={CONSENT_MESSAGES}
    />
  ),
}

// --- OAuthSelectOrganizationForm ---

export const SelectOrganizationMultiple: Story = {
  render: () => (
    <OAuthSelectOrganizationForm
      organizations={ORGS}
      onSelect={noopDecide}
      messages={SELECT_ORG_MESSAGES}
    />
  ),
}

export const SelectOrganizationSingle: Story = {
  render: () => (
    <OAuthSelectOrganizationForm
      organizations={[ORGS[0]!]}
      onSelect={noopDecide}
      messages={SELECT_ORG_MESSAGES}
    />
  ),
}

export const SelectOrganizationEmpty: Story = {
  render: () => (
    <OAuthSelectOrganizationForm
      organizations={[]}
      onSelect={noopDecide}
      messages={SELECT_ORG_MESSAGES}
    />
  ),
}

// --- OAuthRedirectNotice ---

export const RedirectNotice: Story = {
  render: () => (
    <OAuthRedirectNotice
      messages={{
        title: "Connected",
        description: "Returning you to Cursor…",
      }}
      onRedirect={() => {}}
      delayMs={1_000_000}
    />
  ),
}
