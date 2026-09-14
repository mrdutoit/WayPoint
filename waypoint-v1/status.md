# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** Module 3 shipped — Initiative, Check-in, Reflection,
and the real FR-019 scoring roll-up (previously a stub returning only
"Not Started"). Every Objective and Key Result in the app can now
actually score something, cascading up multi-level hierarchies. 297
mocked tests + 22 real-Postgres integration tests, including an
end-to-end proof of the multi-level cascade. `db/migrations/07-initiative-checkin-reflection.sql`
is pending — not yet confirmed applied.

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
    the real FR-019 scoring roll-up (was a stub until now).
  - FR-013 (Terminology) and FR-025 (OKR element toggles) — pulled
    forward from Module 7 ahead of Module 2, at Mark's request.
  - Modules 4, 5, 6, and the remainder of 7 (integrations, reporting,
    remaining administration) — not started.
- **Pre-Handover Review:** Correctly not yet run — belongs after Stage 4
  completes, before Stage 5.

**Hierarchy depth, updated (superseding the note from two rounds ago —
that one is now stale, not just historical):** Objective → Key Result →
Initiative/Check-in now all exist, and Reflection attaches directly to
Objective. Every Objective/Key Result can now genuinely score something
— FR-019's real weighted-average roll-up replaced the old stub that
could only ever return "Not Started." Modules 4-6 and the rest of 7
(reporting, integrations, remaining admin) are still not started.

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
migration in this project, not a one-off patch. All of the above is
stable and confirmed working as of this note.

## This round — Module 3 (Initiative, Check-in, Reflection) + the real FR-019 roll-up

The centerpiece: `scoringService.js` replaces the Module 2 stubs that
could only ever return "Not Started." Two genuine gaps in FR-019's
literal text, resolved and documented in the code rather than guessed
at silently — flag if either reading is wrong:

1. FR-019 says Objective roll-up is a "weighted average… of its Key
   Results," mirroring the same wording for "linked child Objectives"
   during cascade roll-up — but Objective has no weighting column the
   way Key Result does. Implemented as an **equal-weighted** average
   across child Objectives, since there's nothing to weight by.
2. Whether a parent Objective's status comes from its own Key Results,
   its children, or both is never stated. Implemented as: no children →
   score from own Key Results (the unambiguous base case); **has**
   children → score from children only, ignoring its own Key Results
   entirely. Verified this exact behaviour end-to-end against real
   Postgres — an Objective holding "On Track" from its own Key Result
   correctly switches to scoring from a new child the moment that child
   exists, cascading through multiple levels in one Check-in.

Also shipped: `checkInService.js`, `initiativeService.js`,
`reflectionService.js` (all three gated by FR-025's element toggles,
which now have something to actually gate). A real gap surfaced and
fixed along the way: `getRubricForTenant` never exposed each rubric
level's `id` — only `label`/`level_index` — because nothing needed it
before Check-in existed to submit one. New `KeyResultDetail.jsx` page
(Check-in submission + history, Initiatives) and a Reflections section
on `ObjectiveDetail.jsx`; Key Result rows now link to it.

297 mocked tests + 22 real-Postgres integration tests, including the
multi-level cascade proof above. `db/migrations/07-initiative-checkin-reflection.sql`
is pending — not yet confirmed applied, idempotent per the established
convention. Separately: migration 06 (`theme`/`avatar_option`/`timezone`)
was confirmed applied by Mark last round — folded into `schema.sql`
directly this round, and the migration file deleted, completing that
round's convention (it had been left half-done).

## Next immediate step

1. Apply `db/migrations/07-initiative-checkin-reflection.sql` via the
   Neon SQL console, then delete it from GitHub yourself and confirm so
   it can be folded into `schema.sql` next round.
2. Push this delta to GitHub and let Vercel redeploy.
3. Re-verify end to end: open a Key Result, submit a Check-in, confirm
   its status updates and the parent Objective's status updates too;
   add an Initiative and change its status; add a Reflection. Then the
   thing most worth actually trying: build a two-level cascade for real
   (a parent Objective with a child Objective under it, each with their
   own Key Result) and confirm the parent's status changes when the
   child's Key Result gets a Check-in — this exact scenario is proven
   against real Postgres in the sandbox, but hasn't been seen in the
   deployed app yet.
4. Then continue Stage 4 at Module 4 — the next unstarted piece per the
   Stage 2 doc (reporting/dashboards is Module 6; check the doc's
   module breakdown for what's actually next before assuming).

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
