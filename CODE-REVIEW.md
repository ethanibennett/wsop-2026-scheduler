# Code Review Report

Comprehensive audit of the WSOP 2026 Scheduler codebase. Organized by file with specific line numbers, descriptions, and suggested fixes.

---

## src/app.jsx (10,243 lines)

### 1. Dead Code / Commented-Out Blocks

| Lines | Issue | Fix |
|-------|-------|-----|
| 68-69 | Comment `// Debug: override "today" for testing via Settings page` is orphaned — the actual debug logic lives in utils.js. | Remove the orphaned comment or move it to utils.js. |
| 2610-2715 | `COMMON_FIRST_NAMES` (120+ entries) and `OCR_SUBS` array are baked into the main app file. These are only used by the TableScanner feature. | Extract to a separate `ocr-helpers.js` file to keep app.jsx focused on UI. |
| 2682-2697 | `WSOP_UI_NOISE` is a 70+ word Set of OCR noise words, also only used by TableScanner. | Move to same extracted file. |

### 2. Duplicated Logic

| Lines | Issue | Fix |
|-------|-------|-----|
| 810-816 | `formatChips()` is defined here, but an identical `formatChipAmount()` exists in replayer.jsx (lines 207-212). | Extract to utils.js and import from both files. |
| 910-913 | `ordinalSuffix()` duplicates `getOrdinal()` in utils.js (line 394-398). Both do the same thing with slightly different naming. | Keep one (in utils.js), remove the other, update all call sites. |
| 2478-2484 | `drawCropToFill()` is defined identically inside `CameraOverlay` (lines 2174-2184) and `RegistrationCameraFlow` (lines 2478-2484). | Extract to a shared utility function outside both components. |
| 2447-2454, 2060-2072 | `startCamera()`/`startCam()` pattern is duplicated between `CameraOverlay` and `RegistrationCameraFlow` with nearly identical logic. | Extract a shared `useCamera()` hook that both components consume. |
| 2530-2546, 2235-2262 | `handleShare()` is duplicated across both camera components with identical share/download fallback logic. | Consolidate into `shareOrDownloadCanvas()` (already exists in export.jsx but not reused here). |

### 3. Functions That Are Too Long

| Lines | Issue | Fix |
|-------|-------|-----|
| 965-1794 | `LiveUpdateButton` is ~830 lines. It manages 30+ useState calls, 4 tab modes, camera integration, registration flow, hand evaluation, and canvas drawing. | Break into sub-components: `LiveUpdateForm`, `HandTab`, `FinishTab`, `RegisterTab`. Extract state into a custom hook `useLiveUpdateState()`. |
| 5005-5350 | `TournamentsView` is ~350 lines with a deeply nested filter function (~80 lines of filter logic). | Extract filter logic into a `useFilteredTournaments(tournaments, filters, search)` hook. |
| 7700-8400 (approx) | `DashboardView` contains `renderEventCard()` as an inline function (~200 lines), plus friends/connections/P&L sections all in one render. | Extract `EventCard`, `FriendsSection`, `PLSummary`, `ConnectionsSection` as separate components. |
| 2050-2415 | `CameraOverlay` is 365 lines handling camera, gallery, overlay rendering, preview states. | Extract overlay preview rendering into a `CameraPreviewBar` component. |

### 4. Inconsistent Patterns

| Lines | Issue | Fix |
|-------|-------|-----|
| 2, throughout | The file mixes JSX (`<div>`) with `React.createElement()` calls (e.g., Avatar at line 775, CardRow at line 832). Some components use JSX exclusively, others mix both. | Standardize on JSX throughout since Babel standalone is already configured for it. |
| Throughout | Some components use `var` (lines 36, 219-227 in utils.js, 130-131 in replayer.jsx) while most use `const`/`let`. | Replace all `var` with `const`/`let` for consistency. |
| 925 | `const bbVal = Number(u.bb || u.bb);` — this is `u.bb || u.bb` which is redundant (likely was meant to be `u.bb || u.BB` or similar camelCase normalization). | Fix to just `Number(u.bb)` or check what the intended fallback was. |

