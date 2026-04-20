# WSOP 2026 Poker Tournament Scheduler

## Recent Changes
<!-- Update this section at the end of each work session so the next instance knows where things stand. Most recent first. -->
<!-- RULE: Before committing, always update this section with a summary of what changed in this session. -->
- **2026-04-20**: Multi-day event restart audit — added missing Day 2 cards for WSOPC Cherokee (Mini Main, Monster Stack, NLH, Main Event), WSOPC Horseshoe Las Vegas (Mini Main, Monster Stack, Main Event), Turning Stone Casino (Mini Main, Monster Stack, Main Event). Renamed Venetian "NLH MSPT - Day 2" (Jul 19) → "NLH MSPT Heart Poker Championship - Day 2". Fixed orphaned Orleans "NLH Mega Stack - Flight B" → "NLH Mega Stack". Script: `add-day2-restarts.js`.
- **2026-04-08**: Deploy script with DB sync — `deploy.sh` builds, pushes to git, waits for Render deploy, then syncs local tournament DB and venue colors to production via `/api/tournaments/sync` and `/api/venue-colors`. Admin color picker added to CalendarEventRow edit panel — saves to `venue_colors` table, updates CSS variables for all venues sharing the same abbreviation.
- **2026-04-02**: URL-based schedule import — new `/api/parse-schedule-url` endpoint fetches PDFs, images, or HTML pages from URLs and runs through AI extraction pipeline. Shared parser helpers extracted (getSchedulePrompts, repairTruncatedJsonArray, extractJsonArray, runTwoPassExtraction, postProcessEvents). Fixed imported events not appearing by normalizing human-readable dates to ISO format. Frontend URL input with Fetch button and progress bar.
- **2026-04-02**: Schedule parser improvements — two-pass AI extraction (Sonnet vision → Haiku structuring), assistant prefill to prevent code fences, character-level JSON repair, asymptotic progress bar, scan editor checkboxes (satellite/restart/category), per-day event counts in date headers, Import Schedule button in filters bar.
- **2026-03-08**: User search in Social tab — `GET /api/users/search?q=` endpoint with prefix matching on username/real_name, excludes self and existing connections. Debounced auto-suggest dropdown in SocialView with Connect button.
- **2026-03-08**: Hand Replayer activated — wired up `HandReplayerView` component (was "Coming Soon" placeholder). Custom game type support, manual winner selection, split-pot seat highlighting.
- **2026-03-08**: PDF download fix — `buyinRight` was NaN because `doc.lastAutoTable.columns[4].x` doesn't exist in jspdf-autotable 3.8.4. Fixed by summing column widths from left margin. Added try/catch to `handlePDF` with error alert.
- **2026-03-07**: Hand Replayer companion tool — Canvas-based felt table, flexible game engine supporting any card game (including custom/made-up games), 6 presets (NLHE, PLO, Stud, Draw, Pineapple, Short Deck), game builder UI, hand editor with card picker, step-through replay controls with keyboard support (arrow keys), action log sidebar. New file: `public/replayer.html`. New API routes: `/api/replayer/hands`, `/api/replayer/games`. New DB table: `replayer_games`. Page served at `/replayer`.
- **2026-03-07**: Light mode export option — added "Export in Light Mode" checkbox to schedule export modal. Both PDF and image exports support `opts.light`. PDF uses theme constants (BG, BG_ALT, TEXT_PRI, TEXT_MUT, TEXT_ACC, LINE_CLR, LINE_HEAD, LINE_FOOT) and light venue colors. Image export (`drawSchedulePage`) uses equivalent canvas color variables. `generateScheduleImages` passes opts through.
- **2026-03-07**: PDF total buy-ins right-aligned with buy-in column — used `doc.lastAutoTable.columns[4]` to get the exact buy-in column position and align the total amount with `{ align: 'right' }`. Merged with existing page-overflow logic.
- **2026-03-05**: Spacing below search bar row — added 8px margin-bottom to search bar + filter button row for breathing room above the checkbox pills.
- **2026-03-05**: Vertically center filter button and search bar — overrode `.search-bar` `margin-bottom:10px` with `marginBottom:0` when in flex row with filter button.
- **2026-03-05**: Date range filters game variants — Variant dropdown now only shows game variants that have events within the selected date range (same behavior as venues/series). Uses `availableGameVariants` memo computed from tournaments filtered by `dateFrom`/`dateTo`.
- **2026-03-05**: Added Mixed quick-filter pill — shows events where `game_variant` is neither NLH nor PLO. Filter logic uses OR when multiple pills active (NLH + Mixed shows both). Added `mixedOnly` filter state flag.
- **2026-03-05**: Filter pills full width fix — added `gridColumn:'1 / -1'` to pills container so it spans all columns of the filter panel grid.
- **2026-03-05**: Multi-select filter pills — all five pills (NLH, PLO, Mixed, Ladies, Seniors) toggle independently. NLH/PLO add/remove from `selectedGames` array. Ladies/Seniors use OR logic when both active. Checkboxes in Special dropdown synced with pills (no more clearing other filters).
- **2026-03-05**: Ladies/Seniors checkboxes synced with pills — Special dropdown checkboxes now toggle `ladiesOnly`/`seniorsOnly` (same state as pills). Removed `hideWomens`/`hideSeniors` entirely — these filters only show events exclusively, never hide them.
- **2026-03-05**: Remove connection from Social tab — expanded buddy cards now show "Remove Connection" button with confirmation step. Uses existing `DELETE /api/share-buddy/:userId` endpoint. Added `confirmRemoveId` state and `onRemoveBuddy` prop to SocialView.
- **2026-03-05**: TCH re-entry set to Unlimited — all Texas Card House events had null re-entry. Updated `tch-events.json` seed file and added `tch-reentry-unlimited-2026-03` data migration for existing databases.
- **2026-03-05**: Connection schedule CSS grid alignment — replaced per-row flex layout with single CSS grid (`gridTemplateColumns:'auto auto auto 1fr auto'`) so all rows share column widths. Fixes misalignment between rows with different content lengths (e.g. "Turning Stone" vs "IPO"). Uses `React.Fragment` wrappers so cells participate directly in parent grid.
- **2026-03-05**: Fixed nextThemeLabel crash — `nextThemeLabel` was used in AuthScreen, ForgotPasswordForm, ResetPasswordForm but only defined inside App scope. Fixed by computing locally in each component.
- **2026-03-05**: Filter panel restructuring — renamed "How Much?" to "Buy-in / Rake", added "All" checkboxes to Buy-in and Rake, renamed "Which?" to "Variant", created Special dropdown (Ladies, Seniors, Bounty, Satellites), moved filter button to left of search bar, added quick-filter pills (NLH, PLO, Mixed, Ladies, Seniors) at top of filter panel.
- **2026-03-05**: Moved date range slider outside When? dropdown — slider is now its own top-level filter group in the filter panel, always visible when panel is open (no need to expand When? first).
- **2026-03-04**: Real name support — `real_name` column, `PUT /api/profile`, Full Name on registration, prompt for existing users on login, display name toggle (Real/Username) in Settings via `DisplayNameContext`, all name display locations updated.
- **2026-03-04**: Add connections to groups from Social view — "Add to Group" button on expanded connection cards, new `GET /api/groups/:id/members` endpoint, fixed invite filter to exclude existing members, proper member list in group Members tab.
- **2026-03-04**: Show connection schedules when offline — expanding a connection in Social view now fetches and displays their upcoming schedule (grouped by date), regardless of online status. Schedule data cached after first load.
- **2026-03-04**: User dropdown menu — username/avatar chip opens portal dropdown with "My Schedule" and "Sign Out". Uses z-index 9998/9999 to layer above all other UI. Background uses `var(--surface)` for opacity.
- **2026-03-04**: Guest banner "Register" button links directly to registration form via `initialRegister` prop on AuthScreen.
- **2026-03-04**: Removed global rate limiter (200 req/15min was too aggressive for SPA). Kept auth-specific (10/15min), admin, and staking limiters.
- **2026-03-04**: Guest login expanded — guests can now add events to schedule temporarily (schedule endpoints open to guests). Banner: "Guest mode — your schedule won't be saved. Register to keep it!"
- **2026-03-04**: Added guest login — browse-only access without registration. `POST /api/guest-login` issues a 4h JWT with `isGuest: true`. `requireRegistered` middleware blocks all write endpoints for guests. Frontend: "Continue as Guest" button on AuthScreen, guest banner with sign-up prompt, hidden schedule action buttons.
- **2026-03-04**: Added forgot password feature — token-based reset flow with Nodemailer SMTP support. New endpoints: `/api/forgot-password`, `/api/reset-password`. New `password_resets` table. Frontend: ForgotPasswordForm, ResetPasswordForm components. Reset links use URL hash (`/#reset?token=<hex>`).
- **2026-02-26**: Cloned repo to new machine, set up dev environment (Xcode CLI tools, Homebrew, Node.js). No code changes yet.

