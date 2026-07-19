/**
 * A module landing page placeholder. The content-panel header title is supplied
 * by the shell from the active nav entry (the module name), so this just fills
 * the body. Replace with a real `ContentPanel` as each module gets built out.
 *
 * Canonical location — this cross-tier-shared file is the source of truth; the
 * org tier (`[orgSlug]/_components/module-page.tsx`) re-exports it, so nothing
 * outside the org route tree imports into it.
 */
export function ModulePage({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-md space-y-2">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">
          {description ?? "Module content lands here."}
        </p>
      </div>
    </div>
  )
}
