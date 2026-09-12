# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** fixed a mistake from the previous round — the
CSS/Settings/User Management delivery landed correctly (confirmed: the
Settings page now renders fully, Dark theme applies), but the migration
that went with it broke on Mark's real database. `db/migrations/06-user-profile.sql`
now uses `ADD COLUMN IF NOT EXISTS`, verified against Mark's exact
partial-apply scenario, not just a clean install.

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
  - Module 2 (Objective, Key Result, Cascade) — built; the router bug
    below was specific to it and is now fixed.
  - FR-013 (Terminology) and FR-025 (OKR element toggles) — pulled
    forward from Module 7 this round, at Mark's request, since Module 2
    is "the functionality they're surrounded by."
  - Modules 3, 4, 5, 6, and the remainder of 7 (Initiatives/Check-ins/
    Reflections, primary cascade/scoring workflow, integrations,
    reporting, remaining administration) — not started.
- **Pre-Handover Review:** Correctly not yet run — belongs after Stage 4
  completes, before Stage 5.

**Hierarchy depth, confirmed directly (Mark asked while testing):**
Objective → Key Result is as deep as it currently goes. Initiative and
Check-in — which would nest *under* a Key Result — are Module 3, not
started, which is also why every Objective/Key Result shows
"Not Started" permanently right now: FR-019's actual score computation
is driven entirely by Check-in submissions, and none can exist yet.
That's expected, not a gap in what's already built.

**Cross-cutting, not tied to a Module number:** a self-service Settings
page (theme + avatar preference) — personal account settings apply to
every role regardless of which OKR modules exist yet, so this was built
as its own thing rather than folded into a specific Module.

## Earlier rounds — brief summary (full reasoning preserved in `reference.md`)

Router 404 bug fixed (`parseSlug`, ported from MedBroker, applied to
every router — see `reference.md`'s design decisions for the full
story). Cadence entity + date-driven Cycle rework shipped (Cadence
tenant-editable, locked once used; Cycle's end_date always
server-computed; no manual "activate" any more). Custom `DatePicker`
matching MedBroker's pattern. FR-013 (Terminology) and FR-025 (OKR
element toggles) pulled forward from Module 7. Settings page (theme +
avatar) built, `tokens.js` converted to CSS variables. All of this is
stable and confirmed working — see the two rounds directly below for
what needed fixing after the fact.

## This round — a real production bug (again), plus MedBroker parity

### The invisible-form-fields bug

Root cause: `themes.css` was created in the previous round but **never
imported anywhere** — no `import './themes.css'` in `main.jsx`. Every
`var(--panel)`, `var(--line)`, `var(--ink900)` reference in
`tokens.js`'s colours resolved to nothing, so every input's border and
background rendered as browser-default/transparent — white-on-white,
not just the login page, every form in the app. Confirmed via the
compiled CSS bundle size, which had sat at a consistent 0.50–0.56 kB
across every previous build despite `themes.css` supposedly existing —
proof it was never actually bundled — and jumped to 1.57 kB once fixed.
Two-line fix: the missing import in `main.jsx`, plus a default
`data-theme="light"` on `index.html`'s `<html>` tag so there's no flash
of unstyled content before React mounts. This is exactly why "Light and
Dark theme didn't land" while "Avatar colour worked" — avatar swatches
use literal hex values inline, never a CSS variable, so they were never
exposed to this bug at all.

### Settings + User Management — actually matched against MedBroker, not just the mechanism

Read MedBroker's real `Settings.jsx` (272 lines) and `UserAdmin.jsx`
(987 lines) in full this round, not just `ThemeContext.jsx`/
`avatarOptions.js` as before — that was the gap: the previous round
built the theme/avatar *mechanism* correctly but never checked what the
actual Settings *page* or user admin *page* contained on the other
side.

