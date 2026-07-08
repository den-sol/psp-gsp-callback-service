# Design decisions & trade-offs

## Opaque session tokens, not JWT

The task's data model lists a `sessions` table and never mentions JWT — so
sessions are server-side state: login generates 32 random bytes, returns them
as the bearer token, and stores only the SHA-256 hash (`sessions.token_hash`,
unique). The `AuthGuard` hashes the presented token and loads the matching
non-expired, non-revoked row.

- **Why not JWT:** stateless JWTs can't be revoked without extra
  infrastructure (denylist/short TTL + refresh flow). With a sessions table,
  logout is a single `revoked_at` update and takes effect immediately — which
  the tenant-leakage test asserts. For a payments-adjacent service, immediate
  revocation is worth one indexed DB read per request.
- **Hashing at rest** means a leaked DB dump contains no usable tokens.
- **Trade-off:** every authenticated request costs a DB lookup. Fine at this
  scale; a cache would be the first optimization if needed.

## TypeORM over Prisma

Both would work. TypeORM was chosen because:

- Hand-written SQL migrations keep the dedupe-critical unique constraints
  (`uq_idempotency_brand_scope_key`, `uq_users_brand_email`) explicit and
  reviewable rather than generated.
- Unique-violation handling (`SQLSTATE 23505`) is the backbone of both
  duplicate registration (409) and callback dedupe; TypeORM surfaces driver
  errors directly, and `isUniqueViolation()` wraps that in one place.
- No codegen step; entities are plain decorated classes, which keeps the
  Nest DI story simple.

**Trade-off:** Prisma has nicer type-safety for query results; TypeORM's
`QueryDeepPartialEntity` needed a couple of casts around `jsonb` columns.

## Tenancy model

- `brandId` is a **column on every table** plus composite unique
  constraints/indexes — not separate schemas or databases. Right-sized for an
  MVP; row-level security or schema-per-tenant are later options behind the
  same repository seams.
- **Identity requests derive the brand from the session row**
  (`req.user.brandId`), never from client input. `/profile/me` looks up
  `(userId, brandId)` — a session can only ever see its own brand.
- **Webhooks carry no session**, so tenant context comes from the
  `X-Brand-Id` header, validated by `BrandContextGuard` against the
  `KNOWN_BRANDS` env list before anything touches storage. Env config stands
  in for a real brands table/registry — deliberate MVP scope.
- **Trade-off / deferred:** provider authenticity (HMAC signature
  verification per provider) is not implemented; the brand header is trusted
  after the allow-list check. Signature verification would slot into the
  webhook controllers as a guard, per provider.

## Outbox (`raw_events`) and the no-balance-mutation boundary

Callbacks are **only persisted**, never interpreted: the PSP/GSP adapters call
`EventIngestService`, which writes the verbatim payload to `raw_events` with
`status: received` and a `// TODO: ledger` marking where a future consumer
plugs in. This is an outbox in spirit: ingestion is decoupled from processing,
so the ledger can be added later — replaying `received` rows — without
touching the webhook path. No code in `webhooks/` or `identity/` can write
balances because no such tables or services exist; the boundary is structural,
not a convention.

## Idempotency via unique constraint (not SELECT-then-INSERT)

The dedupe key is reserved by **inserting** into `idempotency_keys` with a
unique `(brand_id, scope, key)` constraint, inside the same transaction as the
`raw_events` write. A duplicate — including two concurrent deliveries of the
same event — hits the constraint, rolls back atomically, and replays the
stored response (`200`, `deduplicated: true`, original `eventId`).

- **Why not check-then-insert:** it races. Two concurrent duplicates both pass
  the check and both insert. The unique constraint makes Postgres the
  arbiter; exactly one transaction wins.
- **Key derivation:** explicit `Idempotency-Key` header wins, else the
  provider's event id (`payload.id`, then `payload.event_id`). No derivable
  key → 400, because accepting an event we can't dedupe would silently break
  the safety guarantee.
- **Scope is `webhook:<source>:<provider>`**, so stripe and adyen (or a PSP
  and a GSP) can emit colliding event ids without cross-talk — and the brand
  column keeps tenants fully separate.
- **Payload mismatch → 409:** a request hash (SHA-256 over a key-order-stable
  serialization) is stored with each key. Reusing a key with a *different*
  payload is a client bug or attack, and replaying the old response would be
  silently wrong.
- **Trade-off:** the replayed response body is stored as `jsonb` per key —
  slight write amplification, but it makes replay exact and self-contained.

## Structured errors & observability

One global exception filter renders every error as
`{ statusCode, error, message, correlationId, timestamp, path }`; 5xx bodies
never leak internals (the stack goes to logs only). The correlation id — from
`X-Correlation-Id` or generated — flows through an `AsyncLocalStorage` context
into every JSON log line, the response header, and each `raw_events` row, so a
provider's delivery can be traced end-to-end.

## Deferred (deliberately out of MVP scope)

- **Ledger consumer** — process `raw_events` (`received` → `processed`); the
  schema and status field anticipate it.
- **Webhook signature verification** per provider (HMAC).
- **Rate limiting / retry-after semantics** on the webhook endpoints.
- **Session cache** in front of the sessions table.
- **Brand registry table** instead of the `KNOWN_BRANDS` env list.
- **Postgres row-level security** as defense-in-depth for tenancy.
