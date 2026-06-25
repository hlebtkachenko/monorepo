import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** Finance module sidebar nav. `base` = `/${orgSlug}/finance`. */
export function financeNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "ReceiptEuro" },
    { label: "Bank", href: `${base}/bank`, icon: "Building2" },
    { label: "Cash", href: `${base}/cash`, icon: "Banknote" },
    { label: "Accounts", href: `${base}/accounts`, icon: "PiggyBank" },
    { label: "Credits", href: `${base}/credits`, icon: "CreditCard" },
  ]
}
