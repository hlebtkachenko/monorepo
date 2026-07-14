export {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
export { getSignedUrl } from "@aws-sdk/s3-request-presigner"
export { Upload } from "@aws-sdk/lib-storage"

export * from "./document-store"
export * from "./document-validation"
export { S3DocumentStore } from "./document-store-s3"
export type { S3DocumentStoreConfig } from "./document-store-s3"
