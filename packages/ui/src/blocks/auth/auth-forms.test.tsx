import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, it, expect, vi } from "vitest"

import { AuthHeaderLinkProvider } from "./auth-header-link"
import { LoginEmailForm } from "./login-email-form"
import { LoginPasswordForm } from "./login-password-form"
import { ForgotPasswordForm } from "./forgot-password-form"
import { ResetPasswordForm } from "./reset-password-form"
import { LoginMfaForm } from "./login-mfa-form"

// Test wrapper that provides the AuthHeaderLinkProvider context
function Wrap({ children }: { children: React.ReactNode }) {
  return <AuthHeaderLinkProvider>{children}</AuthHeaderLinkProvider>
}

// --- LoginEmailForm ---

describe("LoginEmailForm", () => {
  const baseMessages = {
    title: "Sign in",
    description: "Enter your email",
    label: "Work email",
    placeholder: "you@example.com",
    submit: "Continue",
    submitting: "Continuing…",
    errorFor: (_code: string) => "An error occurred",
    validationFor: (_key: string) => "Invalid value",
    signInFailed: "Sign in failed",
  }

  it("renders email input and submit button", () => {
    render(
      <Wrap>
        <LoginEmailForm
          defaultNext="/workspace"
          onSubmitEmail={async () => ({ ok: true })}
          onNavigate={vi.fn()}
          messages={baseMessages}
        />
      </Wrap>,
    )
    expect(screen.getByLabelText("Work email")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument()
  })

  it("shows validation error on empty submit", async () => {
    render(
      <Wrap>
        <LoginEmailForm
          defaultNext="/workspace"
          onSubmitEmail={async () => ({ ok: true })}
          onNavigate={vi.fn()}
          messages={baseMessages}
        />
      </Wrap>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() => {
      expect(screen.getByText("Invalid value")).toBeInTheDocument()
    })
  })

  it("calls onSubmitEmail with email value on valid input", async () => {
    const onSubmitEmail = vi.fn().mockResolvedValue({ ok: true })
    const onNavigate = vi.fn()

    render(
      <Wrap>
        <LoginEmailForm
          defaultNext="/workspace"
          onSubmitEmail={onSubmitEmail}
          onNavigate={onNavigate}
          messages={baseMessages}
        />
      </Wrap>,
    )

    await userEvent.type(
      screen.getByLabelText("Work email"),
      "test@example.com",
    )
    await userEvent.click(screen.getByRole("button", { name: "Continue" }))

    await waitFor(() => {
      expect(onSubmitEmail).toHaveBeenCalledWith({ email: "test@example.com" })
    })
  })

  it("navigates to password step on success", async () => {
    const onNavigate = vi.fn()

    render(
      <Wrap>
        <LoginEmailForm
          defaultNext="/workspace"
          onSubmitEmail={async () => ({ ok: true })}
          onNavigate={onNavigate}
          messages={baseMessages}
        />
      </Wrap>,
    )

    await userEvent.type(
      screen.getByLabelText("Work email"),
      "test@example.com",
    )
    await userEvent.click(screen.getByRole("button", { name: "Continue" }))

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith("/auth/login/password")
    })
  })

  it("shows server error when onSubmitEmail returns ok: false", async () => {
    render(
      <Wrap>
        <LoginEmailForm
          defaultNext="/workspace"
          onSubmitEmail={async () => ({
            ok: false,
            errorKey: undefined,
          })}
          onNavigate={vi.fn()}
          messages={baseMessages}
        />
      </Wrap>,
    )

    await userEvent.type(
      screen.getByLabelText("Work email"),
      "test@example.com",
    )
    await userEvent.click(screen.getByRole("button", { name: "Continue" }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Sign in failed")
    })
  })

  it("shows initial error from error code prop", () => {
    render(
      <Wrap>
        <LoginEmailForm
          defaultNext="/workspace"
          initialErrorCode="loginSessionExpired"
          onSubmitEmail={async () => ({ ok: true })}
          onNavigate={vi.fn()}
          messages={{
            ...baseMessages,
            errorFor: () => "Your session expired",
          }}
        />
      </Wrap>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Your session expired")
  })

  it("renders SSO section when showSso is true", () => {
    render(
      <Wrap>
        <LoginEmailForm
          defaultNext="/workspace"
          showSso
          onSubmitEmail={async () => ({ ok: true })}
          onNavigate={vi.fn()}
          messages={{
            ...baseMessages,
            divider: "or",
            ssoLabel: "Continue with SSO",
            ssoTooltip: "SSO coming soon",
          }}
        />
      </Wrap>,
    )
    expect(
      screen.getByRole("button", { name: /continue with sso/i }),
    ).toBeInTheDocument()
  })

  it("does not render SSO section when showSso is false", () => {
    render(
      <Wrap>
        <LoginEmailForm
          defaultNext="/workspace"
          onSubmitEmail={async () => ({ ok: true })}
          onNavigate={vi.fn()}
          messages={{
            ...baseMessages,
            ssoLabel: "Continue with SSO",
          }}
        />
      </Wrap>,
    )
    expect(
      screen.queryByRole("button", { name: /continue with sso/i }),
    ).not.toBeInTheDocument()
  })
})

