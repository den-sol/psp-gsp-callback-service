import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from '../persistence/entities/idempotency-key.entity';
import { RawEvent } from '../persistence/entities/raw-event.entity';
import { BrandContextGuard } from './brand-context.guard';
import { EventIngestService } from './event-ingest.service';
import { GspWebhookController } from './gsp-webhook.controller';
import { IdempotencyService } from './idempotency.service';
import { PspWebhookController } from './psp-webhook.controller';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKey, RawEvent])],
  controllers: [PspWebhookController, GspWebhookController],
  providers: [EventIngestService, IdempotencyService, BrandContextGuard],
})
export class WebhooksModule {}
