# Overnight Changes — Feb 27, 2026

Four parallel agents built the following features overnight. All work has been merged into master and verified working (zero JS errors, server starts clean).

---

## 1. Dashboard + Navigation Overhaul
**File:** `public/index.html` (+1,004 lines)

### What Changed
- **New bottom nav**: Home | Schedule | Staking | Social | More (replaced old 6-tab nav)
- **Dashboard view** ("Home" tab): What's Next, Running P&L, Quick Actions, Friends Playing
- **More menu**: My Schedule, Results & Tracking, Calendar View, Hand Replayer, Settings
- **Blind Level Estimator**: Estimates current blind level based on tournament start time + structure
- **Bagged/Conditional Logic**: "What's Next" section handles bagged chips and conditional events

### Guesses (Dashboard)
| # | Location | Guess | What I Did |
|---|----------|-------|------------|
| 1 | Blind Level Estimator | Standard WSOP blind structure approximation | Used a simplified structure starting at 100/200, doubling every level. Real WSOP structures vary by event. |
| 2 | Blind structure levels | Approximate WSOP blind structure | Hardcoded ~15 level breakpoints. May not match actual 2026 structures. |
| 3 | Level duration | Default 40 min when `level_duration` not set | Could be 30, 40, or 60 depending on event. |
| 4 | Starting chips | Default 20,000 when `starting_chips` not set | WSOP events range from 10K to 60K starting stacks. |
| 5 | P&L display | Shows all tracking data ungrouped | Could group by venue/series but kept it simple. |
| 6 | Quick Actions | POST UPDATE, LOG RESULT, SHARE, FIND EVENTS | Reasonable set but you may want different actions. |

---

## 2. Staking System Backend
**File:** `server.js` (+1,531 lines)

### What Changed
- **7 new database tables**: `staking_series`, `backers`, `backer_agreements`, `backer_event_overrides`, `backer_event_status`, `backer_settlements`, `backer_tokens`
- **23 API endpoints** covering full CRUD for series, backers, agreements, event status, settlements, tokens, and validation
- **9 backer types supported**: `standard`, `premium`, `budget_capped`, `profit_share_only`, `swap`, `crossbook`, `package`, `freeroll`, `custom`
- **Action validation**: `getActionSoldForTournament()` prevents >100% action sold per event
- **Settlement engine**: Auto-generates settlement calculations per backer type with markup handling
- **Private backer token links**: Backers get a unique URL (`/backer/:token`) to view their agreements
- **Rate limiting**: Staking endpoints get their own rate limiter (100 req/15min)

### Guesses (Staking)
| # | Location | Guess | What I Did |
|---|----------|-------|------------|
| 1 | Proof images | Stored as base64 data URIs, 2MB limit | Same pattern as avatar uploads. Could use file storage instead. |
| 2 | Profit share type | Doesn't count toward 100% action cap | Since no buy-in money is exchanged, seems right. Verify this. |
| 3 | Swap/crossbook types | Count `swap_my_pct` / `crossbook_my_pct` toward action sold | Player is giving away action in a swap. May need different logic. |
| 4 | Series deletion | Cascade delete all related data | Deleting a series removes backers, agreements, settlements. Could soft-delete instead. |
| 5 | App username linking | Look up user by username to link backers to app accounts | Auto-links if username matches. May want explicit invitation flow. |
| 6 | Backer deletion | Prevent if backer has active agreements | Forces user to remove agreements first. Could cascade instead. |
| 7 | Profit share losses | Profit share backers don't owe anything on losses | They only share upside, not downside. Verify this matches your model. |
| 8 | Settlement calc | Player owes backer `(return - investment)` if profitable | Standard staking math but verify with your specific formulas. |
| 9 | Budget cap | Cap total investment at budget cap, refund unused | Budget-capped backers have a spending limit. Refund logic may need tweaking. |
| 10 | Settlement persistence | Auto-generate by running GET calc, then persist to DB | Settlement is computed on-demand then saved when confirmed. |
| 11 | Proof images on backer view | Show proof images so backers can verify receipts | Backers see screenshots of results. Privacy concern — verify. |
| 12 | Event overrides | Full CRUD for per-event backer adjustments | Lets player opt-out backers from specific events or change terms. |

---

## 3. Hand Replayer
**Files:** `public/index.html` (+1,245 lines), `server.js` (+142 lines), `init-db.js` (+15 lines)