### 5. Performance Issues

| Lines | Issue | Fix |
|-------|-------|-----|
| 1028-1056 | `todayTournaments` and `previousActive` both iterate `mySchedule` and are computed every render cycle. `previousActive` iterates `myActiveUpdates` inside a filter creating an O(n*m) lookup. | Build `bustedMap` once with `useMemo`, pass it to `previousActive` computation. |
| 1265-1300 | `handResult` re-evaluates poker hands on every keystroke in the hand input fields. For complex games like Omaha Hi-Lo, this involves C(4,2)*C(5,3) = 60 combinations per player. | Debounce evaluation or move it behind a "Calculate" button for multi-opponent scenarios. |
| 5110-5187 | The `filtered` useMemo inside TournamentsView runs on every `filters` or `search` change. The filter function checks 15+ conditions per tournament across the entire list. The sort also runs every time. | This is acceptable for the current dataset size but would benefit from a Web Worker if the tournament list grows significantly. |
| 388-392, 481-484 | `LateRegBar` and `MiniLateRegBar` both set up 30-second intervals with `setInterval`. If there are 50 visible events, that is 50 intervals ticking. | Lift the interval to a parent component or use a single shared timer via context. |

### 6. Variable Naming Issues

| Lines | Issue | Fix |
|-------|-------|-----|
| 925 | `const bbVal = Number(u.bb || u.bb);` — meaningless self-OR. | `const bbVal = Number(u.bb || 0);` |
| 1147 | `const ps = (v) => Number(parseShorthand(v)) || 0;` — `ps` is an unclear abbreviation for "parse shorthand". | Rename to `parseNum` or `toNumber`. |
| 12 | `let toastIdCounter = 0;` — module-level mutable counter. | This is fine functionally but could use a comment explaining why it is outside the component. |
| 5007-5008 | The filters state object has 20+ keys initialized in one literal. | Consider a `DEFAULT_FILTERS` constant and `useReducer` instead of `useState`. |

### 7. Overly Complex Logic

| Lines | Issue | Fix |
|-------|-------|-----|
| 1587-1626 | Game pill layout algorithm uses bitmask combinatorics to find optimal row arrangements. This is 30+ lines of layout logic for a simple pill grid. | Replace with CSS `flex-wrap: wrap` and let the browser handle layout, or use a simpler ceiling division. |
| 2699-2714 | `parseChips()` has multiple branches for K/M suffix handling with redundant checks. | Simplify: normalize suffix, multiply, format. |

### 8. Missing Error Handling

| Lines | Issue | Fix |
|-------|-------|-----|
| 1346-1354 | `openCamera()` fetch for stack history uses bare `catch {}` — silently swallows errors. | At minimum log the error: `catch(e) { console.error('Stack history fetch failed:', e); setStackHistory([]); }` |
| 9800-9817 | Multiple API calls use `catch { setError('Failed to...') }` without logging the actual error. | Add `catch(e) { console.error(e); setError(...); }` to aid debugging. |
| 1302-1342 | `shareHandImage()` catches errors but only logs to console. User sees no feedback if sharing fails. | Add a toast notification on error. |

### 9. GUESS Comments

| Lines | Issue | Fix |
|-------|-------|-----|
| 323, 337 | `// GUESS: Standard WSOP blind structure approximation` and `// GUESS: Approximate WSOP blind structure` — redundant comments. | Keep one, document the approximation assumptions more clearly. |
| 7759 | `const startingChips = event.starting_chips || 20000; // GUESS: default starting stack` | Replace magic number with a named constant: `const DEFAULT_STARTING_STACK = 20000;` |

### 10. Hardcoded Admin Checks

