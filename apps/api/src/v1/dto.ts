import { createZodDto } from "nestjs-zod"
import {
  GetOrganizationResponseSchema,
  JournalResponseSchema,
  LedgerResponseSchema,
  OpenItemsResponseSchema,
  PingResponseSchema,
  SaldokontoResponseSchema,
} from "@workspace/shared/api"

/**
 * NestJS DTO classes derived from the shared Zod schemas. They provide the
 * OpenAPI component schemas for `@nestjs/swagger` (one schema, no duplication).
 */
export class PingResponseDto extends createZodDto(PingResponseSchema) {}
export class GetOrganizationResponseDto extends createZodDto(
  GetOrganizationResponseSchema,
) {}
export class JournalResponseDto extends createZodDto(JournalResponseSchema) {}
export class LedgerResponseDto extends createZodDto(LedgerResponseSchema) {}
export class OpenItemsResponseDto extends createZodDto(
  OpenItemsResponseSchema,
) {}
export class SaldokontoResponseDto extends createZodDto(
  SaldokontoResponseSchema,
) {}
