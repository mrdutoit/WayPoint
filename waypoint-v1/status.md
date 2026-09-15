# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** production deploy failure fixed — 13 files under
`frontend/api/` exceeded Vercel Hobby's 12-Serverless-Function cap,
the exact issue already documented (after MedBroker) in app-builder's
own skill, missed because that guidance was prose, not a checked gate.
Consolidated to 10 files with real headroom; 324 mocked tests + 27
real-Postgres integration tests, all re-verified. The skill itself is
fixed too — see below.

## Where things actually stand

- **Stage 1 (Requirements):** Complete.
- **Stage 2 (Architecture & Design):** Complete. Six-persona design
  review done. Requirements and Architecture document is at v0.3; Stage
  2 Architecture and Design is at v0.4.
- **Stage 3 (Scaffold):** Complete and verified working end to end in
  production.
- **Stage 4 (Full build, module by module):**
  - Module 1 (Authentication and user management) — complete, including
    the tenant-provisioning/user-invite/password-management follow-up.
  - Module 2 (Objective, Key Result, Cascade) — complete.
  - Module 3 (Initiative, Check-in, Reflection) — complete, including
    the real FR-019 scoring roll-up.
  - FR-033 (Reporting & Dashboards) — complete for the four reports the
    Stage 2 doc's approved API table actually specifies (scorecard,
    team-progress, alignment-map, checkin-compliance). Four more are
    named in the doc's narrative section 5 but never given an API
    endpoint (cycle-over-cycle trend, Initiative execution status,
    Reflection digest, cross-tenant adoption) — not built, flagged
    rather than assumed out of scope permanently.
  - FR-013 (Terminology) and FR-025 (OKR element toggles) — pulled
    forward from Module 7 ahead of Module 2, at Mark's request.
  - FR-021 (Billing Mode UI), FR-030-032 (Data Export, Audit Log
    Export, Retention/Erasure) — not started; these were the other two
    options offered alongside Reporting when this round started.
  - FR-022 (AI Settings scaffold UI), FR-028/029 (Field-Level
    Encryption, SSO) — deliberately deferred per the Stage 1/2 docs
    themselves, not just unstarted.
- **Pre-Handover Review:** Correctly not yet run — belongs after Stage 4
  completes, before Stage 5.

**Cross-cutting, not tied to a Module number:** a self-service Settings
page (theme + avatar + timezone preference) — personal account settings
apply to every role regardless of which OKR modules exist yet, so this
was built as its own thing rather than folded into a specific Module.

## Earlier rounds — brief summary (full reasoning preserved in `reference.md`)

Router 404 bug fixed (`parseSlug`, ported from MedBroker, applied to
every router). Cadence entity + date-driven Cycle rework shipped.
Custom `DatePicker` matching MedBroker's pattern. FR-013/FR-025 pulled
forward from Module 7. Settings page (theme, avatar, timezone,
Profile, Security) built to match MedBroker's actual depth, not just
its mechanism — including a separate Unlock action distinct from
force-password-reset. `tokens.js` converted to CSS variables for
theming, but the new `themes.css` was never actually imported anywhere
for a full round — every form field rendered invisibly in production
until caught and fixed (the compiled CSS bundle size was the
give-away: flat at 0.50-0.56 kB across many builds despite the file
existing, jumped to 1.57 kB once the import landed). A migration edited
mid-round without checking whether its original version had already
been applied broke on Mark's real database the same way — fixed with
`ADD COLUMN IF NOT EXISTS`, now the standing default for every
migration in this project. Module 3 (Initiative, Check-in, Reflection)
shipped the real FR-019 scoring roll-up, replacing the Module 2 stub —
two genuine gaps in FR-019's literal text (Objective has no weighting
column to roll up "weighted" by; whether a parent scores from its own
Key Results, its children, or both is never stated) resolved and
documented in `scoringService.js` and `reference.md`, verified
end-to-end against real Postgres including a multi-level cascade.
FR-033 Reporting shipped the four reports the Stage 2 doc's *approved
API table* actually specifies (scorecard, team-progress, alignment-map,
checkin-compliance) out of eight named in its narrative section — a
real gap in the doc itself, surfaced rather than silently picked one
way. All of the above is stable and confirmed working as of this note.

## This round — fixed a production deploy failure (Vercel's 12-function cap)

**What happened, plainly:** 13 files under `frontend/api/` — one over
Vercel Hobby's 12-Serverless-Function cap, confirmed exactly matching
the deploy error Mark hit. This exact issue was already written down in
app-builder's own skill after MedBroker hit it first, including the
precise command to check for it. It happened again on WayPoint because
that guidance lived as prose in one section, and nothing forced the
check to actually run before adding `initiatives-router.js` and
`reports-router.js` the last two rounds. Not a documentation gap — a
process gap, and worth naming as exactly that rather than as a
technical mystery.

