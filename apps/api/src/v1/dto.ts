import { createZodDto } from "nestjs-zod"
import {
  ControlStatementResponseSchema,
  DphResponseSchema,
  DppoResponseSchema,
  EcSalesListResponseSchema,
  FinancialStatementsResponseSchema,
  GetOrganizationResponseSchema,
  JournalResponseSchema,
  LedgerResponseSchema,
  OpenItemsResponseSchema,
  PingResponseSchema,
  SaldokontoResponseSchema,
  StatementLayoutResponseSchema,
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
export class DphResponseDto extends createZodDto(DphResponseSchema) {}
export class DppoResponseDto extends createZodDto(DppoResponseSchema) {}
export class EcSalesListResponseDto extends createZodDto(
  EcSalesListResponseSchema,
) {}
export class ControlStatementResponseDto extends createZodDto(
  ControlStatementResponseSchema,
) {}
export class FinancialStatementsResponseDto extends createZodDto(
  FinancialStatementsResponseSchema,
) {}
export class StatementLayoutResponseDto extends createZodDto(
  StatementLayoutResponseSchema,
) {}
