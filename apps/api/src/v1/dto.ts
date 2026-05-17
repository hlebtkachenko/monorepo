import { createZodDto } from "nestjs-zod"
import {
  ListOrganizationsResponseSchema,
  PingResponseSchema,
} from "@workspace/shared/api"

/**
 * NestJS DTO classes derived from the shared Zod schemas. They provide the
 * OpenAPI component schemas for `@nestjs/swagger` (one schema, no duplication).
 */
export class PingResponseDto extends createZodDto(PingResponseSchema) {}
export class ListOrganizationsResponseDto extends createZodDto(
  ListOrganizationsResponseSchema,
) {}