// --- LoginPasswordForm ---

describe("LoginPasswordForm", () => {
  const baseMessages = {
    title: "Enter your password",
    description: "Sign in to continue",
    label: "Password",
    forgot: "Forgot password?",
    rememberMe: "Keep me signed in",
    submit: "Sign in",
    submitting: "Signing in…",
    emailMeLink: "Email me a link",
    useDifferentEmail: "Use a different email",
    magicLinkSentTitle: "Check your email",
    magicLinkSentDescription: (e: string) => `Link sent to ${e}`,
    magicLinkResend: "Resend",
    magicLinkResendIn: (s: string) => `Resend in ${s}s`,
    invalidCredentials: "Invalid credentials",
    signInFailed: "Sign in failed",
    validationFor: () => "Invalid value",
  }

  it("renders locked email field and password field", () => {
    render(
      <Wrap>
        <LoginPasswordForm
          email="user@example.com"
          defaultNext="/workspace"
          onSignIn={async () => ({ data: null, error: null })}
          onClearLoginEmail={async () => {}}
          onSendMagicLink={async () => ({ ok: true })}
          onNavigate={vi.fn()}
          messages={baseMessages}
        />
      </Wrap>,
    )
    expect(screen.getByDisplayValue("user@example.com")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  })

  it("shows server error on sign-in failure", async () => {
    render(
      <Wrap>
        <LoginPasswordForm
          email="user@example.com"
          defaultNext="/workspace"
          onSignIn={async () => ({
            data: null,
            error: { message: "Bad password" },
          })}
          onClearLoginEmail={async () => {}}
          onSendMagicLink={async () => ({ ok: true })}
          onNavigate={vi.fn()}
          messages={baseMessages}
        />
      </Wrap>,
    )

    await userEvent.type(screen.getByDisplayValue(""), "wrongpass")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Bad password")
    })
  })

  it("navigates to next on successful sign-in", async () => {
    const onNavigate = vi.fn()
    const onClearLoginEmail = vi.fn()

    render(
      <Wrap>
        <LoginPasswordForm
          email="user@example.com"
          defaultNext="/workspace"
          onSignIn={async () => ({
            data: { twoFactorRedirect: false },
            error: null,
          })}
          onClearLoginEmail={onClearLoginEmail}
          onSendMagicLink={async () => ({ ok: true })}
          onNavigate={onNavigate}
          messages={baseMessages}
        />
      </Wrap>,
    )

    await userEvent.type(screen.getByDisplayValue(""), "correctpass")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => {
      expect(onClearLoginEmail).toHaveBeenCalled()
      expect(onNavigate).toHaveBeenCalledWith("/workspace")
    })
  })

  it("runs afterSignInGate and blocks navigation when gate returns false", async () => {
    const onNavigate = vi.fn()
    const onSignOut = vi.fn()

    render(
      <Wrap>
        <LoginPasswordForm
          email="user@example.com"
          defaultNext="/"
          afterSignInGate={async () => false}
          onSignIn={async () => ({
            data: { twoFactorRedirect: false },
            error: null,
          })}
          onClearLoginEmail={async () => {}}
          onSendMagicLink={async () => ({ ok: true })}
          onSignOut={onSignOut}
          onNavigate={onNavigate}
          messages={baseMessages}
        />
      </Wrap>,
    )

    await userEvent.type(screen.getByDisplayValue(""), "somepass")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => {
      expect(onSignOut).toHaveBeenCalled()
      expect(onNavigate).not.toHaveBeenCalled()
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials")
    })
  })
})

// --- ForgotPasswordForm ---

