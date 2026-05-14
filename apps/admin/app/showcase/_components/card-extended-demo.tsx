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
          <div className="h-6 w-full max-w-32 rounded-md bg-secondary" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-16 w-full rounded-md bg-secondary" />
      </CardContent>
    </>
  )
}

const variants = [
  "shadow",
  "lines",
  "hatched",
  "aurora",
  "tilted",
  "stacked",
] as const

export function CardExtendedDemo() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {variants.map((v) => (
        <CardExtended key={v} variant={v}>
          <Sample />
        </CardExtended>
      ))}
    </div>
  )
}
