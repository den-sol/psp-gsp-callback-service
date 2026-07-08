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

/** GSP callback stub — same contract as PSP, with `source: 'gsp'` and its own dedupe scope. */
@ApiTags('webhooks')
@Controller('webhooks/gsp')
@UseGuards(BrandContextGuard)
export class GspWebhookController {
  constructor(private readonly ingest: EventIngestService) {}

  @Post(':provider')
  @ApiOperation({ summary: 'Ingest a GSP callback (persist + dedupe only)' })
  @ApiParam({ name: 'provider', example: 'evolution' })
  @ApiHeader({ name: 'X-Brand-Id', required: true, example: 'brand-a' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Overrides the event id from the payload as the dedupe key',
  })
  @ApiBody({
    schema: { type: 'object', additionalProperties: true },
    examples: {
      roundCompleted: {
        value: { event_id: 'rnd-2002', type: 'round.completed', win: 40 },
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
      source: 'gsp',
      provider,
      payload,
      headerKey: idempotencyKey,
    });
    res.status(result.status);
    return result.body;
  }
}
