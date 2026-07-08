/** Postgres SQLSTATE for a unique-constraint violation. */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * True when `err` is a Postgres unique-constraint violation. TypeORM wraps
 * driver errors in `QueryFailedError`, which copies `code` but sometimes only
 * exposes it via `driverError`, so we check both.
 */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return (
    e?.code === PG_UNIQUE_VIOLATION ||
    e?.driverError?.code === PG_UNIQUE_VIOLATION
  );
}
