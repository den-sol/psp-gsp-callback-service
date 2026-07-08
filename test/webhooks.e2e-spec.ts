/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppLogger } from '../src/common/app-logger.service';
import { correlationIdMiddleware } from '../src/common/correlation-id.middleware';
import { AppModule } from '../src/app.module';
import { RawEvent } from '../src/persistence/entities/raw-event.entity';

/**
 * Callback idempotency integration test (requires the docker-compose `db`).
 * Core acceptance criterion: the same PSP callback POSTed twice produces
 * exactly one raw_events row, and the repeat is flagged `deduplicated: true`.
 */
describe('webhooks (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(AppLogger));
    app.use(correlationIdMiddleware);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
    await dataSource.runMigrations();
    await dataSource.query('DELETE FROM "idempotency_keys"');
    await dataSource.query('DELETE FROM "raw_events"');
  });

  afterAll(async () => {
    await app.close();
  });

  function pspCallback(payload: object, brand = 'brand-a') {
    return request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('X-Brand-Id', brand)
      .send(payload);
  }

  it('persists a first-time callback as one raw_events row and returns 202', async () => {
    const payload = {
      id: 'evt-dup-1',
      type: 'payment.settled',
      amount: 100,
      currency: 'EUR',
    };

    const res = await pspCallback(payload)
      .set('X-Correlation-Id', 'corr-webhook-1')
      .expect(202);
    expect(res.body).toEqual({
      eventId: expect.stringMatching(/[0-9a-f-]{36}/),
      deduplicated: false,
    });

    const rows = await dataSource.getRepository(RawEvent).find({
      where: { idempotencyKey: 'evt-dup-1' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: res.body.eventId,
      brandId: 'brand-a',
      source: 'psp',
      provider: 'stripe',
      eventType: 'payment.settled',
      status: 'received',
      correlationId: 'corr-webhook-1',
      payload,
    });
  });

  it('deduplicates the identical repeat: 200, deduplicated: true, still one row', async () => {
    const payload = {
      id: 'evt-dup-1',
      type: 'payment.settled',
      amount: 100,
      currency: 'EUR',
    };

    const first = await pspCallback(payload).expect(200);
    expect(first.body.deduplicated).toBe(true);

    // Replays the original event id, does not mint a new one.
    const rows = await dataSource.getRepository(RawEvent).find({
      where: { idempotencyKey: 'evt-dup-1' },
    });
    expect(rows).toHaveLength(1);
    expect(first.body.eventId).toBe(rows[0].id);
  });

  it('rejects reuse of a key with a different payload (409)', async () => {
    await pspCallback({
      id: 'evt-dup-1',
      type: 'payment.settled',
      amount: 999,
    }).expect(409);
  });

  it('prefers the Idempotency-Key header over the payload id', async () => {
    await pspCallback({ id: 'evt-h1', amount: 1 })
      .set('Idempotency-Key', 'header-key-A')
      .expect(202);

    // Same header key + same payload but a different payload id → dedupe hit.
    const res = await pspCallback({ id: 'evt-h1', amount: 1 })
      .set('Idempotency-Key', 'header-key-A')
      .expect(200);
    expect(res.body.deduplicated).toBe(true);
  });

  it('scopes dedupe per brand: same event id under another brand is a new event', async () => {
    const payload = { id: 'evt-cross-brand', type: 'payment.settled' };
    await pspCallback(payload, 'brand-a').expect(202);
    const res = await pspCallback(payload, 'brand-b').expect(202);
    expect(res.body.deduplicated).toBe(false);

    const rows = await dataSource.getRepository(RawEvent).find({
      where: { idempotencyKey: 'evt-cross-brand' },
    });
    expect(rows.map((r) => r.brandId).sort()).toEqual(['brand-a', 'brand-b']);
  });

  it('scopes dedupe per source: gsp accepts the id already used for psp', async () => {
    const payload = { id: 'evt-cross-source', type: 'round.completed' };
    await pspCallback(payload).expect(202);

    const res = await request(app.getHttpServer())
      .post('/webhooks/gsp/evolution')
      .set('X-Brand-Id', 'brand-a')
      .send(payload)
      .expect(202);
    expect(res.body.deduplicated).toBe(false);
  });

  it('400s when no idempotency key can be derived, with a structured error', async () => {
    const res = await pspCallback({ type: 'payment.settled', amount: 5 })
      .set('X-Correlation-Id', 'corr-no-key')
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      correlationId: 'corr-no-key',
      path: '/webhooks/psp/stripe',
    });
  });

  it('400s when the X-Brand-Id header is missing', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .send({ id: 'evt-no-brand' })
      .expect(400);
  });

  it('403s for a brand not in the configured list', async () => {
    await pspCallback({ id: 'evt-bad-brand' }, 'brand-evil').expect(403);
  });

  it('400s for an invalid provider slug', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/psp/not%20a%20provider!')
      .set('X-Brand-Id', 'brand-a')
      .send({ id: 'evt-bad-provider' })
      .expect(400);
  });
});
