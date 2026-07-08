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
 * GSP callback stub — same persist-and-dedupe contract as the PSP adapter,
 * distinguished only by `source: 'gsp'` (and therefore its own dedupe scope).
 */
@Controller('webhooks/gsp')
@UseGuards(BrandContextGuard)
export class GspWebhookController {
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
      source: 'gsp',
      provider,
      payload,
      headerKey: idempotencyKey,
    });
    res.status(result.status);
    return result.body;
  }
}
