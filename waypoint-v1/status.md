# WayPoint — Status

Current state and next steps. This is the part that goes stale — check
dates and re-verify against the actual repo/deployment before trusting
anything here, especially if it's been a while. For the stable
architecture description, see `reference.md` alongside this file.

**Last updated:** a real, live-visible bug fixed (login/every form field
was rendering invisibly), plus the Settings/User Management work
deepened to actually match MedBroker rather than just the theme/avatar
mechanism. All backend work this round re-verified against real
Postgres (17/17 integration tests). `db/migrations/06-user-profile.sql`
is a pending migration (now including `timezone`, not yet confirmed
applied) — **and now actually lives in `db/migrations/`**, correcting a
miss from the previous round: the fold-into-schema.sql-then-delete
convention was followed, but the "ring-fenced in its own folder" half
of the same instruction was dropped without noticing.

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

## This round — a real production bug, plus direct testing feedback

Mark hit a 404 activating a Cycle as TenantAdmin. Root cause, and
everything that followed from fixing it properly rather than just
patching the one symptom:

### The router bug (affected every multi-segment route, not just cycles)

`vercel.json` rewrites with `?slug=:slug*` don't reliably deliver a
multi-segment path as an array — for `/api/cycles/{id}/activate` it
arrived as a single string `"cycle-1/activate"`, so
`[cycleId, subResource] = slugParts` silently left `subResource`
undefined and the router fell through to its generic 404. Single-segment
routes never exposed this, which is why it shipped in the first place.

