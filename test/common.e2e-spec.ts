/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppLogger } from '../src/common/app-logger.service';
import { CommonModule } from '../src/common/common.module';
import { correlationIdMiddleware } from '../src/common/correlation-id.middleware';

@Controller()
class ProbeController {
  @Get('ok')
  ok() {
    return { ok: true };
  }

  @Get('http-error')
  httpError() {
    throw new BadRequestException(['email must be an email']);
  }

  @Get('crash')
  crash() {
    throw new Error('boom - internal detail that must not leak');
  }
}

describe('common (correlation id + exception filter + logger)', () => {
  let app: INestApplication;
  let stderr: string[];
  let restoreStderr: () => void;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(AppLogger));
    app.use(correlationIdMiddleware);
    await app.init();

    // Capture structured log lines (error/warn go to stderr).
    stderr = [];
    const original = process.stderr.write.bind(process.stderr);
    const spy = (chunk: any, ...rest: any[]): boolean => {
      stderr.push(String(chunk));
      return original(chunk, ...rest);
    };
    (process.stderr.write as unknown) = spy;
    restoreStderr = () => {
      (process.stderr.write as unknown) = original;
    };
  });

  afterAll(async () => {
    restoreStderr?.();
    await app.close();
  });

  it('generates a correlation id and echoes it in the response header', async () => {
    const res = await request(app.getHttpServer()).get('/ok').expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-correlation-id']).toMatch(/[0-9a-f-]{36}/);
  });

  it('adopts an inbound correlation id', async () => {
    const res = await request(app.getHttpServer())
      .get('/ok')
      .set('X-Correlation-Id', 'given-123')
      .expect(200);
    expect(res.headers['x-correlation-id']).toBe('given-123');
  });

  it('renders HttpException as a structured, correlated body (4xx keeps field details)', async () => {
    const res = await request(app.getHttpServer())
      .get('/http-error')
      .set('X-Correlation-Id', 'corr-400')
      .expect(400);
    expect(res.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: ['email must be an email'],
      correlationId: 'corr-400',
      timestamp: expect.any(String),
      path: '/http-error',
    });
    // The 4xx was logged (as warn) with the same correlation id.
    expect(stderr.some((l) => l.includes('corr-400'))).toBe(true);
  });

  it('maps unexpected errors to 500 without leaking internals', async () => {
    const res = await request(app.getHttpServer())
      .get('/crash')
      .set('X-Correlation-Id', 'corr-500')
      .expect(500);
    expect(res.body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      correlationId: 'corr-500',
      path: '/crash',
    });
    expect(JSON.stringify(res.body)).not.toContain('boom');
    expect(stderr.some((l) => l.includes('corr-500'))).toBe(true);
  });
});
