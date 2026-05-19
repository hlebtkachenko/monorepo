import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { ImageCropper, type CropShape } from "./image-cropper"

const meta: Meta<typeof ImageCropper> = {
  title: "Components/ImageCropper",
  component: ImageCropper,
}
export default meta
type Story = StoryObj<typeof ImageCropper>

// A 1x1 PNG encoded as a data URL, converted to a File so the cropper has
// a real source to render inside Storybook.
const SAMPLE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob()
  return new File([blob], name, { type: blob.type })
}

function Demo({
  cropShape,
  withOnRemove,
}: {
  cropShape?: CropShape
  withOnRemove?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [resultUrl, setResultUrl] = React.useState<string | null>(null)
  const [removed, setRemoved] = React.useState(false)

  const openCropper = async () => {
    const sample = await dataUrlToFile(SAMPLE_PNG, "sample.png")
    setFile(sample)
    setRemoved(false)
    setOpen(true)
  }

  function handleRemove() {
    setResultUrl(null)
    setFile(null)
    setRemoved(true)
    setOpen(false)
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <Button onClick={openCropper}>Edit avatar</Button>
      {removed && (
        <p className="text-sm text-muted-foreground">Avatar removed.</p>
      )}
      {resultUrl && !removed && (
        <img
          src={resultUrl}
          alt="Cropped result"
          className="size-24 rounded-full border object-cover"
        />
      )}
      <ImageCropper
        open={open}
        file={file}
        {...(cropShape ? { cropShape } : {})}
        onCancel={() => setOpen(false)}
        onCropComplete={(blob) => {
          setResultUrl(URL.createObjectURL(blob))
          setOpen(false)
        }}
        {...(withOnRemove ? { onRemove: handleRemove } : {})}
      />
    </div>
  )
}

export const Round: Story = {
  render: () => <Demo cropShape="round" />,
}

export const Rect: Story = {
  render: () => <Demo cropShape="rect" />,
}

export const WithOnRemove: Story = {
  name: "With onRemove callback",
  render: () => <Demo cropShape="round" withOnRemove />,
}
