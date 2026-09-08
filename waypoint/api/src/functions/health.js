import { pool } from '../db.js';

/**
 * GET /api/health — used by uptime monitoring and the deployment smoke
 * test. Checks the database is actually reachable, not just that the
 * process is running — a process that's "up" but can't reach its database
 * is not healthy.
 */
export async function healthHandler(req, res) {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'reachable' });
  } catch (err) {
    req.log?.error({ err }, 'Health check failed — database unreachable');
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
}