| Lines | Issue | Fix |
|-------|-------|-----|
| 10076, 10120, 10158 | Admin access checked via `['ham', 'ham5'].includes((username || '').toLowerCase())`. This pattern is repeated 3 times in the frontend and multiple times in server.js. | Create an `isAdmin(username)` utility function in both frontend and backend. |

---

## server.js (6,747 lines)

### 1. Dead Code / Legacy Migrations

| Lines | Issue | Fix |
|-------|-------|-----|
| 760-1600+ | The `dataMigrations` array contains 30+ migration entries, many of which are one-time data fixes from February/March 2026 (e.g., `tch-normalize-names-2026-02`, `ipo-dedup-stale-2026-02`, `fix-1149-buyin-2026-03`). Once applied, they never run again but add 800+ lines of dead code. | Move completed migrations to an archive file or delete them. Keep the migration framework but remove one-time fixes that have already been applied to all environments. |
| 1565-1600+ | The `ipo-full-rebuild-2026-03` migration contains ~100 lines of hardcoded event data as array literals. | This data should live in the JSON seed files, not inline in server.js. |
| 186-194 | `serveIndex()` re-reads `index.html` from disk on every request using synchronous `fs.readFileSync`. | Read once at startup and cache. The `BUILD_VERSION` is already a constant so there is no reason to re-read. |

### 2. Duplicated Logic

| Lines | Issue | Fix |
|-------|-------|-----|
| 4008-4026, 4051-4066 | The schedule query with LEFT JOIN on conditions is written identically in two endpoints (`GET /api/schedule/:userId` and `GET /api/shared/:token`). | Extract to `function getScheduleForUser(userId)` and call from both routes. |
| 4219-4249, 4257-4276 | `POST /api/tracking` and `PUT /api/tracking/:entryId` share nearly identical column sets and update logic. | Extract shared validation and column mapping. |
| 4293-4391 | `POST /api/live-update` has a massive INSERT statement with 20+ fields, then immediately rebuilds the same data as a broadcast object. | Build the data object once, destructure for both INSERT and broadcast. |
| 6440-6455, 6419-6438 | Two separate admin user-listing endpoints (`/api/admin/users` with API key auth and `/api/admin/users-list` with JWT auth) return nearly the same data. | Consolidate into one endpoint with flexible auth. |

### 3. Functions That Are Too Long

| Lines | Issue | Fix |
|-------|-------|-----|
| 377-755 | `initDatabase()` is ~380 lines. It creates tables, runs 20+ ALTER TABLE migrations, seeds data from JSON files, and runs data migrations. | Split into `createTables()`, `runMigrations()`, `seedData()`. |
| 4293-4391 | Live update POST handler is ~100 lines with parameter extraction, validation, INSERT, broadcast to buddies, and broadcast to groups. | Extract `broadcastLiveUpdate(userId, tournamentId, data)` helper. |

### 4. Inconsistent Patterns

| Lines | Issue | Fix |
|-------|-------|-----|
| 6465 | Uses `persist()` (undefined function) instead of `await saveDatabase()`. | Replace with `await saveDatabase()`. This is likely a bug. |
| 93-103 | CORS handler allows all origins regardless (`callback(null, true)` in both branches) and just logs unlisted origins. The `ALLOWED_ORIGINS` check is effectively dead code. | Either enforce the allowlist or remove the check entirely. Comment says "tighten later" -- do it now or remove the pretense. |
| 509-548 | Migration error handling uses `try/catch(e) { // ignore }` extensively. Some migrations log errors, others silently swallow them. | Be consistent: always log migration errors even if they are expected (column already exists). |

### 5. Missing Error Handling

| Lines | Issue | Fix |
|-------|-------|-----|
| 12 | `const { PDFParse } = require('pdf-parse');` — this destructuring may fail silently if pdf-parse does not export `PDFParse`. | Verify the import matches the library's actual export. pdf-parse typically exports a default function, not a named `PDFParse`. |
| 6652-6725 | The table scanner endpoint sends user-uploaded images directly to Claude Vision API without size validation beyond multer's 20MB limit. | Add image dimension validation and consider compressing before sending to API. |

