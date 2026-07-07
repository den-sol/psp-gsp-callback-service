# Plan: PSP/GSP Callback Service (NestJS)

## Context

This is a take-home backend assignment. We build a small NestJS + TypeScript service
demonstrating three things: identity basics (register/login/profile), safe PSP/GSP
callback handling (persist-and-dedupe, never touch balances), and readiness for future
ledger integration (outbox-style `raw_events`). The repo started empty, so everything is
built from scratch.

Key acceptance criteria driving the design:
- Duplicate callbacks are safely deduplicated.
- Callback payloads are persisted for later processing (no direct balance mutation).
- Tenant (`brandId`) context is validated and applied in every storage query.
- Reviewer can run and test entirely from the README.

**Confirmed decisions:** TypeORM + PostgreSQL; auth via **server-side opaque
session tokens** (no JWT — `task.md` lists a `sessions` table and never mentions
JWT); tenant resolved from the session's `brandId` for identity, and per-request
brand context for webhooks.

## Stack

- **NestJS + TypeScript**, **TypeORM** + **PostgreSQL**.
- **argon2** for password hashing; opaque session tokens (random bytes, SHA-256
  hashed at rest) verified by an `AuthGuard` that loads the `sessions` row.
- **@nestjs/swagger** for OpenAPI (`/docs`).
- **Jest** + **supertest** for tests. `docker-compose` for app + db.
- **class-validator / class-transformer** for DTO validation.

## Module boundaries

```
src/
  common/          # correlation-id middleware, global exception filter, structured logger, base types
  persistence/     # TypeORM DataSource config, entities, migrations, brand-scoped repository helpers
  identity/        # auth (register/login/logout) + profile; session-token AuthGuard
  webhooks/        # psp + gsp controllers, shared IdempotencyService + EventIngestService (outbox writer)
  app.module.ts
  main.ts
```

Clear separation: `identity` and `webhooks` never write balances; `webhooks` only calls
`EventIngestService` which writes to `raw_events` (outbox). `persistence` owns all DB access.

## Data model (TypeORM entities + one migration)

- **users**: `id` (uuid pk), `brandId`, `email`, `passwordHash`, `createdAt`.
  Unique constraint on `(brandId, email)` — same email can exist under different brands.
- **sessions**: `id`, `userId`, `brandId`, `tokenHash` (unique — SHA-256 of the
  bearer token), `createdAt`, `expiresAt`, `revokedAt` (nullable).
- **raw_events**: `id`, `brandId`, `source` (`psp`|`gsp`), `provider`, `eventType`,
  `idempotencyKey`, `payload` (jsonb), `status` (`received`|`processed`), `correlationId`, `receivedAt`.
- **idempotency_keys**: `id`, `brandId`, `scope`, `key`, `requestHash`, `responseStatus`,
  `responseBody` (jsonb), `createdAt`. **Unique `(brandId, scope, key)`** — the dedupe backbone.

## Endpoints & behaviour

**Identity**
- `POST /auth/register` — `{ brandId, email, password }` → hash password, insert user
  (409 on `(brandId,email)` conflict). 201.
- `POST /auth/login` — `{ brandId, email, password }` → verify argon2, generate a
  random token, store its SHA-256 as a `sessions` row. Returns `{ accessToken }`
  (the raw token; sent as `Authorization: Bearer <token>`).
- `GET /profile/me` — `AuthGuard` hashes the bearer token, loads the matching
  non-expired/non-revoked `sessions` row, and returns the user **scoped by that
  session's `brandId`** (never client-supplied).
- `POST /auth/logout` — sets `revokedAt` on the current session.

**Webhooks** (`psp` and `gsp` share logic via `EventIngestService`)
- `POST /webhooks/psp/:provider` and `POST /webhooks/gsp/:provider`:
  1. Resolve brand context (from `X-Brand-Id` header, validated against known brands).
  2. Derive idempotency key: `Idempotency-Key` header if present, else provider event id
     from payload (e.g. `payload.id` / `payload.event_id`).
  3. Insert into `idempotency_keys` with the unique constraint. On **conflict → return the
     stored response** (dedupe path, 200) and do NOT re-persist.
  4. On first receipt → write `raw_events` row (`status: received`) inside the same
     transaction, then return `202 Accepted` with `{ eventId, deduplicated: false }`.
  - **No balance updates** — adapters only persist. A `// TODO: ledger` marks the future hook.

## Cross-cutting

- **Correlation id**: middleware reads `X-Correlation-Id` or generates a uuid; stored on the
  request, echoed in the response header, included in every log line and in `raw_events`.
- **Structured errors**: global `HttpExceptionFilter` → `{ statusCode, error, message,
  correlationId, timestamp, path }`. Validation errors map to 400 with field details.
- **Tenant isolation**: brand-scoped repository helper; every identity/query includes
  `brandId`. `AuthGuard` populates `req.user.brandId` from the session row; queries derive
  brand from there, never from client-supplied body.

## Tests (all runnable from README)

- **Unit** (`identity`): register hashes password + rejects duplicate `(brandId,email)`;
  idempotency-key derivation logic. (no DB)
- **Integration** (`test/webhooks.e2e-spec.ts`): POST same PSP callback twice → exactly one
  `raw_events` row; second response flagged `deduplicated: true`.
- **Tenant leakage** (`test/tenant.e2e-spec.ts`): brandA's session token cannot read brandB's profile
  (404/403), and brandA cannot see brandB `raw_events`.

**Test DB strategy:** unit tests need no DB. E2E tests run against a dedicated Postgres from
`docker-compose` (`db` service). Provide `npm run test:e2e` (expects db up) and a convenience
`npm run test:all` that boots the db, migrates, runs unit + e2e. Documented explicitly in README.

## Deliverables

- **README.md** — setup + single-command run (`docker compose up`) + test instructions.
- **API.md** — every endpoint with curl request/response examples incl. dedupe + error shapes.
- **DECISIONS.md** — TypeORM-vs-Prisma, opaque-session-token auth (why not JWT), tenancy, outbox/`raw_events`, idempotency
  via unique constraint, no-balance-mutation boundary, and trade-offs / what's deferred.
- **OpenAPI** at `/docs` (nice-to-have) + `docker-compose.yml` (app + db, nice-to-have).

## Deterministic local run

- `.env.example` committed. `docker compose up` → starts Postgres + app, runs migrations on
  boot (and optional seed of two brands). App on `:3000`, Swagger at `/docs`.
- Local dev without Docker: `docker compose up -d db && npm run migration:run && npm run start:dev`.

## Verification

1. `docker compose up` → hit `/docs`, register + login a user, call `/profile/me` with token.
2. POST a PSP callback twice with the same event id → confirm one `raw_events` row and
   `deduplicated: true` on the repeat.
3. Register users under brandA and brandB → confirm brandA's token cannot read brandB data.
4. `npm run test:all` → all unit + integration + tenant-leakage tests green.
5. Trigger a validation error → confirm structured error body includes `correlationId`.

## Build order

1. Scaffold Nest app, TypeORM config, docker-compose, entities + initial migration.
2. `common` (correlation id, exception filter, logger). **(done)**
3. `identity` (register/login/logout/profile + session-token AuthGuard) + unit test.
4. `webhooks` (idempotency + event ingest, psp/gsp controllers) + integration test.
5. Tenant-leakage test, Swagger, seed.
6. README / API.md / DECISIONS.md.
