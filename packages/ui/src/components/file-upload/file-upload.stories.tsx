import type { Meta, StoryObj } from "@storybook/react"
import { UploadIcon, XIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  FileUpload,
  FileUploadClear,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadItemProgress,
  FileUploadList,
  FileUploadTrigger,
} from "./file-upload"

const meta: Meta<typeof FileUpload> = {
  title: "Components/FileUpload",
  component: FileUpload,
  parameters: { layout: "padded" },
}
export default meta
type Story = StoryObj<typeof FileUpload>

export const Default: Story = {
  render: () => (
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
  ),
}

export const SingleFile: Story = {
  render: () => (
    <div className="w-full max-w-md">
      <FileUpload accept="image/*" maxSize={2 * 1024 * 1024}>
        <FileUploadDropzone>
          <div className="flex flex-col items-center gap-1">
            <UploadIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Upload an image</p>
            <p className="text-xs text-muted-foreground">PNG, JPG up to 2 MB</p>
          </div>
        </FileUploadDropzone>
        <FileUploadList />
      </FileUpload>
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="w-full max-w-md">
      <FileUpload disabled>
        <FileUploadDropzone>
          <div className="flex flex-col items-center gap-1">
            <UploadIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Upload disabled</p>
          </div>
        </FileUploadDropzone>
      </FileUpload>
    </div>
  ),
}

export const Invalid: Story = {
  render: () => (
    <div className="w-full max-w-md">
      <FileUpload invalid>
        <FileUploadDropzone>
          <div className="flex flex-col items-center gap-1">
            <UploadIcon className="size-6 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Validation failed
            </p>
            <p className="text-xs text-muted-foreground">
              Drop a different file
            </p>
          </div>
        </FileUploadDropzone>
      </FileUpload>
    </div>
  ),
}

export const HorizontalList: Story = {
  render: () => (
    <div className="w-full max-w-2xl">
      <FileUpload multiple>
        <FileUploadDropzone>
          <div className="flex flex-col items-center gap-1">
            <UploadIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Drag and drop files</p>
          </div>
        </FileUploadDropzone>
        <FileUploadList orientation="horizontal" />
      </FileUpload>
    </div>
  ),
}

export const CustomItem: Story = {
  render: () => (
    <div className="w-full max-w-md">
      <FileUpload multiple>
        <FileUploadDropzone>
          <div className="flex flex-col items-center gap-1">
            <UploadIcon className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Drag and drop files</p>
          </div>
          <FileUploadTrigger asChild>
            <Button variant="outline" size="sm" className="mt-2">
              Choose files
            </Button>
          </FileUploadTrigger>
        </FileUploadDropzone>
        <FileUploadList>
          {/* Custom children render handled by composing FileUploadItem per file outside */}
        </FileUploadList>
        <FileUploadClear asChild>
          <Button variant="ghost" size="sm">
            Clear all
          </Button>
        </FileUploadClear>
      </FileUpload>
    </div>
  ),
}

export const ItemWithCustomDelete: Story = {
  render: () => {
    const fakeFile = new File(["hello"], "report.pdf", {
      type: "application/pdf",
    })
    return (
      <div className="w-full max-w-md">
        <FileUpload defaultValue={[fakeFile]}>
          <FileUploadList>
            <FileUploadItem value={fakeFile}>
              <FileUploadItemPreview />
              <FileUploadItemMetadata />
              <FileUploadItemProgress />
              <FileUploadItemDelete asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Remove file">
                  <XIcon />
                </Button>
              </FileUploadItemDelete>
            </FileUploadItem>
          </FileUploadList>
        </FileUpload>
      </div>
    )
  },
}