### 6. GUESS Comments

| Lines | Issue | Fix |
|-------|-------|-----|
| 4551, 4572-4573, 4738, 4794, 4868, 5503, 5539, 5544, 5563, 5599, 5791, 5886 | 12 `GUESS` comments throughout the staking system endpoints. These indicate uncertainty about business logic. | Resolve each GUESS by confirming the business rule, then replace GUESS with a standard comment explaining the confirmed behavior. |

### 7. Security Concerns

| Lines | Issue | Fix |
|-------|-------|-----|
| 206-226 | The Hendon Mob redirect endpoint scrapes DuckDuckGo HTML and follows redirects. No input sanitization on the `name` parameter beyond URL encoding. | Add input length validation and rate limiting to prevent abuse. |
| 228-229 | `hendonCache` grows unbounded. Every unique name lookup is cached forever. | Add a TTL or LRU eviction to the cache (e.g., max 1000 entries). |
| 6419-6437 | Admin endpoint uses query parameter `key` for authentication (`req.query.key`). API keys in query strings appear in server logs and browser history. | Use Authorization header instead. |

---

## public/js/utils.js (537 lines)

### 1. Dead Code

| Lines | Issue | Fix |
|-------|-------|-----|
| 493-537 | Lines 493+ export many functions to `window.*`. Several of these (`window.VARIANT_COLORS`, `window.MULTI_GAME_MAP`) are lookup tables that could be frozen to prevent accidental mutation. | Add `Object.freeze()` to exported config objects. |
| 157-174 | `VENUE_BRAND_VAR` mapping is defined but only used by `getVenueBrandColor()`. The brand colors duplicate information already in `VENUE_MAP` (lines 129-151). | Consider merging brand color info into VENUE_MAP to have a single source of truth for venue metadata. |

### 2. Duplicated Logic

| Lines | Issue | Fix |
|-------|-------|-----|
| 300-326 | `parseTournamentTime()` calls `parseDateTime()` which duplicates much of the time-parsing logic in `parseDateTimeInTz()` (lines 243-280). Three separate date/time parsers exist with overlapping functionality. | Consolidate into one robust parser that optionally accepts a timezone parameter. |
| 377-391 | `formatBuyin()` and `calculateCountdown()` both call `parseDateTimeInTz()` or `parseDateTime()` with the same venue-dependent branching. | Extract a single `getTournamentStartMs(t)` function. |
| 394-398, 910-913 (app.jsx) | `getOrdinal()` in utils.js and `ordinalSuffix()` in app.jsx are the same function. | Remove one. |

### 3. Inconsistent Patterns

| Lines | Issue | Fix |
|-------|-------|-----|
| Throughout | Uses `var` declarations (lines 36, 219-227, etc.) while app.jsx mostly uses `const`/`let`. | Migrate to `const`/`let`. |
| 467-490 | `detectConflicts()` returns `{ conflicts, expectedConflicts }` as Sets, but only `conflicts` is used for warning display. `expectedConflicts` appears unused in the current UI. | Verify if `expectedConflicts` is consumed anywhere; if not, simplify the return. |

---

## public/js/poker-engine.js (466 lines)

### 1. Performance Issues

| Lines | Issue | Fix |
|-------|-------|-----|
| 31-38 | `combinations()` generates all C(n,k) combinations as arrays. For Omaha Hi-Lo evaluation, this runs C(4,2)*C(5,3)*2 = 120 evaluations per player. | For the current use case this is fine, but consider memoizing or caching for repeated evaluations with the same cards. |
| 100 | `Math.pow(P, 5)` is called for every hand score. | Use a precomputed array: `const P_POW = [1, 15, 225, 3375, 50625, 759375];` |

### 2. Dead Code

