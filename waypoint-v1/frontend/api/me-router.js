import { getAuthenticatedUser } from '../api-lib/middleware/auth.js';
import { respondToServiceError } from '../api-lib/middleware/errorResponse.js';
import { withTenantContext, withPlatformContext } from '../api-lib/context/tenant.js';
import { getOwnProfile, updateOwnProfile } from '../api-lib/services/profileService.js';
import { parseSlug } from '../api-lib/http/helpers.js';

// No CORS opening — same-origin frontend calls only.
//
// Works for every role, including PlatformAdmin (who has no tenant) —
// theme and avatar are personal preferences, not tenant-scoped, unlike
// everything in users-router.js.

export default async function handler(req, res) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Missing or invalid authorization token' });

  const slugParts = parseSlug(req.query.slug);
  if (slugParts.length > 0) return res.status(404).json({ error: 'Not found' });

  const runInContext = user.tenantId
    ? (fn) => withTenantContext(user.tenantId, fn)
    : (fn) => withPlatformContext(fn);

  try {
    if (req.method === 'GET') return await getAction(req, res, user, runInContext);
    if (req.method === 'PATCH') return await patchAction(req, res, user, runInContext);
    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    return respondToServiceError(res, err);
  }
}

async function getAction(req, res, user, runInContext) {
  const profile = await runInContext((client) => getOwnProfile(client, user.id));
  res.status(200).json({ profile });
}

async function patchAction(req, res, user, runInContext) {
  const { theme, avatarOption, timezone } = req.body ?? {};
  const profile = await runInContext((client) => updateOwnProfile(client, user.id, { theme, avatarOption, timezone }));
  res.status(200).json({ profile });
}
