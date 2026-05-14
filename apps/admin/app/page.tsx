import Link from "next/link"

export default function AdminPage() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <h1>Admin Tools</h1>
        <Link href="/showcase" className="text-primary underline">
          Component Showcase
        </Link>
        <Link href="/typography" className="text-primary underline">
          Typography
        </Link>
      </div>
    </div>
  )
}
