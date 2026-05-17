import { RingLoader } from "@workspace/ui/components/ring-loader"

export function RingLoaderDemo() {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <RingLoader />
      <RingLoader className="size-8 text-primary" />
      <RingLoader className="size-10 text-success" />
      <RingLoader className="size-10 text-destructive" />
      <RingLoader
        className="size-12 text-info"
        style={{ "--duration": "3s" } as React.CSSProperties}
      />
    </div>
  )
}
