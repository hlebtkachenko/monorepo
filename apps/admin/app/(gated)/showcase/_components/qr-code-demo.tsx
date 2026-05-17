"use client"

import {
  QRCode,
  QRCodeCanvas,
  QRCodeDownload,
  QRCodeOverlay,
  QRCodeSkeleton,
} from "@workspace/ui/components/qr-code"
import { Button } from "@workspace/ui/components/button"

export function QRCodeDemo() {
  return (
    <div className="flex flex-wrap items-start gap-8">
      <QRCode value="https://example.com" size={180}>
        <QRCodeSkeleton />
        <QRCodeCanvas />
        <QRCodeDownload asChild>
          <Button size="sm" variant="outline">
            Download PNG
          </Button>
        </QRCodeDownload>
      </QRCode>

      <QRCode value="https://example.com/contact" size={200} level="H">
        <QRCodeSkeleton />
        <QRCodeCanvas />
        <QRCodeOverlay className="size-10 border border-border">
          <div className="size-6 rounded-sm bg-primary" />
        </QRCodeOverlay>
      </QRCode>
    </div>
  )
}
