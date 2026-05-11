import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export const metadata = {
  title: "Welcome to the team",
}

export default async function InviteDonePage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug } = await searchParams
  const target = slug ? `/${slug}` : "/workspace"

  return (
    <Card>
      <CardHeader>
        <CardTitle>You are in</CardTitle>
        <CardDescription>Your invitation has been accepted.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href={target}>
            {slug ? `Continue to ${slug}` : "Continue to your workspace"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
