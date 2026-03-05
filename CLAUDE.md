# WSOP 2026 Poker Tournament Scheduler

## Recent Changes
<!-- Update this section at the end of each work session so the next instance knows where things stand. Most recent first. -->
<!-- RULE: Before committing, always update this section with a summary of what changed in this session. -->
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

## Database
- Schema created by `init-db.js` — tables: users, tournaments, user_schedules, tracking, live_updates, shared_schedules, satellites, password_resets
- `npm run seed` populates with sample WSOP tournament data
- sql.js loads entire DB into memory on startup, persists to disk on writes