describe("ForgotPasswordForm", () => {
  const baseMessages = {
    title: "Forgot password?",
    description: "Enter your email",
    label: "Work email",
    placeholder: "you@example.com",
    submit: "Send link",
    submitting: "Sending…",
    backToLogin: "Back to sign in",
    sentTitle: "Check your email",
    sentDescription: (e: string) => `Sent to ${e}`,
    sentResend: "Resend",
    sentResendIn: (s: string) => `Resend in ${s}s`,
    validationFor: () => "Invalid value",
  }

  it("renders email input and submit button", () => {
    render(
      <Wrap>
        <ForgotPasswordForm
          onRequestPasswordReset={async () => ({ ok: true })}
          messages={baseMessages}
        />
      </Wrap>,
    )
    expect(screen.getByLabelText("Work email")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Send link" }),
    ).toBeInTheDocument()
  })

  it("shows sent state after successful submit", async () => {
    render(
      <Wrap>
        <ForgotPasswordForm
          onRequestPasswordReset={async () => ({ ok: true })}
          messages={baseMessages}
        />
      </Wrap>,
    )

    await userEvent.type(
      screen.getByLabelText("Work email"),
      "test@example.com",
    )
    await userEvent.click(screen.getByRole("button", { name: "Send link" }))

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeInTheDocument()
      expect(screen.getByText("Sent to test@example.com")).toBeInTheDocument()
    })
  })
})

// --- ResetPasswordForm ---

describe("ResetPasswordForm", () => {
  const baseMessages = {
    title: "Set a new password",
    description: "Choose a strong password",
    newPasswordLabel: "New password",
    confirmPasswordLabel: "Confirm password",
    submit: "Set password",
    submitting: "Saving…",
    backToLogin: "Back to sign in",
    invalidLinkTitle: "Invalid link",
    invalidLinkDescription: "This link has expired.",
    invalidLinkRequestNew: "Request a new link",
    successTitle: "Password updated",
    successDescription: "Your password has been changed.",
    successSignIn: "Sign in",
    resetFailed: "Reset failed",
    validationFor: (key: string) => {
      const labels: Record<string, string> = {
        "password.length": "At least 8 characters",
        "password.number": "Contains a number",
        "password.symbol": "Contains a symbol",
        "password.mixedCase": "Mixed case",
      }
      return labels[key] ?? "Invalid"
    },
  }

  it("shows invalid link state when no token is provided", () => {
    render(
      <Wrap>
        <ResetPasswordForm
          token=""
          onResetPassword={async () => ({ ok: true })}
          onNavigate={vi.fn()}
          messages={baseMessages}
        />
      </Wrap>,
    )
    expect(screen.getByText("Invalid link")).toBeInTheDocument()
    expect(screen.getByText("Request a new link")).toBeInTheDocument()
  })

  it("renders password fields when token is provided", () => {
    render(
      <Wrap>
        <ResetPasswordForm
          token="valid-token"
          onResetPassword={async () => ({ ok: true })}
          onNavigate={vi.fn()}
          messages={baseMessages}
        />
      </Wrap>,
    )
    expect(screen.getByLabelText("New password")).toBeInTheDocument()
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument()
  })
})

// --- LoginMfaForm ---

describe("LoginMfaForm", () => {
  // input-otp uses a polling timer that can fire after test teardown;
  // clear all timers after each test to prevent spurious async errors.
  afterEach(() => {
    vi.clearAllTimers()
  })
  const baseMessages = {
    title: "Two-factor authentication",
    description: (e: string) => `Code for ${e}`,
    label: "Authentication code",
    submit: "Verify",
    submitting: "Verifying…",
    useRecoveryCode: "Use a recovery code",
    recoveryTitle: "Recovery code",
    recoveryDescription: (e: string) => `Backup for ${e}`,
    recoveryLabel: "Recovery code",
    recoveryPlaceholder: "XXXXX-XXXXX",
    useAuthenticator: "Use authenticator",
    invalidCode: "Invalid code",
    validationFor: () => "Invalid value",
  }

  it("renders OTP input and submit button", () => {
    render(
      <Wrap>
        <LoginMfaForm
          email="user@example.com"
          defaultNext="/workspace"
          onVerifyTotp={async () => ({ data: null, error: null })}
          onVerifyBackupCode={async () => ({ data: null, error: null })}
          onClearLoginEmail={async () => {}}
          onNavigate={vi.fn()}
          messages={baseMessages}
        />
      </Wrap>,
    )
    expect(screen.getByRole("button", { name: "Verify" })).toBeInTheDocument()
    expect(screen.getByText("Use a recovery code")).toBeInTheDocument()
  })

  it("switches to recovery mode on click", async () => {
    render(
      <Wrap>
        <LoginMfaForm
          email="user@example.com"
          defaultNext="/workspace"
          onVerifyTotp={async () => ({ data: null, error: null })}
          onVerifyBackupCode={async () => ({ data: null, error: null })}
          onClearLoginEmail={async () => {}}
          onNavigate={vi.fn()}
          messages={baseMessages}
        />
      </Wrap>,
    )

    await userEvent.click(screen.getByText("Use a recovery code"))

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Recovery code" }),
      ).toBeInTheDocument()
      expect(screen.getByText("Use authenticator")).toBeInTheDocument()
    })
  })
})
