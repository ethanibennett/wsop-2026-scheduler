# CFR Poker Solvers

Counterfactual-regret-minimization solvers and a quiz trainer for mixed
games that don't have commercial solvers: **2-7 Triple Draw**, **Badugi**,
and **Stud 8 or Better**. All games are heads-up fixed limit.

## Layout

| Path | Purpose |
|------|---------|
| `engine/mccfr.js` | External-sampling MCCFR with regret-matching+ and linear averaging |
| `engine/cards.js` | Card encoding (`(rank-2)*4+suit`), seedable RNG |
| `eval/low27.js` | Deuce-to-seven lowball evaluator (aces high, straights/flushes count against) |
| `eval/badugi.js` | Badugi evaluator (best distinct-rank/distinct-suit subset, aces low) |
| `eval/stud8.js` | 7-card hi evaluator + 8-or-better lo evaluator |
| `games/draw-game.js` | Shared heads-up limit triple-draw structure (blinds 1/2, bets 2/4, 3 draws, 4-bet cap) |
| `games/triple-draw-27.js` | 2-7 TD rules config: buckets, discard heuristic |
| `games/badugi-game.js` | Badugi rules config |
| `games/stud8-game.js` | Stud 8: antes, bring-in (low card, ace high), 5 streets, split-pot showdown |
| `games/kuhn.js` | Kuhn poker — engine validation only (known Nash value -1/18) |
| `train.js` | Training CLI |
| `spot.js` | Quiz spot generator used by `/api/solver/spot/:gameId` |
| `strategies/*.json` | Pre-trained average strategies served by the API |
| `tests/run-tests.js` | Evaluator tests, Kuhn convergence test, game invariants (`npm run test:solver`) |

## Training

```bash
npm run train -- --game td27 --iters 200000
npm run train -- --game badugi --iters 200000
npm run train -- --game stud8 --iters 200000
# options: --seed N, --out path, --min-mass ratio (prune rarely-visited infosets)
```

Training is external-sampling MCCFR: each iteration deals a hand, the
traverser explores all of its own actions while the opponent and chance
are sampled from the current strategy. The saved file maps infoset keys
to `{ a: [actions], p: [probabilities], m: visit-weight }`.

## Abstraction

Full game trees for these games are astronomically large, so infosets
are abstracted (this is what every practical poker solver does):

- **Betting history**: the current street's action sequence is kept
  exactly; earlier streets collapse to a quantized pot size. (Without
  this the infoset space exceeds memory within a few thousand
  iterations.)
- **2-7 TD hands**: pat hands by top two ranks (`P75`…`P87`, `P9-x`,
  `PT-x`, `PH`); draws by cards needed + top kept rank + deuce flag +
  straight-danger flag (`D17d`, `D28`, `D3`…). Opponent draw counts are
  public and kept exactly.
- **Badugi hands**: best playable subset size + high card (`B5`…`BH`,
  `T4`…`TH`, `W4`/`WH`, `X`).
- **Stud 8 hands**: own bucket = pair class × distinct low ranks ×
  ace/flush-draw/made-low flags; opponent bucket = visible board
  features (low cards, paired, ace up, suited, high cards).

Discards use heuristics (2-7: keep lowest distinct ranks; badugi: keep
the best sub-badugi), so "which cards to throw" is fixed per draw count
and the solver decides *how many* to draw plus all betting. Known
simplifications: suit composition is ignored when breaking 2-7 hands,
and snow lines are limited to standing pat.

## Trainer & viewer

The SPA's Hands tab (admin-gated) has three tools, toggled at the top:

- **Solver Trainer** (`SolverTrainerView`): the server plays a hand to a
  random decision point using the trained strategy and quizzes you; it
  then reveals the solver's mixed strategy and tracks how often you
  match its highest-frequency action.
- **Watch Solver** (`SolverPlayView`): the server plays a full hand with
  both seats sampling from the strategy (`solver/playout.js`) and returns
  the whole trajectory. The viewer steps through every decision — both
  hands shown face-up, the acting seat highlighted, the solver's mixed
  strategy drawn as frequency bars with the sampled action marked — with
  prev/next/autoplay controls and a hi/lo split-aware showdown summary.

Both reuse the app's theme tokens (CSS variables + Univers Condensed)
and a shared `SolverCard` chip.

API: `GET /api/solver/games`, `GET /api/solver/spot/:gameId` (quiz),
`GET /api/solver/playout/:gameId` (full self-play trajectory).