| Lines | Issue | Fix |
|-------|-------|-----|
| 342-436 | `evaluateHand()` (the original 2-player version) exists alongside `evaluateShowdown()` (the multi-player version at lines 221-325). The 2-player version is used in the live update hand tab, but its logic is a subset of the showdown evaluator. | Consider deprecating the 2-player version and using `evaluateShowdown()` with a 2-player input everywhere. |
| 439-465 | `assignNeutralSuits()` is a utility for handling face-down cards. It is only used in app.jsx for the live update hand evaluation. | Move to app.jsx or a shared utility since it is not part of the core poker engine. |

### 3. Variable Naming

| Lines | Issue | Fix |
|-------|-------|-----|
| 57 | `let cat, kickers, name; let shortName;` — `cat` is unclear. | Rename to `handCategory` or `handRank`. |
| 24-28 | `RANK_VAL`, `RANK_NAME`, `RANK_WORD`, `RANK_SHORT` — four parallel rank lookup tables. | Consider a single `RANKS` object: `{ 2: { val: 2, char: '2', word: 'Two', short: '2' }, ... }` |

---

## src/replayer.jsx (4,087 lines)

### 1. Duplicated Logic

| Lines | Issue | Fix |
|-------|-------|-----|
| 207-212 | `formatChipAmount()` duplicates `formatChips()` from app.jsx. | Import from shared location. |
| 264 | `DEFAULT_OPP_NAMES` — hardcoded list of 8 opponent names. | Move to a constants file. Not a big deal, but it is domain data mixed with component code. |
| 295-327 | `calcPotsAndStacks()` performs pot/stack calculation with blind posting logic. This is complex game-specific logic embedded in a UI file. | Extract to poker-engine.js alongside the evaluation functions. |

### 2. Functions That Are Too Long

| Lines | Issue | Fix |
|-------|-------|-----|
| 330-500 | `HandReplayerEntry` has a 170-line `bettingContext` useMemo that tracks all betting state. | Extract to a `useBettingContext(hand, currentStreetIdx, gameCfg)` custom hook. |
| Entire file | The replayer.jsx file defines 15+ components and utility functions in a single file at 4,087 lines. | Split into: `replayer/HandEntry.jsx`, `replayer/HandViewer.jsx`, `replayer/GameBuilder.jsx`, `replayer/utils.js`. |

### 3. Inconsistent Patterns

| Lines | Issue | Fix |
|-------|-------|-----|
| 1, 130-131 | Uses `var` in some places (lines 36 in getPositionLabels, 49-63 in getActionOrder, etc.) but `const`/`let` elsewhere. | Standardize on `const`/`let`. |

---

## src/export.jsx (2,660 lines)

### 1. Duplicated Logic

| Lines | Issue | Fix |
|-------|-------|-----|
| 4-135 | `drawDeepRunOverlay()`, `drawFinalTableOverlay()`, `drawCountdownOverlay()` all follow the same pattern: compute bar dimensions, fill background, draw text lines with canvas API. Each one manually calculates `barH`, `barY`, `padX`. | Extract a `OverlayBar` helper that handles the common bar setup and provides a callback for drawing content within it. |
| 244-285 | `drawShareBackground()`, `drawWatermark()`, `roundedRect()` are shared helpers but are only in export.jsx. They are also used conceptually (but re-implemented) in app.jsx's camera overlays. | Move to a shared `canvas-utils.js` and import everywhere. |
| 309-319 | `VENUE_CANVAS_COLORS` duplicates venue color data from `VENUE_MAP` in utils.js and `PDF_VENUE_COLORS_DARK`/`PDF_VENUE_COLORS_LIGHT` defined later in the same file. Three parallel color maps. | Unify into one source of truth with a function that returns the right variant for the context (CSS, canvas, PDF). |

### 2. Functions That Are Too Long

