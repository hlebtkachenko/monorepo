import "server-only"

import { ArrowUpRight } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"

import { auditAdminAction } from "@/lib/admin-audit"
import { PageHeader, StubBanner } from "@/app/(gated)/_components"

export const metadata = { title: "Changelog" }
export const revalidate = 3600

const repositorySlug =
  process.env.GITHUB_REPOSITORY?.trim() ??
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY?.trim()
const releasesApi = repositorySlug
  ? `https://api.github.com/repos/${repositorySlug}/releases?per_page=20`
  : null
const releasesUrl = repositorySlug
  ? `https://github.com/${repositorySlug}/releases`
  : null

type Release = {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  published_at: string | null
  draft: boolean
  prerelease: boolean
}

async function fetchReleases(): Promise<Release[] | null> {
  if (!releasesApi) return null
  try {
    const res = await fetch(releasesApi, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "afframe-admin",
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as Release[]
    return data.filter((release) => !release.draft)
  } catch {
    return null
  }
}

function formatDate(value: string | null): string {
  if (!value) return ""
  return value.slice(0, 10)
}

export default async function Page() {
  await auditAdminAction({ action: "admin.changelog.viewed" })

  const releases = await fetchReleases()

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Changelog"
        description="Released versions, pulled live from GitHub Releases."
      />

      {releases === null ? (
        <StubBanner>
          {releasesUrl ? (
            <>
              Could not load releases from GitHub right now.
              <span className="mt-2 block">
                View them on{" "}
                <a
                  href={releasesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 underline underline-offset-4"
                >
                  GitHub
                  <ArrowUpRight className="size-3" />
                </a>
                .
              </span>
            </>
          ) : (
            "GitHub repository metadata is not configured for this build."
          )}
        </StubBanner>
      ) : releases.length === 0 && releasesUrl ? (
        <p className="text-sm text-muted-foreground">
          No releases published yet.{" "}
          <a
            href={releasesUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 underline underline-offset-4"
          >
            GitHub
            <ArrowUpRight className="size-3" />
          </a>
        </p>
      ) : releases.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No releases published yet.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {releases.map((release) => (
            <section
              key={release.id}
              className="rounded-md border border-border p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={release.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium underline-offset-4 hover:underline"
                >
                  {release.name || release.tag_name}
                  <ArrowUpRight className="size-3" />
                </a>
                <Badge variant="outline" className="font-mono">
                  {release.tag_name}
                </Badge>
                {release.prerelease ? (
                  <Badge variant="secondary">Pre-release</Badge>
                ) : null}
                {release.published_at ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDate(release.published_at)}
                  </span>
                ) : null}
              </div>

              {release.body ? (
                <pre className="mt-3 rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {release.body}
                </pre>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