### What Changed
- **`saved_hands` table**: Stores hand data as JSON with game type, title, notes, public/private flag
- **6 API endpoints**: GET/POST/PUT/DELETE for `/api/hands`, plus GET `/api/hands/public`, GET `/api/hands/:id`
- **HandReplayerEntry component**: Full hand entry form with:
  - Player count (2-10), blinds/ante fields
  - Per-player name, position, stack inputs
  - Street tabs with card input (CardRow previews) for hero, opponents, board
  - Draw game discard tracking
  - Action buttons (fold/check/call/bet/raise) with amount
- **HandReplayerReplay component**: Step-through replay with:
  - Table felt visualization with pot, board cards, player seats
  - Action-by-action stepping with fold/winner/loser highlighting
  - Auto-play with speed control (0.5x / 1x / 2x / 4x)
  - Uses existing `evaluateHand`, `GAME_EVAL`, `HAND_CONFIG` for outcome display
  - Hi-lo split animation support
  - Share as PNG image via canvas
- **HandReplayerView component**: Main wrapper with list/entry/replay modes, game type pill selector
- **Accessible via More > Hand Replayer**

### Guesses (Hand Replayer)
No explicit GUESS comments, but notable design decisions:
- Hand data stored as JSON blob (flexible but not queryable)
- Public hands limited to 50 most recent
- Replay auto-play defaults to 1x speed
- Share image rendered at canvas resolution (may need size tuning for Instagram stories)

---

## 4. Social Overlays
**File:** `public/index.html` (+1,863 lines)

### What Changed
- **15 canvas drawing functions** for shareable poker graphics:
  - `drawChipStackStory` — 1080x1920 Instagram Story chip stack graph
  - `drawSeriesScorecard` — 1080x1080 stats card (P&L, ROI, cash rate, streak)
  - `drawDeepRunStandalone` — 1080x1080 deep run position visualization
  - `drawCountdownStory` — 1080x1920 next event countdown
  - `drawFinalTableCard` — 1080x1080 gold-accent Final Table card
  - `drawWrapSlide1` through `drawWrapSlide5` — 5 Spotify Wrapped-style story slides (Overview, Numbers, Best Moment, Game Mix, Fun Facts)
  - `drawMilestoneImage` — 1080x1080 milestone celebration
  - `drawPollEventVsEvent` — 1080x1920 "A vs B" event poll template
  - `drawPollOverUnder` — 1080x1920 over/under stack prediction poll
- **ShareMenu component**: Bottom-sheet with Scorecard, Countdown, Wrap-Up, Poll, Hendon Mob (placeholder) options
- **WrapUpViewer component**: Multi-slide Spotify Wrapped viewer with per-slide sharing and "Download All"
- **MilestoneCelebration component**: Modal popup on milestone detection (break-even, first-profit, career-high, game-best)
- **`detectMilestones()`**: Detects achievements from tracking data on save
- **`computeScorecardData()`**: Aggregates tracking entries for scorecard stats
- **Camera overlay**: New "Graph" button for stack graph overlay type
- **TrackingView integration**: Share button in header, ShareMenu + WrapUpViewer rendering

### Guesses (Social Overlays)
No explicit GUESS comments, but notable design decisions:
- All images rendered at 1080px width (Instagram standard) — may want 1080x1350 for feed posts
- "shonabish" hardcoded as watermark text
- Hendon Mob import is a placeholder (button exists, no implementation)
- Milestone detection runs on every tracking save — could be expensive with large datasets
- Wrapped slides assume data from single series — multi-series users may need filtering
- Poll templates generate static images (no interactive polling backend)

---

## What's NOT Done Yet
These items from your feature list were not assigned to agents:
- [ ] **Staking frontend UI** — backend is complete, but no React components for managing backers/series
- [ ] **Currency handling** — no CAD/MXN/PHP conversion in staking calculations
- [ ] **Apple/Google Sign-In** — still just email/password auth
- [ ] **Push notifications to backers** — no notification system
- [ ] **Backer auto-suggestion** for swaps/crossbooks — no matching logic
- [ ] **Instagram story video overlay** for hand replayer — canvas PNG only, no video
- [ ] **Hendon Mob import** — placeholder button exists, needs scraping/API integration
- [ ] **Privacy policy** — not created

---

## File Summary
| File | Lines Changed | What |
|------|--------------|------|
| `public/index.html` | +4,112 | Dashboard, Hand Replayer, Social Overlays, new nav |
| `server.js` | +1,673 | Staking backend (23 endpoints), Hand Replayer API (6 endpoints) |
| `init-db.js` | +15 | `saved_hands` table creation |

**Total: ~5,800 lines of new code across 3 files.**
