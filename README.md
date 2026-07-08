# PSP/GSP Callback Service

A small NestJS + TypeScript backend demonstrating three things:

1. **Identity basics** — register / login / profile with opaque session tokens (no JWT).
2. **Safe PSP/GSP callback handling** — callbacks are persisted to a `raw_events`
   outbox and deduplicated via a unique constraint; **balances are never mutated**.
3. **Multi-tenant discipline** — every storage query is scoped by `brandId`;
   tenant context comes from the session (identity) or a validated `X-Brand-Id`
   header (webhooks), never from the request body.

See [API.md](API.md) for request examples and [DECISIONS.md](DECISIONS.md) for
design choices and trade-offs.

## Requirements

- Docker + Docker Compose (everything runs in containers), **or**
- Node.js 22+ and a local Postgres for the non-Docker flow.

## Run it (single command)

```bash
docker compose up --build
```

This starts Postgres, runs migrations and an idempotent demo seed, and boots the
app on <http://localhost:3000>. Swagger UI: <http://localhost:3000/docs>
(OpenAPI JSON at `/docs-json`).

Seeded demo users (password `Password123!` for both):

| brandId  | email                |
| -------- | -------------------- |
| brand-a  | demo-a@example.com   |
| brand-b  | demo-b@example.com   |

Quick smoke test:

```bash
# Login with a seeded user
curl -s -X POST localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"brandId":"brand-a","email":"demo-a@example.com","password":"Password123!"}'

# Post the same PSP callback twice — second response is deduplicated
curl -s -X POST localhost:3000/webhooks/psp/stripe -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: brand-a' -d '{"id":"evt-1","type":"payment.settled","amount":100}'
curl -s -X POST localhost:3000/webhooks/psp/stripe -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: brand-a' -d '{"id":"evt-1","type":"payment.settled","amount":100}'
```

## Local development (without the app container)

```bash
cp .env.example .env
docker compose up -d db        # Postgres only
npm ci
npm run migration:run
npm run seed                   # optional demo users
npm run start:dev              # app with watch mode on :3000
```

## Tests

Unit tests need no database. E2E tests (idempotency, tenant isolation) run
against the docker-compose Postgres.

```bash
npm test              # unit tests (no DB)
npm run test:e2e      # e2e tests (expects the db container up + migrated)
npm run test:all      # one command: boots db, migrates, runs unit + e2e
```

What's covered:

- **Unit** — auth business logic (password hashing, duplicate registration,
  no user enumeration on login), idempotency-key derivation, and a contract
  test of the webhook payload schema against known-good/known-bad provider
  fixtures ([webhook-payload.spec.ts](src/webhooks/webhook-payload.spec.ts)).
- **Integration** ([webhooks.e2e-spec.ts](test/webhooks.e2e-spec.ts)) — the same
  callback POSTed twice produces exactly one `raw_events` row; the repeat is
  flagged `deduplicated: true`; key-reuse with a different payload is rejected.
- **Tenant leakage** ([tenant.e2e-spec.ts](test/tenant.e2e-spec.ts)) — brand A's
  token cannot read brand B's data; brand B's callbacks and idempotency state
  are invisible to brand A.

## Project structure

```
src/
  common/          # correlation-id middleware, global exception filter, structured logger
  persistence/     # TypeORM data source, entities, migrations, seed
  identity/        # register/login/logout/profile + session-token AuthGuard
  webhooks/        # psp + gsp controllers, IdempotencyService, EventIngestService (outbox writer)
```

## Configuration

All settings come from environment variables (see [.env.example](.env.example)):

| Variable            | Default               | Purpose                                    |
| ------------------- | --------------------- | ------------------------------------------ |
| `PORT`              | `3000`                | HTTP port                                  |
| `DB_HOST` … `DB_DATABASE` | localhost postgres | Postgres connection                     |
| `SESSION_TTL_HOURS` | `24`                  | Session token lifetime                     |
| `KNOWN_BRANDS`      | `brand-a,brand-b`     | Brands accepted in the `X-Brand-Id` header |

## Observability

Every request gets a correlation id (`X-Correlation-Id` header adopted or
generated), which is echoed in the response header, attached to every log line
(structured JSON), stored on each `raw_events` row, and included in every error
body.
