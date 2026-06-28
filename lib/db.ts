import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Missing DATABASE_URL environment variable');
}

const pool = new Pool({
  connectionString,
  // If your provider requires SSL, uncomment the next line
  // ssl: { rejectUnauthorized: false },
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}
