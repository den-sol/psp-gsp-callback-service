Assignment: Backend Engineer
Goal
Build a small backend service that demonstrates:
identity basics;
safe PSP/GSP callback handling;
readiness for future ledger integration.
Suggested effort: 4-8 hours.
What to Build
Use NestJS + TypeScript (preferred).
Implement modules/endpoints:
identity
POST /auth/register
POST /auth/login
GET /profile/me
psp-callback-stub
POST /webhooks/psp/:provider
gsp-callback-stub
POST /webhooks/gsp/:provider
Mandatory Requirements
Save callback events to raw_events (or outbox-like table);
idempotency for repeated callbacks;
tenant isolation (brandId);
no direct balance updates in PSP/GSP adapters.
structured error responses with clear status codes.
Minimal data model:
users
sessions
raw_events
idempotency_keys
Tests
at least 1 unit test for use-case/business logic;
integration test for callback idempotency;
tenant leakage test (brandA cannot access brandB data).
Non-Functional Expectations
clear module boundaries (identity, callbacks, persistence);
basic observability hooks (at least request/correlation id in logs);
deterministic local run flow (single command if possible).
Expected Deliverables
repository with setup/run instructions;
API.md with request examples;
DECISIONS.md with design choices and trade-offs.
Acceptance Criteria
duplicate callbacks are safely ignored or deduplicated;
callback payload is persisted for later processing;
tenant context is validated and applied in storage queries;
project can be run and tested by reviewer from README only.
Nice to Have
OpenAPI spec generation;
docker-compose for app + database;
contract test for webhook payload schema.
Evaluation
API/module boundaries;
reliability of callback handling;
multi-tenant discipline;
practicality for MVP delivery.

