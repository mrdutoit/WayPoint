import pg from 'pg';
import { config } from '../config.js';

const { Pool, types } = pg;

// Postgres DATE columns (OID 1082 — okr.cycle.start_date/end_date are
// the only ones in this schema) come back from `pg` as JS Date objects
// by default, which then serialise through res.json() as a full ISO
// datetime ("2026-09-30T00:00:00.000Z") rather than the plain
// 'YYYY-MM-DD' every date-handling function in this app actually
// expects (dateMath.js, cycleService.js's EXCLUDE-constraint-backed
// range logic, the Cycles table display). Registering this parser
// keeps a DATE column a plain string end to end, matching what was
// always assumed rather than what `pg` defaults to.
types.setTypeParser(1082, (val) => val);

export const pool = new Pool({
  connectionString: config.databaseUrl,
  // Managed Postgres providers (Neon/Supabase) require SSL; Vercel
  // Functions are short-lived so keep the pool small.
  max: 5,
  ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});
