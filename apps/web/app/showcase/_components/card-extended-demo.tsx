import { CardExtended } from "@workspace/ui/components/card-extended"
import {
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

function Sample() {
  return (
    <>
      <CardHeader>
        <CardTitle>
          <div className="h-8 w-full max-w-40 rounded-md bg-secondary" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-20 w-full rounded-md bg-secondary" />
      </CardContent>
    </>
  )
}

export function CardExtendedDemo() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <CardExtended variant="shadow">
        <Sample />
      </CardExtended>
      <CardExtended variant="lines">
        <Sample />
      </CardExtended>
      <CardExtended variant="hatched">
        <Sample />
      </CardExtended>
      <CardExtended variant="aurora">
        <Sample />
      </CardExtended>
      <div className="py-10">
        <CardExtended variant="tilted">
          <Sample />
        </CardExtended>
      </div>
      <CardExtended variant="stacked">
        <Sample />
      </CardExtended>
    </div>
  )
}