**Added, genuinely applicable to WayPoint:**
- **Settings.jsx**: Profile section (name/email/role, read-only — no
  admin-side name-edit UI exists yet either, so the copy says "set when
  your account was created" rather than falsely implying one does),
  Security section (a "Change password" button, redundant with the nav
  link but matches MedBroker's placement), Date & Time section (a
  timezone preference — see the scope note below).
- **UsersAdmin.jsx / userService.js**: a `Status` column showing
  locked/active, and a separate **Unlock** action
  (`PUT /api/users/:id/unlock`) — MedBroker's `UserAdmin.jsx` treats
  "locked out" and "forgot password" as two different admin actions
  (`onUnlock` vs `onForcePasswordReset`); WayPoint's force-password-reset
  previously conflated them, meaning an admin had no way to clear a
  lockout without also making the user set a brand new password.

**Deliberately not built, and why — checked against MedBroker's
`UserModal`, which also has these:**
- **Force logout** (`onForceLogout` in MedBroker) — MedBroker has real
  server-side sessions to invalidate. WayPoint's session is a stateless
  Bearer JWT with no revocation mechanism (flagged as an open item
  since Module 2) — building a "force logout" button that doesn't
  actually invalidate anything would be worse than not having the
  button at all. Needs the session-revocation decision first, not the
  other way round.
- **Link/unlink SSO identity** (`onLinkIdentity`) — WayPoint's SSO is
  `auth.sso.enabled`, scaffolded and off. Not reachable until that
  module is built.
- **Top-up / balance** (`onTopUp`) — this is MedBroker's own business
  domain (a broker's lead-purchasing credit balance), not a generic
  user-management pattern. Not applicable to WayPoint at all.
- **Sortable table columns**, **a full edit modal** (vs. WayPoint's
  simpler inline-editable row) — MedBroker UX niceties, not missing
  functionality. Skipped for scope, not forgotten.

**Timezone — a stored preference only**, matching MedBroker's field but
not MedBroker's `dateFormat.js` (the layer that actually converts every
displayed timestamp app-wide). WayPoint hasn't adopted a display-format
standard the way MedBroker has — same boundary already drawn for
`DatePicker.jsx`. Building that conversion layer is separate, larger
scope than a settings field; flagged rather than silently assumed
either way.

### Migrations folder — actually corrected this time

`db/migrations/06-user-profile.sql` now genuinely lives in a
ring-fenced folder, not flat in `db/` next to `schema.sql`. This was a
direct, explicit instruction two rounds ago that only got half-followed
— own that plainly rather than call it a judgement call.

## This round — a migration mistake, caught on Mark's real database

**Not deliberate, and directly my error, not a judgement call:** the
previous round's migration was originally delivered with just `theme`
and `avatar_option`. Mark applied it successfully (confirmed via Neon's
query history — Sep 12, 10:24am). Later the same round, I added a
`timezone` column and **edited that same already-applied migration
file** to include it, without checking whether the original had already
been run. It had. When Mark ran the edited file, `ALTER TABLE ... ADD
COLUMN theme ...` failed with "column already exists" — and because a
multi-column `ALTER TABLE` is atomic, the whole statement rolled back,
so `timezone` was never created either, even though the deployed code
already expected it. Result: Settings mostly rendered (confirming the
CSS fix from earlier in the round genuinely worked), but any write
through `PATCH /api/me` — like picking an avatar colour — hit a real
"column timezone does not exist" error.

**Fixed:** `db/migrations/06-user-profile.sql` now uses
`ADD COLUMN IF NOT EXISTS` for all three columns, so it's safe to run
regardless of which of them already exist. Verified against Mark's
*exact* scenario, not just a clean install — added `theme`/
`avatar_option` to a fresh database by hand, then ran the corrected
migration on top and confirmed it succeeds (informational NOTICEs, not
errors) and `timezone` actually gets created. Also re-ran the full
real-Postgres integration suite against both states (17/17).

**The durable lesson, not just this one fix:** never edit an
already-delivered migration file without first confirming whether it's
been applied — ask, don't assume, even mid-round. `ADD COLUMN IF NOT
EXISTS` (and the equivalent idempotent forms for other DDL) is now the
default for any future migration in this project, not just a one-off
patch for this file.

## Next immediate step

1. **Push this delta to GitHub first, then re-run
   `db/migrations/06-user-profile.sql`** — the corrected version, not
   the one you already tried. It's idempotent now, so re-running it is
   safe even though `theme`/`avatar_option` already exist — it will
   only add `timezone`. Confirm the run shows two `NOTICE` lines (not
   errors) plus success.
2. Once confirmed applied, delete the migration file from GitHub and
   note it here so it can be folded into `schema.sql` next round.
3. Re-verify: picking an avatar colour and a Date & Time timezone in
   Settings both actually save now (this is the exact write path that
   was hitting "Internal server error"), and that both the CSS fix and
   the new Settings sections still look right — the screenshot showed
   they do, but confirm again after this deploy.
4. Then re-verify: a locked-out user shows "Locked" in Users and the
   Unlock button actually clears it (try force-password-reset on a
   test user until it locks, or manually set `locked_until` in Neon to
   confirm), and that creating/editing an Objective and Key Result
   still works.
5. Then continue Stage 4 at Module 3 (secondary entities: Initiative,
   Check-in, Reflection) against the same Stage 2 data model — this is
   also when the OKR Elements toggles for those three actually start
   having a visible effect, and when every Objective/Key Result stops
   being permanently "Not Started."

## Open items, not yet resolved

- Trademark/domain check on "WayPoint" — low priority, no external
  client yet.
- No second database region or Azure migration — deliberately deferred.
- Self-service "forgot password" has a backend but no frontend —
  needs an explicit decision, not a default assumption.
- Session persistence and revocation — same.
- FR-015's "at their permitted cascade level" has no defined role→level
  permission mapping (any cascade level is currently accepted from any
  Manager/Employee) — flagged when Module 2 shipped, still open.

## For a new chat picking this up

Read `reference.md` first (architecture, decisions, structure), then
this file. The repo itself (`github.com/mrdutoit/WayPoint`,
`waypoint-v1` folder) is the actual source of truth for what's built —
these two files are a map, not a substitute for reading the code when
precision matters.
