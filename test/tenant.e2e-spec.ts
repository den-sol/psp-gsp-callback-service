/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppLogger } from '../src/common/app-logger.service';
import { correlationIdMiddleware } from '../src/common/correlation-id.middleware';
import { AppModule } from '../src/app.module';
import { RawEvent } from '../src/persistence/entities/raw-event.entity';

/**
 * Tenant-leakage test (requires the docker-compose `db`): brand A credentials,
 * sessions, and callback data must never be readable through brand B — even
 * when both brands share the same user email.
 */
describe('tenant isolation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const EMAIL = 'alice@example.com';
  const PASSWORD_A = 'brand-a-password';
  const PASSWORD_B = 'brand-b-password';
  let userIdA: string;
  let userIdB: string;
  let tokenA: string;

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
    await dataSource.query('DELETE FROM "sessions"');
    await dataSource.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    await app.close();
  });

  function api() {
    return request(app.getHttpServer());
  }

  it('registers the same email under two brands as two distinct users', async () => {
    const resA = await api()
      .post('/auth/register')
      .send({ brandId: 'brand-a', email: EMAIL, password: PASSWORD_A })
      .expect(201);
    const resB = await api()
      .post('/auth/register')
      .send({ brandId: 'brand-b', email: EMAIL, password: PASSWORD_B })
      .expect(201);

    userIdA = resA.body.id;
    userIdB = resB.body.id;
    expect(userIdA).not.toBe(userIdB);

    // But the same (brand, email) pair conflicts.
    await api()
      .post('/auth/register')
      .send({ brandId: 'brand-a', email: EMAIL, password: 'x'.repeat(10) })
      .expect(409);
  });

  it("rejects brand A's password when logging into brand B (401)", async () => {
    await api()
      .post('/auth/login')
      .send({ brandId: 'brand-b', email: EMAIL, password: PASSWORD_A })
      .expect(401);
  });

  it("brand A's token resolves only brand A's profile, never brand B's", async () => {
    const login = await api()
      .post('/auth/login')
      .send({ brandId: 'brand-a', email: EMAIL, password: PASSWORD_A })
      .expect(200);
    tokenA = login.body.accessToken;

    const me = await api()
      .get('/profile/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(me.body).toMatchObject({
      id: userIdA,
      brandId: 'brand-a',
      email: EMAIL,
    });
    expect(me.body.id).not.toBe(userIdB);
  });

  it('a brand-a session cannot reach the brand-b user even if that user id is targeted (404)', async () => {
    // Simulate a cross-tenant probe: point the brand-a session at the brand-b
    // user id. The brand-scoped lookup must miss, not leak.
    await dataSource.query(
      'UPDATE "sessions" SET "user_id" = $1 WHERE "brand_id" = $2',
      [userIdB, 'brand-a'],
    );
    await api()
      .get('/profile/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    // Restore for the following tests.
    await dataSource.query(
      'UPDATE "sessions" SET "user_id" = $1 WHERE "brand_id" = $2',
      [userIdA, 'brand-a'],
    );
  });

  it("brand B's callbacks are invisible to brand-a-scoped raw_events queries", async () => {
    await api()
      .post('/webhooks/psp/stripe')
      .set('X-Brand-Id', 'brand-b')
      .send({ id: 'tenant-evt-b', type: 'payment.settled', amount: 7 })
      .expect(202);

    // Every storage read is brand-scoped; a brand-a query must not see it.
    const repo = dataSource.getRepository(RawEvent);
    const brandAView = await repo.find({
      where: { brandId: 'brand-a', idempotencyKey: 'tenant-evt-b' },
    });
    expect(brandAView).toHaveLength(0);
    const brandBView = await repo.find({
      where: { brandId: 'brand-b', idempotencyKey: 'tenant-evt-b' },
    });
    expect(brandBView).toHaveLength(1);
  });

  it("brand B's idempotency state does not leak into brand A's dedupe path", async () => {
    // Same event id as brand B's callback above: brand A must get a fresh
    // event (202), not a replay of brand B's stored response.
    const res = await api()
      .post('/webhooks/psp/stripe')
      .set('X-Brand-Id', 'brand-a')
      .send({ id: 'tenant-evt-b', type: 'payment.settled', amount: 7 })
      .expect(202);
    expect(res.body.deduplicated).toBe(false);
  });

  it('a revoked (logged-out) session no longer authenticates', async () => {
    await api()
      .post('/auth/logout')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
    await api()
      .get('/profile/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(401);
  });
});
