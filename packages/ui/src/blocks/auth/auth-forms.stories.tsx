import type { Meta, StoryObj } from "@storybook/react"

import { AuthHeaderLinkProvider } from "./auth-header-link"
import { LoginEmailForm, type LoginEmailFormMessages } from "./login-email-form"
import {
  LoginPasswordForm,
  type LoginPasswordFormMessages,
} from "./login-password-form"
import { LoginMfaForm, type LoginMfaFormMessages } from "./login-mfa-form"
import {
  ForgotPasswordForm,
  type ForgotPasswordFormMessages,
} from "./forgot-password-form"
import {
  ResetPasswordForm,
  type ResetPasswordFormMessages,
} from "./reset-password-form"

const noop = async (): Promise<void> => {}
const noopNavigate = (_href: string): void => {}

const EMAIL_MESSAGES: LoginEmailFormMessages = {
  title: "Sign in to Afframe",
  description: "Enter your work email to continue.",
  label: "Work email",
  placeholder: "you@company.com",
  submit: "Continue",
  submitting: "Continuing…",
  divider: "or",
  ssoLabel: "Continue with SSO",
  ssoTooltip: "SSO is coming soon",
  contactSalesPrompt: "Don't have an account?",
  contactSalesCta: "Contact sales",
  errorFor: () => "An error occurred",
  validationFor: () => "Invalid value",
  signInFailed: "Sign in failed",
}

const PASSWORD_MESSAGES: LoginPasswordFormMessages = {
  title: "Enter your password",
  description: "Sign in to Afframe",
  label: "Password",
  forgot: "Forgot password?",
  rememberMe: "Keep me signed in for 30 days",
  submit: "Sign in",
  submitting: "Signing in…",
  emailMeLink: "Email me a sign-in link",
  useDifferentEmail: "Use a different email",
  magicLinkSentTitle: "Check your email",
  magicLinkSentDescription: (e) => `We sent a link to ${e}`,
  magicLinkResend: "Resend link",
  magicLinkResendIn: (s) => `Resend in ${s}s`,
  invalidCredentials: "Invalid email or password",
  signInFailed: "Sign in failed",
  validationFor: () => "Invalid value",
}

const MFA_MESSAGES: LoginMfaFormMessages = {
  title: "Two-factor authentication",
  description: (e) => `Enter the code from your authenticator app (${e})`,
  label: "Authentication code",
  submit: "Verify",
  submitting: "Verifying…",
  useRecoveryCode: "Use a recovery code instead",
  recoveryTitle: "Use a recovery code",
  recoveryDescription: (e) => `Enter a backup code for ${e}`,
  recoveryLabel: "Recovery code",
  recoveryPlaceholder: "XXXXX-XXXXX",
  useAuthenticator: "Use authenticator instead",
  invalidCode: "Invalid code",
  validationFor: () => "Invalid value",
}

const FORGOT_MESSAGES: ForgotPasswordFormMessages = {
  title: "Forgot your password?",
  description: "Enter your email and we'll send a reset link.",
  label: "Work email",
  placeholder: "you@company.com",
  submit: "Send reset link",
  submitting: "Sending…",
  backToLogin: "Back to sign in",
  sentTitle: "Check your email",
  sentDescription: (e) => `We sent a reset link to ${e}`,
  sentResend: "Resend email",
  sentResendIn: (s) => `Resend in ${s}s`,
  validationFor: () => "Invalid value",
}

const RESET_MESSAGES: ResetPasswordFormMessages = {
  title: "Set a new password",
  description: "Choose a strong password for your account.",
  newPasswordLabel: "New password",
  confirmPasswordLabel: "Confirm password",
  submit: "Set password",
  submitting: "Saving…",
  backToLogin: "Back to sign in",
  invalidLinkTitle: "Invalid or expired link",
  invalidLinkDescription: "This password reset link has expired.",
  invalidLinkRequestNew: "Request a new link",
  successTitle: "Password updated",
  successDescription: "Your password has been changed.",
  successSignIn: "Sign in",
  resetFailed: "Reset failed",
  validationFor: (key) => {
    const labels: Record<string, string> = {
      "password.length": "At least 8 characters",
      "password.number": "Contains a number",
      "password.symbol": "Contains a symbol",
      "password.mixedCase": "Mixed case",
    }
    return labels[key] ?? key
  },
}

