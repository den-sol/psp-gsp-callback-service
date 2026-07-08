/** Postgres SQLSTATE for a unique-constraint violation. */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * True for a Postgres unique-constraint violation; TypeORM sometimes exposes
 * the code only via `driverError`, so both are checked.
 */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return (
    e?.code === PG_UNIQUE_VIOLATION ||
    e?.driverError?.code === PG_UNIQUE_VIOLATION
  );
}
