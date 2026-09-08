import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  // Managed Postgres providers (Neon/Supabase) require SSL; Vercel
  // Functions are short-lived so keep the pool small.
  max: 5,
  ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});