| Lines | Issue | Fix |
|-------|-------|-----|
| 347-700+ | `generateSchedulePDF()` is 350+ lines handling font loading, theme colors, table building, page layout, totals, and footer. | Extract `drawPDFTitle()`, `buildPDFRows()`, `drawPDFFooter()` helpers. |

### 3. Missing Error Handling

| Lines | Issue | Fix |
|-------|-------|-----|
| 322-344 | `loadPDFFonts()` fetches fonts from CDN. If one font fails, all fail. | Fetch independently with individual fallbacks so a missing condensed font does not prevent PDF generation with the serif font. |

---

## src/social.jsx (999 lines)

### 1. Inconsistent Patterns

| Lines | Issue | Fix |
|-------|-------|-----|
| 121-178 | The search bar dropdown has 50+ lines of inline styles. | Move to CSS classes in styles.css. |
| 194-200 | `timeAgo()` is defined inline inside the component render scope. It is recreated on every render. | Move outside the component or wrap in `useCallback`. Since it has no dependencies, it should be a module-level utility. |

### 2. Missing Error Handling

| Lines | Issue | Fix |
|-------|-------|-----|
| 28-37 | `handleSearchChange()` catches errors with bare `catch {}`. | Log the error at minimum. |
| 40-53 | `handleSendRequest()` catches with bare `catch {}`. | Same fix. |

---

## src/staking.jsx (1,099 lines)

### 1. Missing Error Handling

| Lines | Issue | Fix |
|-------|-------|-----|
| 41-53 | `useEffect` data fetch uses `try { ... } catch {}` with completely empty catch block. If the API calls fail, the user sees a loading spinner forever or empty data with no feedback. | Add error state and display it: `catch(e) { setError('Failed to load settings'); setLoading(false); }` |
| 83-101 | `handleSave()` has the same empty catch pattern. | Same fix. |

### 2. Duplicated UI Patterns

| Lines | Issue | Fix |
|-------|-------|-----|
| 130-164, 168-200 | The "sell %" tab and "markup" tab render nearly identical grids of tier inputs and game-type inputs. The only difference is the label, step value, and which getter/setter is called. | Extract a `TierInputGrid` component that accepts the getter, setter, label, and step as props. |

---

## public/styles.css (5,516 lines)

### 1. Unused / Redundant CSS

| Lines | Issue | Fix |
|-------|-------|-----|
| 3197-3232 | Venue-branded chip styles for `.venue-wynn.cal-venue-chip`, `.venue-aria.cal-venue-chip`, `.venue-golden-nugget.cal-venue-chip`, `.venue-resorts-world.cal-venue-chip`, `.venue-south-point.cal-venue-chip`, `.venue-orleans.cal-venue-chip`, `.venue-mgm-grand.cal-venue-chip` — these venues were removed from the database by migration `remove-non-wsop-venues-2026-03` (server.js line 1531). | Remove CSS for deleted venues. Keep only venues that still exist in the data (WSOP, IPO, TCH, Turning Stone, WSOP Europe, Caesars, Seminole Hard Rock, Personal). |
| 3233-3237 | `.venue-strip-wsop` light mode inversion exists but may no longer be used if venue strips were replaced by venue chips. | Verify usage; remove if dead. |
| 3239 | `/* saved indicator removed -- saved state shown by venue-colored border */` — orphaned comment describing a previous refactor. | Remove the comment. |

### 2. Duplicated Venue Color Definitions

| Lines | Issue | Fix |
|-------|-------|-----|
| 43-80, 82-115, 117-151, 153-187 | Venue brand CSS variables are defined 4 times: once for `:root` (dark), once for `[data-theme="light"]`, once for `[data-theme="dusk"]`, and once for `[data-theme="cloudy"]`. The dusk theme comment says "same as dark mode" and cloudy says "full saturation for light variant". | Use CSS custom property inheritance. Define venue colors in `:root` and only override in themes where they differ. Dusk can inherit from `:root` since they are the same. |

### 3. Overly Specific Selectors

