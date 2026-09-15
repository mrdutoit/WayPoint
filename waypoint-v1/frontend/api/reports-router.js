import { getAuthenticatedUser } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext } from '../api-lib/context/tenant.js';
import { getScorecard, getTeamProgress, getAlignmentMap, getCheckinCompliance } from '../api-lib/services/reportingService.js';
import { parseSlug } from '../api-lib/http/helpers.js';

// No CORS opening — same-origin frontend calls only.
// Read-only — no audit events recorded (viewing a report is not one of
// FR-007's "significant actions"; only the exports FR-030 will add
// later are).

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });
  if (!user.tenantId) return res.status(403).json({ error: 'Reports are tenant-scoped — not available to Platform Administrator' });
  if (req.method !== 'GET') return res.status(404).json({ error: 'Not found' });

  const slugParts = parseSlug(req.query.slug);
  const [report, target] = slugParts;

  try {
    if (report === 'team-progress' && !target) return await teamProgressAction(req, res, user);
    if (report === 'alignment-map' && !target) return await alignmentMapAction(req, res, user);
    if (report === 'checkin-compliance' && !target) return await checkinComplianceAction(req, res, user);
    if (report === 'scorecard' && target) return await scorecardAction(req, res, user, target);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

// GET /api/reports/scorecard/:userId — Self, Manager (own direct reports only), Tenant Administrator.
async function scorecardAction(req, res, user, userId) {
  const result = await withTenantContext(user.tenantId, (client) => getScorecard(client, user.tenantId, user, userId));
  res.status(200).json(result);
}

// GET /api/reports/team-progress — Manager.
async function teamProgressAction(req, res, user) {
  const result = await withTenantContext(user.tenantId, (client) => getTeamProgress(client, user.tenantId, user));
  res.status(200).json(result);
}

// GET /api/reports/alignment-map — Tenant Administrator.
async function alignmentMapAction(req, res, user) {
  const result = await withTenantContext(user.tenantId, (client) => getAlignmentMap(client, user.tenantId, user));
  res.status(200).json(result);
}

// GET /api/reports/checkin-compliance — Tenant Administrator.
async function checkinComplianceAction(req, res, user) {
  const result = await withTenantContext(user.tenantId, (client) => getCheckinCompliance(client, user.tenantId, user));
  res.status(200).json(result);
}
