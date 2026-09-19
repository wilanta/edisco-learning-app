import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export function createDatabase(connectionString: string) {
  if (
    !URL.canParse(connectionString) ||
    !['postgres:', 'postgresql:'].includes(new URL(connectionString).protocol)
  ) {
    throw new Error('A valid PostgreSQL DATABASE_URL is required');
  }
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
  });
  return { db: drizzle(pool, { schema }), pool };
}
