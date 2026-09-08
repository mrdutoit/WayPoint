import { pool } from '../api-lib/services/db.js';

// GET /api/health — used by uptime monitoring and the deployment smoke
// test. Checks the database is actually reachable, not just that the
// function invoked successfully.
export default async function handler(req, res) {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'reachable' });
  } catch (err) {
    console.error('Health check failed — database unreachable', err);
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
}
