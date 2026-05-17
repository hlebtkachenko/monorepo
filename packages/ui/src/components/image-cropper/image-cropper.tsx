"use client"

import * as React from "react"
import Cropper, { type Area, type Point } from "react-easy-crop"
import "react-easy-crop/react-easy-crop.css"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Slider } from "@workspace/ui/components/slider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { MinusIcon, PlusIcon } from "@workspace/ui/lib/icons"

type CropShape = "round" | "rect"

interface ImageCropperProps {
  /** Controls dialog visibility. */
  open: boolean
  /** The picked image file. Cropper renders nothing until a file is set. */
  file: File | null
  /** Crop overlay shape. Defaults to "round". */
  cropShape?: CropShape
  /** Largest output edge in pixels. Defaults to 512. */
  maxOutputSize?: number
  /** Output image MIME type. Defaults to "image/png". */
  outputType?: "image/png" | "image/jpeg"
  /** Dialog title text. Defaults to "Edit avatar". */
  title?: string
  /** Called when the user dismisses without saving. */
  onCancel: () => void
  /** Called with the cropped square image as a Blob. */
  onCropComplete: (result: Blob) => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.01
const INITIAL_CROP: Point = { x: 0, y: 0 }

/**
 * Draws the selected crop area onto a canvas and returns it as a Blob.
 * The output is a square image whose edge is capped at maxOutputSize.
 */
async function cropImageToBlob(
  imageSrc: string,
  pixelCrop: Area,
  maxOutputSize: number,
  outputType: "image/png" | "image/jpeg",
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.addEventListener("load", () => resolve(img))
    img.addEventListener("error", () =>
      reject(new Error("Failed to load image for cropping")),
    )
    img.src = imageSrc
  })

  const edge = Math.min(
    maxOutputSize,
    Math.round(pixelCrop.width) || maxOutputSize,
  )
  const canvas = document.createElement("canvas")
  canvas.width = edge
  canvas.height = edge

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable")
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    edge,
    edge,
  )

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error("Canvas produced an empty blob"))
        }
      },
      outputType,
      outputType === "image/jpeg" ? 0.92 : undefined,
    )
  })
}

function ImageCropper({
  open,
  file,
  cropShape = "round",
  maxOutputSize = 512,
  outputType = "image/png",
  title = "Edit avatar",
  onCancel,
  onCropComplete,
}: ImageCropperProps) {
  const [crop, setCrop] = React.useState<Point>(INITIAL_CROP)
  const [zoom, setZoom] = React.useState(MIN_ZOOM)
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(
    null,
  )
  const [saving, setSaving] = React.useState(false)

  // Derive a stable object URL from the picked file; revoke it on change.
  const imageSrc = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  )
  React.useEffect(() => {
    if (!imageSrc) return
    return () => URL.revokeObjectURL(imageSrc)
  }, [imageSrc])

  // Reset interaction state whenever a new image loads or the dialog reopens.
  // Tracking the previous inputs during render avoids a cascading effect.
  const [lastReset, setLastReset] = React.useState<{
    open: boolean
    imageSrc: string | null
  }>({ open, imageSrc })
  if (lastReset.open !== open || lastReset.imageSrc !== imageSrc) {
    setLastReset({ open, imageSrc })
    if (open) {
      setCrop(INITIAL_CROP)
      setZoom(MIN_ZOOM)
      setCroppedAreaPixels(null)
      setSaving(false)
    }
  }

  const handleCropComplete = React.useCallback(
    (_area: Area, areaPixels: Area) => {
      setCroppedAreaPixels(areaPixels)
    },
    [],
  )

  const handleReset = React.useCallback(() => {
    setCrop(INITIAL_CROP)
    setZoom(MIN_ZOOM)
  }, [])

  const handleSave = React.useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return
    setSaving(true)
    try {
      const blob = await cropImageToBlob(
        imageSrc,
        croppedAreaPixels,
        maxOutputSize,
        outputType,
      )
      onCropComplete(blob)
    } finally {
      setSaving(false)
    }
  }, [imageSrc, croppedAreaPixels, maxOutputSize, outputType, onCropComplete])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent
        data-slot="image-cropper"
        showCloseButton={false}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div
          data-slot="image-cropper-canvas"
          className={cn(
            "relative h-72 w-full overflow-hidden rounded-lg bg-muted",
          )}
        >
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape={cropShape}
              showGrid={false}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No image selected
            </div>
          )}
        </div>

        <div
          data-slot="image-cropper-zoom"
          className="flex items-center gap-3"
        >
          <MinusIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <Slider
            aria-label="Zoom"
            value={[zoom]}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            disabled={!imageSrc}
            onValueChange={(values) => {
              const next = values[0]
              if (typeof next === "number") setZoom(next)
            }}
          />
          <PlusIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        </div>

        <div
          data-slot="image-cropper-footer"
          className="-mx-4 -mb-4 flex items-center justify-between gap-2 rounded-b-xl border-t bg-muted/50 p-4"
        >
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={!imageSrc || saving}
          >
            Reset
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!imageSrc || !croppedAreaPixels || saving}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { ImageCropper }
export type { ImageCropperProps, CropShape }
