import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { BrandContextGuard } from './brand-context.guard';
import { BrandId } from './brand-id.decorator';
import { EventIngestService, IngestResult } from './event-ingest.service';
import { ProviderParamPipe } from './provider-param.pipe';

/**
 * PSP callback stub: persist + dedupe only, no balance mutation. First
 * receipt → 202 `{ eventId, deduplicated: false }`; duplicate → 200 with
 * `deduplicated: true`.
 */
@Controller('webhooks/psp')
@UseGuards(BrandContextGuard)
export class PspWebhookController {
  constructor(private readonly ingest: EventIngestService) {}

  @Post(':provider')
  async handle(
    @Param('provider', ProviderParamPipe) provider: string,
    @BrandId() brandId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() payload: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IngestResult['body']> {
    const result = await this.ingest.ingest({
      brandId,
      source: 'psp',
      provider,
      payload,
      headerKey: idempotencyKey,
    });
    res.status(result.status);
    return result.body;
  }
}
