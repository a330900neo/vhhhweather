import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Missing DATABASE_URL environment variable');
}

// Enable SSL when PGSSLMODE is set to 'require' in environment (recommended for Supabase).
// This uses rejectUnauthorized: false to avoid certificate verification issues in some hosts.
// Prefer setting PGSSLMODE=require in your environment rather than hardcoding credentials.
const useSsl = process.env.PGSSLMODE === 'require';

const pool = new Pool({
  connectionString,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}
