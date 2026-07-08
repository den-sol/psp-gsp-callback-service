import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { BrandContextGuard } from './brand-context.guard';
import { BrandId } from './brand-id.decorator';
import { EventIngestService, IngestResult } from './event-ingest.service';
import { ProviderParamPipe } from './provider-param.pipe';

/** PSP callback stub: persist + dedupe only — 202 first receipt, 200 on duplicates. */
@ApiTags('webhooks')
@Controller('webhooks/psp')
@UseGuards(BrandContextGuard)
export class PspWebhookController {
  constructor(private readonly ingest: EventIngestService) {}

  @Post(':provider')
  @ApiOperation({ summary: 'Ingest a PSP callback (persist + dedupe only)' })
  @ApiParam({ name: 'provider', example: 'stripe' })
  @ApiHeader({ name: 'X-Brand-Id', required: true, example: 'brand-a' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Overrides the event id from the payload as the dedupe key',
  })
  @ApiBody({
    schema: { type: 'object', additionalProperties: true },
    examples: {
      settled: {
        value: { id: 'evt-1001', type: 'payment.settled', amount: 100 },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'Persisted, deduplicated: false' })
  @ApiResponse({ status: 200, description: 'Duplicate, deduplicated: true' })
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