## Quick Start
```bash
npm install
npm run init-db        # Creates poker-tournaments.db with schema + sample data
JWT_SECRET="dev-secret-not-for-production" node server.js
```
Server runs on port 3001 (or `PORT` env var). `JWT_SECRET` env var is **required** — server exits without it.

### Optional env vars for password reset emails
| Variable | Purpose | Example |
|---|---|---|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port (default 587) | `587` |
| `SMTP_USER` | SMTP username | `noreply@yourdomain.com` |
| `SMTP_PASS` | SMTP password/app password | `xxxx-xxxx-xxxx-xxxx` |
| `SMTP_FROM` | From address | `"Futuregame <noreply@yourdomain.com>"` |
| `APP_URL` | Public base URL for reset links | `https://futuregame.com` |

If SMTP is not configured, reset links are logged to the server console.

## Architecture
- **Frontend**: Single-file React app at `public/index.html` (React 18 + Babel standalone, no build step)
- **Backend**: `server.js` — Express 5 + sql.js (in-memory SQLite loaded from `poker-tournaments.db`)
- **Parsers**: `parsers/wsop-parser.js`, `parsers/generic-parser.js` — PDF schedule importers
- **Database**: `poker-tournaments.db` — SQLite file, gitignored. Run `npm run init-db` to create/reset

