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
  title: "Welcome aboard",
}

export default function SignupDonePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>You are all set</CardTitle>
        <CardDescription>
          Your workspace is ready. Add your first organization or invite
          teammates from settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/workspace">Continue to your workspace</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
