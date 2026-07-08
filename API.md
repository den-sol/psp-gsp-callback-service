# API

Base URL: `http://localhost:3000`. Interactive docs: [`/docs`](http://localhost:3000/docs).

All error responses share one structured shape (produced by the global
exception filter), always including the request's correlation id:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["email must be an email"],
  "correlationId": "d1f9c2a4-6e0b-4d0e-9d3a-1c2b3a4d5e6f",
  "timestamp": "2026-07-08T12:00:00.000Z",
  "path": "/auth/register"
}
```

`message` is a string for most errors and an array of field details for
validation failures. Send an `X-Correlation-Id` header to have your own id
adopted and echoed back; otherwise one is generated.

---

## Identity

### POST /auth/register

Registers a user under a brand. Same email may exist under different brands.

```bash
curl -s -X POST localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"brandId":"brand-a","email":"alice@example.com","password":"sup3rsecret"}'
```

`201 Created`:

```json
{
  "id": "7d8a2f7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f",
  "brandId": "brand-a",
  "email": "alice@example.com",
  "createdAt": "2026-07-08T12:00:00.000Z"
}
```

`409 Conflict` when the `(brandId, email)` pair already exists:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "A user with this email already exists for this brand",
  "correlationId": "…",
  "timestamp": "…",
  "path": "/auth/register"
}
```

`400 Bad Request` on validation failure (password < 8 chars, invalid email, …).

### POST /auth/login

Verifies credentials and issues an **opaque session token** (random bytes;
only its SHA-256 is stored server-side). Wrong email and wrong password return
the same generic 401 — no user enumeration.

```bash
curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"brandId":"brand-a","email":"alice@example.com","password":"sup3rsecret"}'
```

`200 OK`:

```json
{ "accessToken": "sBeLtCzE9KNKq7A7GVlaAJx14wUtIFJQQKHj1UdWqug" }
```

`401 Unauthorized`: `{ "statusCode": 401, "error": "Unauthorized", "message": "Invalid credentials", … }`

### GET /profile/me

Returns the current user, scoped by the **session's** brand — the client never
supplies `brandId` here.

```bash
curl -s localhost:3000/profile/me \
  -H "Authorization: Bearer $TOKEN"
```

`200 OK`:

```json
{
  "id": "7d8a2f7e-1a2b-4c3d-9e8f-0a1b2c3d4e5f",
  "brandId": "brand-a",
  "email": "alice@example.com",
  "createdAt": "2026-07-08T12:00:00.000Z"
}
```

`401 Unauthorized` for a missing, invalid, expired, or revoked token.

### POST /auth/logout

Revokes the current session. `204 No Content`; the token stops working
immediately.

```bash
curl -s -X POST localhost:3000/auth/logout \
  -H "Authorization: Bearer $TOKEN" -i
```

---

## Webhooks

`POST /webhooks/psp/:provider` and `POST /webhooks/gsp/:provider` behave
identically (shared ingest pipeline); they differ only in `source`, which also
separates their dedupe scopes.

Headers:

| Header            | Required | Meaning                                                        |
| ----------------- | -------- | -------------------------------------------------------------- |
| `X-Brand-Id`      | yes      | Tenant; must be in the configured `KNOWN_BRANDS` list           |
| `Idempotency-Key` | no       | Dedupe key override; otherwise `payload.id` / `payload.event_id` is used |

The payload may be **any JSON object** — it is persisted verbatim to
`raw_events` for later ledger processing. No balances are touched.

### First receipt

```bash
curl -s -X POST localhost:3000/webhooks/psp/stripe \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: brand-a' \
  -d '{"id":"evt-1001","type":"payment.settled","amount":100,"currency":"EUR"}'
```

`202 Accepted`:

```json
{ "eventId": "865b8a5a-5672-46cf-a134-c7cd629a4738", "deduplicated": false }
```

### Duplicate (same key, same payload)

Re-run the exact same request. `200 OK` — the stored response is replayed with
the **same** `eventId`; no second `raw_events` row is written:

```json
{ "eventId": "865b8a5a-5672-46cf-a134-c7cd629a4738", "deduplicated": true }
```

Dedupe is scoped per `(brand, source, provider)`: the same event id under a
different brand — or arriving via `gsp` instead of `psp` — is a new event.

### Error cases

Key reused with a **different payload** — `409 Conflict`:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Idempotency key was already used with a different payload",
  "correlationId": "…",
  "timestamp": "…",
  "path": "/webhooks/psp/stripe"
}
```

No derivable idempotency key (no header, no `id`/`event_id` field) — `400`:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Cannot derive an idempotency key: send an Idempotency-Key header or include an \"id\" / \"event_id\" field in the payload",
  "correlationId": "…",
  "timestamp": "…",
  "path": "/webhooks/psp/stripe"
}
```

Other rejections:

| Condition                                   | Status |
| ------------------------------------------- | ------ |
| Missing `X-Brand-Id` header                 | 400    |
| Brand not in `KNOWN_BRANDS`                 | 403    |
| Payload is not a JSON object (array, string…) | 400  |
| Invalid `:provider` slug (not `[a-z0-9_-]`, ≤64 chars) | 400 |

### GSP example

```bash
curl -s -X POST localhost:3000/webhooks/gsp/evolution \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: brand-a' \
  -d '{"event_id":"rnd-2002","type":"round.completed","round_id":77,"win":40}'
```

Responses are identical in shape to the PSP endpoint.
