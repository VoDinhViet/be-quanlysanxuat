import postgres from 'postgres';

/**
 * Drizzle bọc lỗi driver gốc vào `DrizzleQueryError` (`error.cause`) — `error instanceof
 * postgres.PostgresError` luôn false trên exception ném từ insert/update/delete/select. Bóc
 * `.cause` mới lấy được lỗi Postgres thật để đọc `.code`/`.detail`.
 */
export function extractPostgresError(
  error: unknown,
): postgres.PostgresError | undefined {
  if (error instanceof postgres.PostgresError) {
    return error;
  }
  if (error instanceof Error && error.cause instanceof postgres.PostgresError) {
    return error.cause;
  }
  return undefined;
}