| Lines | Issue | Fix |
|-------|-------|-----|
| 527-533 | `:is([data-theme="light"],[data-theme="cloudy"]) .card-row .card-unknown` — the `:is()` pattern is repeated dozens of times for light-mode overrides. | Consider adding a `[data-theme-family="light"]` attribute (set via JS alongside data-theme) so all light-variant overrides use one selector. |

### 4. Inline Style Proliferation

This is a codebase-wide issue rather than a CSS issue per se, but it is worth noting: many components in app.jsx, social.jsx, staking.jsx, and replayer.jsx use extensive inline `style={{}}` objects (50+ properties in some cases, e.g., social.jsx lines 121-178). This makes the styles impossible to override with themes and creates render performance overhead from object allocation.

**Fix:** Move repeated inline styles to CSS classes in styles.css.

---

## Cross-Cutting Issues

### 1. Monolithic File Architecture

The main app.jsx is 10,243 lines containing 40+ React components, utility functions, canvas drawing code, OCR helpers, game logic, and animation utilities. This is the single biggest maintainability issue.

**Fix:** Break into modules:
- `components/LiveUpdate.jsx` (lines 965-1794)
- `components/Camera.jsx` (lines 2050-2608)
- `components/TableScanner.jsx` (lines 2610-2900)
- `components/Dashboard.jsx` (lines 7500-8400)
- `components/TournamentsView.jsx` (lines 5003-5350)
- `canvas/overlays.js` (all `draw*Overlay` functions)
- `hooks/useCamera.js`, `hooks/usePullToRefresh.js`, `hooks/usePinchZoom.js`

### 2. Global State via window Object

Utils.js exports 30+ functions and constants to `window.*` (lines 493-537). This creates implicit coupling and makes it impossible to tree-shake unused code.

**Fix:** Use ES modules or at minimum a namespace: `window.WSOPUtils = { ... }`.

### 3. No Build Step Implications

The architecture note in CLAUDE.md says "no build step" — the app runs via Babel standalone. This means:
- No tree-shaking (all 32K lines are parsed by the browser)
- No code splitting
- No TypeScript type checking
- No minification in production

This is a deliberate architectural choice, but it significantly limits the effectiveness of the other cleanup suggestions. If a build step is ever introduced, all of the above file-splitting suggestions become straightforward module imports.

### 4. Inconsistent `var` vs `const`/`let`

Files use a mix of `var` (especially utils.js, poker-engine.js, and parts of replayer.jsx) and `const`/`let` (app.jsx, export.jsx). There are approximately 50+ `var` declarations across the codebase that should be modernized.

### 5. Empty catch Blocks

At least 15 instances of `catch {}` or `catch { }` across all JS files where errors are silently swallowed. Every one of these should at minimum log the error to console.

---

## Summary: Priority Ranking

**High Priority (code correctness / bugs):**
1. server.js line 6465: `persist()` is undefined -- should be `await saveDatabase()`
2. app.jsx line 925: `Number(u.bb || u.bb)` -- redundant self-OR, likely a bug
3. server.js line 12: Verify `PDFParse` destructured import matches pdf-parse library export
4. server.js line 93-103: CORS allowlist is not enforced (both branches allow)

**Medium Priority (maintainability):**
1. Break up LiveUpdateButton (830 lines) into sub-components
2. Extract completed data migrations from server.js (800+ lines of dead code)
3. Consolidate the 3 duplicate date/time parsers in utils.js
4. Remove CSS for deleted venues (Wynn, Aria, Golden Nugget, etc.)
5. Consolidate duplicate `formatChips()`/`formatChipAmount()` and `ordinalSuffix()`/`getOrdinal()`

**Lower Priority (code quality):**
1. Replace `var` with `const`/`let` throughout
2. Add error logging to all empty catch blocks
3. Move inline styles to CSS classes
4. Extract OCR helpers from app.jsx
5. Resolve all GUESS comments in staking endpoints
