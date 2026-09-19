import type { createDatabase } from '@edisco/database';
import { lessons } from '@edisco/database/schema';
import { sql } from 'drizzle-orm';

type Database = ReturnType<typeof createDatabase>['db'];

/**
 * Flags lessons as expired for reuse if their expiresAt timestamp has passed.
 * This does not delete the lessons, allowing owners to retain access.
 * Idempotent: can be run repeatedly without causing duplicate side effects.
 */
export async function expireLessons(db: Database) {
  const result = await db
    .update(lessons)
    .set({
      isExpiredForReuse: true,
    })
    .where(
      sql`${lessons.isExpiredForReuse} = false AND ${lessons.expiresAt} < clock_timestamp()`,
    );
  return { updated: result.rowCount };
}
