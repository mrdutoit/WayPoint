# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** FR-020's Objective/Key Result visibility deliberately
broadened from "owner and owner's direct Manager only" to tenant-wide
read access, at Mark's explicit direction after testing surfaced how
restrictive the literal spec was — Objectives, Key Results, Initiatives,
and the Alignment Map are now readable by anyone in the tenant; Check-in
comments and Reflection content stay restricted to owner+Manager+
TenantAdmin, since that's where genuinely sensitive commentary lives,
not the OKR structure itself. Edit rights are completely unchanged.
347 mocked tests + 30 real-Postgres integration tests.

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
reliably does get checked. The real, confirmed-missing capability
behind Mark's next report — no way to assign or change a user's Manager
after invite time, ever — got `updateUserManager`, a real endpoint, and
a real editable dropdown where the Users table used to just show static
text. `Dashboard.jsx` was found to still be the completely unmodified
Stage 3 scaffold page (its own copy claimed modules were "not yet
built" long after they all were) and replaced with a real, role-aware
landing page. All of the above is stable and confirmed working as of
this note.

## This round — FR-020's visibility rule, broadened deliberately

**Not a bug — but a real product question worth taking seriously.**
Mark, logged in as an Employee, saw none of his Manager's Objectives —
exactly what FR-020's literal text specifies ("visible to their owner
and the owner's direct Manager only"). Asked directly whether this
matches how OKR tools actually work: it doesn't, by default — most OKR
products (Lattice, WorkBoard, Perdoo, the original Google methodology)
treat cross-organisation transparency as the point of a cascade, not an
afterthought, and FR-020's own text already flagged this as a
deliberate Phase 1 restriction ("Organisation-wide transparency is a
Phase 2 candidate"). Given three options (upward visibility, full
org-wide read, opening the Alignment Map to everyone), Mark asked for
all three combined "in a smart way."

**The smart combination:** Objectives, Key Results, and Initiatives —
the OKR *structure* — are now readable by any tenant member; the
Alignment Map (previously TenantAdmin-only) is open to everyone too,
since it's exactly the "see how it all connects" view that makes no
sense to gate once the underlying data is tenant-wide anyway. Check-in
comments/confidence and Reflection content stay restricted to owner,
their Manager, and TenantAdmin — that's where genuinely sensitive
personal commentary lives, not the structure itself, and the original
Stage 2 API table already scoped those two more narrowly than FR-020's
blanket text even before this round, which was the actual signal this
distinction was already implicit in the design.

**Edit rights are completely unchanged** — this was the part that had
to be gotten right, not just the broadening itself. Visibility and edit
permission used to share the exact same check (`assertVisible` gated
both read and write identically); split into a real visibility read (no
check, or a narrow one for Check-ins/Reflections) and a separate,
untouched `canEdit`/`assertCanEdit` check for writes. `getObjective
ForCaller`/`getKeyResultById` now return a computed `canEdit` flag so
the frontend can hide Edit buttons for a read-only viewer without
re-deriving the rule client-side — advisory only; the backend still
enforces it independently on every write, same as before.

**A real gap caught mid-change, not after:** `listCheckInsForKeyResult`
and `listReflectionsForObjective` had *no* visibility check at all
before this round — they were only ever protected indirectly, by their
parent Objective/Key Result being unreachable under the old rule.
Broadening the parent without adding real enforcement here would have
leaked Check-in comments and Reflection content tenant-wide as an
unintended side effect. Added genuine restriction to both — proven
against real Postgres, not just asserted.

Frontend: `ObjectiveDetail.jsx` and `KeyResultDetail.jsx` both use the
new `canEdit` flag to hide Edit/Add/Submit affordances for a read-only
viewer, and both had their data-loading `Promise.all` calls split apart
so a Check-ins or Reflections 403 (now expected, for a plain viewer)
degrades gracefully instead of taking down the whole page. `Objectives.jsx`
now shows an Owner column — necessary once the list spans the whole
tenant, not just "you and your reports."

347 mocked tests + 30 real-Postgres integration tests (up from 336/28
— five existing tests rewritten to assert the new intended behaviour
rather than deleted, plus new coverage for the two newly-restricted
functions and the Alignment Map's broadened access, all re-verified
against a real database). One real bug caught by the test suite while
building this, not assumed away: `reflectionService.js` was throwing
`ForbiddenError` without importing it — fixed immediately, re-verified.
Function count unchanged at 10.

## Next immediate step

1. Push this delta to GitHub. No new migration this round — pure code
   change across services, routers, and several frontend pages.
2. Re-verify the actual scenario that started this: sign in as an
   Employee, open Objectives, and confirm your Manager's (and everyone
   else's) Objectives are now visible, with an Owner column. Open one
   you don't own — the Edit/Add/Submit controls should NOT appear
   (confirm this against the real deployment, since edit-hiding is a
   frontend nicety only — the backend is what actually blocks the
   write, worth trying to force one through devtools if paranoid).
3. Confirm the restriction that's new: as that same Employee, open a
   Key Result you don't own and check the Check-in section reads
   "only visible to the owner, their Manager, and Tenant Administrators"
   rather than either crashing or showing someone else's comments.
   Same check for Reflections on an Objective you don't own.
4. Confirm the Alignment Map is now reachable from the nav for every
   role, not just TenantAdmin.
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