## Key Files
| File | Purpose |
|------|---------|
| `public/index.html` | Entire frontend (~17000+ lines of React components, styles, game logic) |
| `server.js` | Express API server, auth, CRUD, live updates, file uploads |
| `init-db.js` | Database schema creation + optional seed data |
| `sample-data.js` | Tournament seed data used by init-db |
| `public/replayer.html` | Hand replayer — Canvas table, game engine, editor, game builder |
| `parsers/` | Schedule PDF parsing utilities |

## Conventions
- All frontend code lives in `public/index.html` — no JSX files, no bundler
- Dark/light theme support via CSS custom properties and `[data-theme]` selectors
- State management uses React hooks (useState, useMemo, useEffect, useCallback)
- Card notation: `AhKs` = Ace of hearts, King of spades. Suits: h/d/c/s, x = face-down
- "Opponent" (not "villain") for non-hero hands — renamed globally
- Hand evaluation supports multiple opponents (array of results)
- Canvas overlays for camera/share images drawn via 2D API
- Dropdowns/panels use `ReactDOM.createPortal` to escape stacking contexts
- Filter panel and live-update panel both portal backdrop + panel to `document.body`

## API
- Auth: POST `/api/register`, POST `/api/login`, POST `/api/guest-login` (JWT-based)
- Password Reset: POST `/api/forgot-password`, POST `/api/reset-password`
- Profile: PUT `/api/profile` (update real_name)
- Tournaments: GET `/api/tournaments`, GET `/api/tournaments/:id`
- Schedule: GET/POST/DELETE `/api/schedule` (per-user saved tournaments)
- Tracking: GET/POST/PUT/DELETE `/api/tracking` (buy-ins, results, P&L)
- Live Updates: GET/POST `/api/live-update`, GET `/api/live-update/active`
- Shared: GET/POST `/api/shared-schedule`
- Share Buddies: GET `/api/share-buddies`, PUT `/api/share-request/:id/accept`, DELETE `/api/share-buddy/:userId`
- Groups: GET/POST `/api/groups`, DELETE `/api/groups/:id`, GET `/api/groups/:id/members`, POST `/api/groups/:id/members`, GET `/api/groups/:id/feed`, POST `/api/groups/:id/messages`, GET `/api/groups/:id/schedule`, GET/PUT `/api/groups/:id/leaderboard`
- Group Invites: GET `/api/groups/:id/invites`, PUT `/api/group-invites/:id/accept`, PUT `/api/group-invites/:id/decline`
- Hand Replayer: GET/POST `/api/replayer/hands`, PUT/DELETE `/api/replayer/hands/:id`, GET/POST/DELETE `/api/replayer/games`
- Schedule Docs: GET `/api/schedule-docs` (list all), GET `/api/schedule-docs/:venue/:type/:filename` (serve file)
- Structure Parsing: POST `/api/parse-structure` (upload structure sheets → AI extraction → update tournament records)

## Schedule Documents
Source schedules and structure sheets are archived in `schedule-docs/<Venue>/schedules/` and `schedule-docs/<Venue>/structures/`. Files are auto-archived when users import via `/api/upload-schedule`, `/api/parse-schedule`, or `/api/parse-structure`. Structure sheets update existing tournament records with granular data (starting chips, level durations, blind levels, re-entry, late reg, day length).

## Dev Server Config
The `.claude/` directory is gitignored. For Claude Code preview tools, create `.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "dev",
      "runtimeExecutable": "node",
      "runtimeArgs": ["server.js"],
      "port": 3001,
      "env": {
        "JWT_SECRET": "dev-secret-not-for-production"
      }
    }
  ]
}
```

## Deployment (Render)
- **Service**: futuregame (`srv-d6b8ujfgi27c73d5v3p0`)
- **Dashboard**: https://dashboard.render.com/web/srv-d6b8ujfgi27c73d5v3p0
- **Deploy**: `./deploy.sh` — builds, pushes to master, waits for Render deploy, syncs local DB → production (tournaments + venue colors). Prompts for admin credentials (or set `ADMIN_USER`/`ADMIN_PASS` env vars).
- **Auto-deploy**: pushes to `master` branch trigger deploy
- **Render config** stored at `.claude/projects/-Users-ethanibennett-WSOP-scheduler/render.env`
- **Fetch logs**: `curl -s -H "Authorization: Bearer $RENDER_API_KEY" "https://api.render.com/v1/logs?ownerId=tea-d6b8t3ali9vc73dcs4q0&resource=srv-d6b8ujfgi27c73d5v3p0&limit=100&direction=backward" | python3 -m json.tool`
- **Filter logs**: add `&text=ParseSchedule` (or any keyword) to filter
- **Render CLI**: `brew install render-oss/render/render` — installed, use `RENDER_API_KEY` env var for auth

## Database
- Schema created by `init-db.js` — tables: users, tournaments, user_schedules, tracking, live_updates, shared_schedules, satellites, password_resets
- `npm run seed` populates with sample WSOP tournament data
- sql.js loads entire DB into memory on startup, persists to disk on writes
