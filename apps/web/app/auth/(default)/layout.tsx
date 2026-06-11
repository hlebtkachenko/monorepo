import type { ReactNode } from "react"
import { getTranslations } from "@workspace/i18n/server"
import { getBuildVersion, Logo } from "@workspace/ui/brand-assets"
import {
  AuthShell,
  AuthShellAside,
  AuthShellBody,
  AuthShellFooter,
  AuthShellHeader,
  AuthShellLeft,
} from "@workspace/ui/blocks/auth-shell"
import {
  AuthShellChromeAside,
  AuthShellChromeFooter,
} from "@workspace/ui/blocks/auth"

import { LanguagePicker } from "../../_components/language-picker"
import { AuthHeaderLinkProvider } from "./_components/auth-header-link"
import { AuthHeaderRight } from "./_components/auth-header-right"

export default async function AuthDefaultLayout({
  children,
}: {
  children: ReactNode
}) {
  const tBrand = await getTranslations("brand")
  const tLayout = await getTranslations("layout.footer")
  const tAside = await getTranslations("auth.aside")
  const brand = tBrand("name")

  return (
    <AuthHeaderLinkProvider>
      <AuthShell>
        <AuthShellLeft>
          <AuthShellHeader>
            <div className="flex w-full items-center justify-between gap-4">
              <Logo
                variant="horizontal"
                tone="primary"
                className="h-6 w-auto"
                aria-label={brand}
              />
              <AuthHeaderRight
                defaultHref={tBrand("returnLinkHref")}
                defaultLabel={tBrand("returnLinkLabel")}
              />
            </div>
          </AuthShellHeader>
          <AuthShellBody>{children}</AuthShellBody>
          <AuthShellFooter>
            <AuthShellChromeFooter
              brand={brand}
              version={getBuildVersion()}
              labels={{
                privacy: tLayout("privacy"),
                terms: tLayout("terms"),
                status: tLayout("status"),
              }}
            >
              <LanguagePicker />
            </AuthShellChromeFooter>
          </AuthShellFooter>
        </AuthShellLeft>
        <AuthShellAside>
          <AuthShellChromeAside
            image="/auth/aside-bg.webp"
            headline={tAside("headline")}
            subtitle={tAside("subtitle", { brand })}
            quote={{
              text: tAside("quote.text"),
              author: tAside("quote.author"),
              role: tAside("quote.role"),
            }}
            partnersLabel={tAside("partnersLabel", { brand })}
          />
        </AuthShellAside>
      </AuthShell>
    </AuthHeaderLinkProvider>
  )
}
