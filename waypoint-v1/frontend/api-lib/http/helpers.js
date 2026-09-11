/**
 * api-lib/http/helpers.js — small shared utilities for Vercel Function
 * route handlers.
 *
 * parseSlug — every multi-segment router (cycles, objectives, users,
 * tenants, settings, key-results, auth) reaches its sub-actions via a
 * `slug` query parameter populated by a vercel.json rewrite
 * (`?slug=:slug*`), not a real Vercel/Next.js catch-all route file. That
 * distinction matters: Next.js's `[...slug].js` convention guarantees
 * `req.query.slug` is always an array, but a plain vercel.json rewrite
 * has no such guarantee — Vercel's own docs don't fully specify whether
 * a multi-segment wildcard capture arrives as a single slash-joined
 * string, a repeated query param (which Node parses into an array), or
 * something else.
 *
 * This was the exact cause of a real production bug: every router built
 * this way originally did `Array.isArray(req.query.slug) ? ... :
 * [req.query.slug].filter(Boolean)`, which is only correct if Vercel
 * happens to deliver an array. It doesn't for multi-segment paths — it
 * delivers a single string with the segments still joined by "/" (e.g.
 * "cycle-1/activate"), so `[cycleId, subResource] =
 * ["cycle-1/activate"]` silently set `subResource` to `undefined` and
 * every two-segment route (cycle activation, adding a Key Result to an
 * Objective, a user's role change, force-password-reset) fell through
 * to the router's generic 404. Single-segment routes never exposed
 * this, which is why it shipped.
 *
 * Ported from MedBroker's identical fix (api-lib/http/helpers.js,
 * 22 July 2026), which hit and solved this exact problem first —
 * matched here rather than re-solved from scratch.
 *
 * @param {unknown} slug - req.query.slug
 * @returns {string[]}
 */
export function parseSlug(slug) {
  if (slug === undefined || slug === null || slug === '') return [];
  if (Array.isArray(slug)) return slug.flatMap((s) => String(s).split(/[/,]/)).filter(Boolean);
  return String(slug).split(/[/,]/).filter(Boolean);
}
