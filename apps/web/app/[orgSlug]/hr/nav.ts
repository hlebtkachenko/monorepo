import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/** HR module sidebar nav. `base` = `/${orgSlug}/hr`. */
export function hrNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Users" },
    { label: "Employees", href: `${base}/employees`, icon: "IdCard" },
    { label: "Payroll", href: `${base}/payroll`, icon: "Banknote" },
    { label: "Travels", href: `${base}/travels`, icon: "Briefcase" },
    { label: "Expenses", href: `${base}/expenses`, icon: "ReceiptEuro" },
  ]
}