**Fixed here:** consolidated three router files into existing ones,
using the same "one file, multiple URL prefixes via a `?resource=`
marker on the `vercel.json` rewrite" pattern already used elsewhere —
`initiatives-router.js` → `key-results-router.js`, `me-router.js` →
`auth-router.js`, `cycles-router.js` → `settings-router.js`. Now at 10
files, not just under 12 but with two full slots of headroom before
this becomes a problem again.

One real risk caught during the merge, not just a mechanical file
move: `auth-router.js` has deliberately wide-open CORS
(`Access-Control-Allow-Origin: *`) for a login-test tool — a narrow,
already-justified exception. Folding `/api/me` into that same file
without checking would have silently given a profile endpoint that
never needed cross-origin access the same wide-open policy. Fixed by
branching before the CORS header is set, and added a test that asserts
`/api/me` specifically does *not* receive it — a consolidation should
be a packaging change, never a silent security-boundary change.

Every test file for the three merged routers was rewritten to test
through the consolidated handlers (not deleted or skipped) — 324
mocked tests (up from 323 — the new CORS-boundary test) + all 27
real-Postgres integration tests re-run to confirm the refactor didn't
touch service-level behaviour, which it shouldn't have and didn't.

**Fixed the actual process gap, not just this instance:** added a
"Serverless function count gate" to app-builder's skill, structured
exactly like the Vite build gate that reliably *does* get run every
delivery — a command, a number, a hard rule. Also documented the
consolidation technique itself as a new file in the skill's patterns
library (`http/multi-resource-router-consolidation.md`), including the
CORS-boundary lesson above, so the next project starts from a
proven-safe pattern instead of re-discovering the same two gotchas.

## Next immediate step

1. **Push this delta to GitHub first — this is the one that fixes the
   actual deploy failure.** No new migration to apply this round; it's
   a pure code/config change (router consolidation + `vercel.json`).
2. Confirm the Vercel deployment actually succeeds this time (the
   "Build Failed... No more than 12 Serverless Functions" error should
   be gone) before doing anything else.
3. Apply `db/migrations/07-initiative-checkin-reflection.sql` via the
   Neon SQL console (this is unrelated to the deploy fix, just still
   pending from Module 3), then delete it from GitHub yourself and
   confirm so it can be folded into `schema.sql` next round.
4. Re-verify end to end that nothing broke from the router merge —
   sign in, change password, update your Settings (theme/avatar/
   timezone), create/edit a Cycle, create/update an Initiative. All of
   this now routes through a consolidated file; the URLs the frontend
   calls didn't change, but confirm in the real deployment, not just
   the sandbox.
5. Then: as an Employee, view your own scorecard; as a Manager, view
   team progress and confirm the worst-scored direct report sorts
   first; as a TenantAdmin, open the alignment map (collapse/expand)
   and check-in compliance. None of Reporting has been seen in the
   deployed app yet — only in the sandbox.
6. Then pick the next piece from what's still open: FR-021 (Billing
   Mode UI), FR-030-032 (Data Export/Retention/Erasure), or the four
   report types this round didn't build (see "This round," above).

## Open items, not yet resolved

- Trademark/domain check on "WayPoint" — low priority, no external
  client yet.
- No second database region or Azure migration — deliberately deferred.
- Self-service "forgot password" has a backend but no frontend —
  needs an explicit decision, not a default assumption.
- Session persistence and revocation — same; also why "force logout"
  wasn't built into User Management (see `reference.md`).
- FR-015's "at their permitted cascade level" has no defined role→level
  permission mapping — flagged when Module 2 shipped, still open.
- No admin-side UI to edit a user's name after creation — Settings'
  Profile section is read-only because of this, not by design choice.
- Two FR-019 interpretations were resolved rather than confirmed with
  Mark (Objective roll-up is equal-weighted, not weighted — Objective
  has no weighting field; a parent with children scores from children
  only, not its own Key Results too) — see `scoringService.js`'s module
  comment and this file's Module 3 section above. Worth a direct
  confirmation once there's a real multi-level OKR tree to look at.
- The Check-in confidence scale (1-5) is an inferred choice, not a
  literal FR-018 requirement — flag if a different scale was actually
  intended.

## For a new chat picking this up

Read `reference.md` first (architecture, decisions, structure), then
this file. The repo itself (`github.com/mrdutoit/WayPoint`,
`waypoint-v1` folder) is the actual source of truth for what's built —
these two files are a map, not a substitute for reading the code when
precision matters.