const meta: Meta = {
  title: "Blocks/AuthForms",
  decorators: [
    (Story) => (
      <AuthHeaderLinkProvider>
        <div className="mx-auto max-w-md p-8">
          <Story />
        </div>
      </AuthHeaderLinkProvider>
    ),
  ],
}
export default meta

type Story = StoryObj

// --- LoginEmailForm ---

export const LoginEmailDefault: Story = {
  render: () => (
    <LoginEmailForm
      defaultNext="/workspace"
      onSubmitEmail={async () => ({ ok: true })}
      onNavigate={noopNavigate}
      messages={{
        ...EMAIL_MESSAGES,
        ssoLabel: undefined,
        ssoTooltip: undefined,
        divider: undefined,
      }}
    />
  ),
}

export const LoginEmailWithSso: Story = {
  render: () => (
    <LoginEmailForm
      defaultNext="/workspace"
      showSso
      showContactSales
      onSubmitEmail={async () => ({ ok: true })}
      onNavigate={noopNavigate}
      messages={EMAIL_MESSAGES}
    />
  ),
}

export const LoginEmailAdmin: Story = {
  render: () => (
    <LoginEmailForm
      defaultNext="/"
      onSubmitEmail={async () => ({ ok: true })}
      onNavigate={noopNavigate}
      messages={{
        ...EMAIL_MESSAGES,
        title: (
          <>
            Sign in to <span className="text-destructive">Admin</span>
          </>
        ),
        placeholder: "admin@afframe.com",
        ssoLabel: undefined,
        ssoTooltip: undefined,
        divider: undefined,
      }}
    />
  ),
}

export const LoginEmailWithError: Story = {
  render: () => (
    <LoginEmailForm
      defaultNext="/workspace"
      initialErrorCode="loginSessionExpired"
      onSubmitEmail={async () => ({ ok: true })}
      onNavigate={noopNavigate}
      messages={{
        ...EMAIL_MESSAGES,
        errorFor: () => "Your session expired. Please sign in again.",
      }}
    />
  ),
}

// --- LoginPasswordForm ---

export const LoginPasswordDefault: Story = {
  render: () => (
    <LoginPasswordForm
      email="user@example.com"
      defaultNext="/workspace"
      onSignIn={async () => ({ data: null, error: null })}
      onClearLoginEmail={noop}
      onSendMagicLink={async () => ({ ok: true })}
      onNavigate={noopNavigate}
      messages={PASSWORD_MESSAGES}
    />
  ),
}

// --- LoginMfaForm ---

export const LoginMfaTotp: Story = {
  render: () => (
    <LoginMfaForm
      email="user@example.com"
      defaultNext="/workspace"
      onVerifyTotp={async () => ({ data: null, error: null })}
      onVerifyBackupCode={async () => ({ data: null, error: null })}
      onClearLoginEmail={noop}
      onNavigate={noopNavigate}
      messages={MFA_MESSAGES}
    />
  ),
}

// --- ForgotPasswordForm ---

export const ForgotPasswordDefault: Story = {
  render: () => (
    <ForgotPasswordForm
      onRequestPasswordReset={async () => ({ ok: true })}
      messages={FORGOT_MESSAGES}
    />
  ),
}

// --- ResetPasswordForm ---

export const ResetPasswordNoToken: Story = {
  render: () => (
    <ResetPasswordForm
      token=""
      onResetPassword={async () => ({ ok: true })}
      onNavigate={noopNavigate}
      messages={RESET_MESSAGES}
    />
  ),
}

export const ResetPasswordWithToken: Story = {
  render: () => (
    <ResetPasswordForm
      token="mock-reset-token"
      onResetPassword={async () => ({ ok: true })}
      onNavigate={noopNavigate}
      messages={RESET_MESSAGES}
    />
  ),
}