MedBroker had already hit and solved this exact problem
(`api-lib/http/helpers.js`'s `parseSlug`) — ported that fix rather than
re-inventing one, and applied it to **every** router (`objectives-router.js`'s
add-Key-Result, `users-router.js`'s role-change and force-password-reset
were equally exposed, not just cycle activation). Also fixed the deeper
issue: every router test was mocking `req.query.slug` as a pre-split
array, which is exactly what let this ship with 100% tests passing —
tests now simulate the real joined-string shape (`tests/httpHelpers.test.js`
plus every router test file's `mockReq`).

### Cadence entity + Cycle rework

Direct feedback: Cycle activation should be date-driven, not a manual
toggle; Cadence should be a tenant-editable dropdown (Monthly/Quarterly/
Bi-Annually/Annually as defaults), not free text; end date should be
computed from start date + Cadence.

- New `okr.cadence` entity, seeded with the four defaults on tenant
  creation, tenant-editable (create/update/delete) via
  `/api/settings/cadences`. **Locked once used by a Cycle** — Mark
  explicitly asked for this to be "figured out," not left as a gap; see
  `cadenceService.js`'s module comment for the full reasoning (the
  underlying data isn't actually at risk — a Cycle's end_date is
  computed once and stored, never live-linked — the lock exists so
  "Quarterly" can't quietly mean something different for cycles created
  before vs. after an edit).
- `okr.cycle` reworked: `cadence_id` replaces the free-text `cadence`
  column; `end_date` is always server-computed
  (`dateMath.js` — tested against the exact existing Q3 2026 sample
  data, which round-trips correctly: Jul 1 → Sep 30); `is_active` is
  gone entirely — "active" is computed from today's date against
  `[start_date, end_date]`; no two Cycles in a tenant may cover the same
  day, enforced at the database layer via a Postgres EXCLUDE constraint,
  not just application validation.
- `POST /api/cycles/:id/activate` is retired.
- Migration (`db/04-cadence-and-cycle-rework.sql`) includes an explicit
  backfill-and-verify step for existing test data (e.g. the "Q3 2026"
  cycle already created while testing), not a blind schema swap — read
  its own header before running it.

### Custom DatePicker

"Make date fields pickable" — matched against MedBroker's own precedent
exactly (`components/DatePicker.jsx`, an internal/staff-facing calendar
popover, native `<input type="date">` deliberately reserved for
public-facing forms — WayPoint has none of those yet, so this applies
everywhere). Simplified from MedBroker's version in one deliberate way:
no typed free-text entry, since that's tied to an app-wide day-first
date-*format* standard MedBroker established that WayPoint hasn't — see
the component's own header comment. Wired into the Cycles form's start
date; the value contract (`'YYYY-MM-DD'` string via `onChange`) makes it
a drop-in replacement anywhere else a date field is added later.

### FR-013 (Terminology) and FR-025 (OKR element toggles) — pulled forward

- **FR-025:** `okr.okr_element_config`, seeded all-enabled on tenant
  creation. Dependency graph (Objective never disableable; disabling an
  element is rejected while an enabled dependent still exists; enabling
  auto-enables the prerequisite chain) in
  `okrElementConfigService.js`. **One resolved ambiguity, flagged rather
  than silently picked:** the Stage 2 doc's section 3.1 table says
  disabling Key Result "automatically switches off Initiative and
  Check-in" (reads like a cascade), but FR-025's own text says disabling
  is "rejected server-side... naming the dependent element(s)" (no
  cascade at all). Implemented per FR-025's literal, fully-specified
  text — reject, don't cascade. The one live gate: `createKeyResult`
  now actually checks the toggle. Initiative/Check-in/Reflection toggle
  with no functional effect yet (those entities don't exist until
  Module 3) — same "scaffolded ahead of use" pattern as FR-022's AI
  Settings menu.
- **FR-013:** `okr.terminology_setting` (absence of a row = default
  English term — nothing seeded). `TerminologyContext.jsx`/`useTerms()`
  applies custom labels to primary UI surfaces — nav, page titles,
  section headers, main create/add buttons, across `App.jsx`,
  `Objectives.jsx`, `ObjectiveDetail.jsx`, `OkrSettings.jsx`. **Explicit
  scope boundary, not exhaustive:** backend validation-error text (e.g.
  "cadenceId does not exist") is untouched — see
  `terminologyService.js`'s module comment. Pluralisation is a plain
  heuristic (`TerminologyContext.jsx`'s `pluralise()`), not a full
  inflection library — correct for ordinary business nouns, not
  guaranteed for every irregular plural.

### Multi-role testing friction (no code change — a workaround)

`api.js`'s auth token lives in a plain JS module variable, not shared
storage — each browser tab loads its own independent copy. Opening one
tab per role and logging in fresh in each already works without
conflict; the one thing that breaks it is refreshing a tab, which wipes
that tab's session only. Session persistence itself (surfaced after
Module 2) remains open — a real decision (localStorage vs. something
more deliberate), not fixed here.

## Settings page — theme + avatar (this round)

Backend verified against real Postgres before delivery (see the
integration-test lesson from the previous round) — `GET`/`PATCH /api/me`
works for a tenant user and for PlatformAdmin alike (personal
preferences, not tenant-scoped, unlike everything in `users-router.js`).

- `db/06-user-profile.sql` — `theme`/`avatar_option` on `user_account`,
  not yet confirmed applied or folded into `schema.sql`.
- Avatar is a colour/gradient pick (`constants/avatarOptions.js`), not a
  photo upload — matches MedBroker's exact pattern
  (`User.avatarColour`); WayPoint has no blob storage set up and this
  avoids needing one.
- Two themes (Light default, Dark), not MedBroker's four — deliberate
  scope call, not an oversight. MedBroker's four palettes (custom
  fonts, mesh/grain textures) are MedBroker's own art direction;
  WayPoint's two themes both carry its own brand blue
  (`reference.md`'s Brand section) instead. The Dark palette is a
  genuine repaint for contrast, not light values dimmed — but it has
  **not been visually verified in a real browser**, only that the CSS
  compiles and the variables resolve. Sanity-check contrast once
  deployed. Flag if more themes are wanted; the pattern (add a
  `[data-theme="..."]` block, add its id to `ThemeContext.jsx`) is in
  place either way.
- `tokens.js`'s `colors` export now holds `var(--x)` references instead
  of hex literals — this is what makes every existing page
  theme-aware without needing to touch each one individually.
  `themes.css` is the actual source of truth for values per theme.
- Adjacent bug fixed while in `index.css`: the global focus-ring colour
  was `rgba(79, 70, 229, ...)` — indigo, not WayPoint's brand blue —
  doesn't match `tokens.js`'s own `shadow.focus`. Now consistent.
- `RoleContext.jsx` now does one profile-enrichment fetch
  (`GET /api/me`) right after login, merging `firstName`/`lastName`/
  `theme`/`avatarOption` into `user` — none of those are in the JWT
  (`issueToken` only signs `sub`/`tenantId`/`role`). `ThemeContext`
  reads `user.theme` from this rather than fetching independently, so
  login doesn't race two separate `GET /api/me` calls.

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

## Next immediate step

1. Apply `db/migrations/06-user-profile.sql` via the Neon SQL console,
   then delete it from GitHub yourself and confirm so it can be folded
   into `schema.sql` next round — same convention as every migration so
   far.
2. Push this delta to GitHub and let Vercel redeploy.
3. **Re-verify the CSS fix first, before anything else** — confirm the
   login page's Email/Password fields are actually visible (bordered
   input boxes, not blank space), and that switching Light/Dark in
   Settings visibly changes the app's colours. This was broken in
   production; confirm it's actually fixed there, not just in the
   sandbox build.
4. Then re-verify: Settings' new Profile/Security/Date & Time sections
   render with real data, a locked-out user shows "Locked" in Users and
   the Unlock button actually clears it (try force-password-reset on a
   test user until it locks, or manually set `locked_until` in Neon to
   confirm), and that creating/editing an Objective and Key Result still
   works.
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
