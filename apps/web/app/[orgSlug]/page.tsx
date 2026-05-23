import { AppRail } from "@workspace/ui/blocks/app-rail"
import { AppShell } from "@workspace/ui/blocks/app-shell"
import {
  BarChart3,
  BookOpenText,
  Briefcase,
  Building2,
  FolderOpen,
  Home,
  ListChecksIcon,
  PiggyBank,
  Settings,
  Users,
} from "@workspace/ui/lib/icons"

export const metadata = {
  title: "Dashboard",
}

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const items = [
    {
      key: "home",
      label: "Home",
      icon: <Home className="size-5" />,
      href: `/${orgSlug}`,
      active: true,
    },
    {
      key: "journals",
      label: "Journals",
      icon: <BookOpenText className="size-5" />,
      href: `/${orgSlug}/journals`,
    },
    {
      key: "documents",
      label: "Documents",
      icon: <FolderOpen className="size-5" />,
      href: `/${orgSlug}/documents`,
    },
    {
      key: "finance",
      label: "Finance",
      icon: <PiggyBank className="size-5" />,
      href: `/${orgSlug}/finance`,
    },
    {
      key: "hr",
      label: "HR",
      icon: <Users className="size-5" />,
      href: `/${orgSlug}/hr`,
    },
    {
      key: "assets",
      label: "Assets",
      icon: <Briefcase className="size-5" />,
      href: `/${orgSlug}/assets`,
      separatorAfter: true,
    },
    {
      key: "closing",
      label: "Closing",
      icon: <ListChecksIcon className="size-5" />,
      href: `/${orgSlug}/closing`,
    },
    {
      key: "reports",
      label: "Reports",
      icon: <BarChart3 className="size-5" />,
      href: `/${orgSlug}/reports`,
      separatorAfter: true,
    },
    {
      key: "directory",
      label: "Directory",
      icon: <Building2 className="size-5" />,
      href: `/${orgSlug}/directory`,
    },
    {
      key: "settings",
      label: "Settings",
      icon: <Settings className="size-5" />,
      href: `/${orgSlug}/settings`,
    },
  ]
  return (
    <AppShell
      header={<div className="size-full" />}
      rail={<AppRail items={items} />}
      sidebar={<div className="size-full" />}
      assistant={<div className="size-full" />}
      logoHref={`/${orgSlug}`}
    >
      <div className="size-full" />
    </AppShell>
  )
}
