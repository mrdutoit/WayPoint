# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** a real, confirmed-missing capability fixed — no way
to assign or change a user's Manager after they were created, only at
invite time. This is what actually blocked Mark's testing (needing Fred
to have direct reports to test Team Progress), not the invite-time
dropdown, which was re-checked and appears correct. Also: `Dashboard.jsx`
was still the literal, unmodified Stage 3 scaffold placeholder — its own
copy said modules were "built module by module in Stage 4" long after
they all were. Replaced with a real, role-aware landing page. 336
mocked tests + 28 real-Postgres integration tests.
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
way. A production deploy then failed — 13 files under `frontend/api/`
over Vercel Hobby's 12-function cap, the exact issue already written
down in app-builder's skill after MedBroker, missed because that
guidance was prose, not a checked gate. Fixed by consolidating three
routers into existing ones (`initiatives-router.js` →
`key-results-router.js`, `me-router.js` → `auth-router.js`,
`cycles-router.js` → `settings-router.js`, now 10 files with real
headroom) and, more durably, adding a "Serverless function count gate"
to the skill itself, structured exactly like the Vite build gate that
reliably does get checked. All of the above is stable and confirmed
working as of this note.

## This round — the manager-assignment gap, and a stale Dashboard

**The actual blocker, found by testing, not guessed at:** Mark reported
being unable to select a Manager when inviting a user, and unable to
edit any user afterward. Re-read the invite-time dropdown code
carefully and could not find a defect in it. The real, confirmed gap
was narrower and more consequential: **there was no way to assign or
change a user's Manager after they were created at all** —
`managerId` was only ever settable at `inviteUser` time, with no
corresponding update path. This is exactly what blocked Mark's actual
goal (getting Fred set up with a direct report to test Team Progress),
regardless of whether the invite-time dropdown itself has a separate
issue — flag if it's still misbehaving once this is live, with specifics
(did it show zero options, or the wrong ones) so it can be reproduced
directly rather than re-guessed at.

Added `userService.js`'s `updateUserManager` (mirrors `inviteUser`'s
own validation level deliberately — not restricted to role `Manager`,
since the invite form's restriction to Manager-role options is a
frontend choice, not a backend rule; a small org's TenantAdmin managing
someone directly before any Manager exists is a legitimate shape this
doesn't block), a new `PATCH /api/users/:id/manager` endpoint, and a
real editable dropdown in the Users table — the Manager column was
static text with no edit control at all before this.

**Also fixed, found while answering Mark's direct question:**
`Dashboard.jsx` was still the completely unmodified Stage 3 scaffold
page — its own copy read "Objectives, Key Results, Initiatives,
Check-ins, and Reflections are built module by module in Stage 4," long
after every one of them actually shipped. Not intentional, just never
revisited. Replaced with a real, role-aware landing page: a proper
name-based greeting (using the profile-enrichment fetch from the
Settings round), and quick links to Objectives, the caller's own
scorecard, Team Progress for Managers, and Alignment Map/Users for
TenantAdmins.

336 mocked tests + 28 real-Postgres integration tests (up from 324/27 —
the new manager-assignment coverage, both mocked and against a real
row). Function count unchanged at 10 — no new router files this round.

## Next immediate step

1. Push this delta to GitHub. No new migration this round — pure code
   change (backend + `UsersAdmin.jsx` + `Dashboard.jsx`).
2. Re-verify the actual thing that was broken: as TenantAdmin, open
   Users, set Joe's (or any non-TenantAdmin's) manager to Fred via the
   now-editable Manager dropdown, confirm it saves and persists across
   a refresh. Then sign in as Fred and confirm Team Progress now shows
   Joe. This is the exact scenario that was blocked — confirm it's
   actually unblocked in production, not just the sandbox.
3. While there: try the invite-time Manager dropdown again with Fred
   already existing as a Manager, and confirm whether it correctly
   offers Fred as an option. The code was re-checked and looks correct,
   but hasn't been re-confirmed against the real deployment since the
   report — if it's still wrong, note exactly what the dropdown showed
   (empty? wrong option? an error?) so it can be reproduced directly.
4. Check the new Dashboard renders sensibly for each role — the
   role-gated quick links (Team Progress for Manager, Alignment
   Map/Users for TenantAdmin) haven't been seen outside the sandbox
   either.
5. Apply `db/migrations/07-initiative-checkin-reflection.sql` via the
   Neon SQL console (still pending from Module 3, unrelated to this
   round), then delete it from GitHub yourself and confirm so it can be
   folded into `schema.sql` next round.
6. Then pick the next piece from what's still open: FR-021 (Billing
   Mode UI), FR-030-032 (Data Export/Retention/Erasure), or the four
   report types not yet built (see "Earlier rounds," above).

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
- No admin-side UI to edit a user's name or email after creation
  (manager is now editable, as of this round — see above; name/email
  still aren't) — Settings' Profile section is read-only because of
  this, not by design choice.
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
