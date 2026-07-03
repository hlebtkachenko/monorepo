import { createZodDto } from "nestjs-zod"
import {
  CaptureAccountingDocumentRequestSchema,
  CaptureAccountingDocumentResponseSchema,
  ClassifyEventRequestSchema,
  ClassifyEventResponseSchema,
  ControlStatementResponseSchema,
  CreateAccountingEventRequestSchema,
  CreateAccountingEventResponseSchema,
  CreateAccountingPostingRequestSchema,
  CreateAccountingPostingResponseSchema,
  DphResponseSchema,
  DppoResponseSchema,
  EcSalesListResponseSchema,
  FinancialStatementsResponseSchema,
  GetOrganizationResponseSchema,
  JournalResponseSchema,
  LedgerResponseSchema,
  ListHeldWritesResponseSchema,
  OpenItemsResponseSchema,
  NumberSeriesListResponseSchema,
  PingResponseSchema,
  ResolveHeldWriteRequestSchema,
  ResolveHeldWriteResponseSchema,
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
export class ClassifyEventRequestDto extends createZodDto(
  ClassifyEventRequestSchema,
) {}
export class ClassifyEventResponseDto extends createZodDto(
  ClassifyEventResponseSchema,
) {}
export class NumberSeriesListResponseDto extends createZodDto(
  NumberSeriesListResponseSchema,
) {}
export class CreateAccountingEventRequestDto extends createZodDto(
  CreateAccountingEventRequestSchema,
) {}
export class CreateAccountingEventResponseDto extends createZodDto(
  CreateAccountingEventResponseSchema,
) {}
export class CaptureAccountingDocumentRequestDto extends createZodDto(
  CaptureAccountingDocumentRequestSchema,
) {}
export class CaptureAccountingDocumentResponseDto extends createZodDto(
  CaptureAccountingDocumentResponseSchema,
) {}
export class CreateAccountingPostingRequestDto extends createZodDto(
  CreateAccountingPostingRequestSchema,
) {}
export class CreateAccountingPostingResponseDto extends createZodDto(
  CreateAccountingPostingResponseSchema,
) {}
export class ListHeldWritesResponseDto extends createZodDto(
  ListHeldWritesResponseSchema,
) {}
export class ResolveHeldWriteRequestDto extends createZodDto(
  ResolveHeldWriteRequestSchema,
) {}
export class ResolveHeldWriteResponseDto extends createZodDto(
  ResolveHeldWriteResponseSchema,
) {}
