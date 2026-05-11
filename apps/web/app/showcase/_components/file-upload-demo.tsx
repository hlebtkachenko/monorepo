"use client"

import { UploadIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadList,
  FileUploadTrigger,
} from "@workspace/ui/components/file-upload"

export function FileUploadDemo() {
  return (
    <div className="w-full max-w-md">
      <FileUpload maxFiles={5} maxSize={5 * 1024 * 1024} multiple>
        <FileUploadDropzone>
          <div className="flex flex-col items-center gap-1">
            <UploadIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Drag and drop files here</p>
            <p className="text-xs text-muted-foreground">
              or click to browse (max 5 files, 5 MB each)
            </p>
          </div>
          <FileUploadTrigger asChild>
            <Button variant="outline" size="sm" className="mt-2">
              Choose files
            </Button>
          </FileUploadTrigger>
        </FileUploadDropzone>
        <FileUploadList />
      </FileUpload>
    </div>
  )
}
