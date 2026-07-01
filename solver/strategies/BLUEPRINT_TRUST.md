# Blueprint Trust / Exploitability Report

Measured 2026-06-30. How exploitable is each trainer bot? Lower chips/hand = closer to
unexploitable (0 == Nash). All games are heads-up fixed-limit.

## Meters used
- **Particle-filter LBR** (`solver/lbr-draw.js` + `solver/lbr-draw-run.js`) — the principled,
  tight exploitability **lower bound** for the DRAW games (td27, badugi, a5td). Best-responds
  per public state via weighted opponent-hand particles; continuation = max{sigma, aggro};
  ships `max(particle-filter, fixed-exploiter)`. Run at 120 particles / 4000 hands/seat.
- **Fixed-exploiter LB** (`solver/exploitability.js`) — a looser **lower bound** for the STUD
  games (razz, stud8): the most any of three fixed strategies (station / maniac / rock) beats
  the blueprint by. There is **no principled stud LBR yet** — the particle-filter is draw-only
  (it reasons over hidden draw holdings), so stud is metered by fixed exploiters alone. This
  catches gross leaks but cannot certify near-optimality the way the draw LBR can.

Both meters are **lower bounds**: true exploitability is `>=` the reported number. A small
number is only trustworthy-as-near-zero for the draw games (the LBR is tight there); for stud a
small fixed-exploiter number means "no gross leak found," not "proven near-optimal."

## TRUST TABLE

| Game   | Exploitability (chips/hand) | Meter (bound)              | Iters     | Infosets | Iters/infoset | Trust verdict |
|--------|-----------------------------|----------------------------|-----------|----------|---------------|---------------|
| razz   | **0.000**                   | fixed-exploiter (LB, loose)| 1,000,000 | 69,177   | 14.5          | TRUST — beats all 3 fixed exploiters (maniac −8.2, station −4.4, rock −2.4); mature. Caveat: no stud LBR, so "no gross leak" not "proven Nash." |
| stud8  | **23.4**  (LB)              | fixed-exploiter (LB, loose)| 431,000   | 230,693  | **1.9**       | DO NOT TRUST — massive over-folding leak vs maniac (+23.4). Severely undertrained: largest infoset space, fewest iters (~1.9 visits/infoset). Needs a long grind. |
| td27   | **2.84**                    | combined (PF + fixed, LB)  | 1,885,000 | 136,359  | 13.8          | TRUST the number — re-confirmed 2.845 (known baseline ≈2.84). Real residual leak: maniac fixed-exploiter (2.84) still beats the PF bound (1.16); a few chips exploitable. Mature, usable. |
| badugi | **0.000**  (<=~0.2)         | combined (PF + fixed, LB)  | 1,752,000 | 42,212   | 41.5          | TRUST — re-confirmed 0.000 (known baseline ≈0). PF best-seat dev negative, fixed-exploiter 0; near the noise floor (±0.135 s.e.). Most mature blueprint. |
| a5td   | **0.000**  (<=~0.13)        | combined (PF + fixed, LB)  | 2,537,500 | 583,257  | 4.4           | TRUST — NEW: snapshot measured, all rollout deviations negative (sigma/aggro both lose to blueprint), PF floored at 0, fixed-exploiter 0; within noise (±0.125 s.e.). Largest infoset space but still hard to exploit. |

(a5td measured from a stable snapshot of the live-training file `/tmp/a5td_snapshot.json`,
copied before metering to avoid a partial-read race; iters/infosets per its meta at snapshot time.)

## Headline findings
- **razz, badugi, a5td: ~0 chips/hand — trustworthy bots.** Safe to ship as trainer opponents
  and as the EV/grade baseline.
- **td27: ~2.84 chips/hand — trustworthy number, mildly exploitable.** Known and stable; a
  competent human can win a few chips/hand off it but it is a solid blueprint.
- **stud8: ~23 chips/hand — NOT trustworthy yet.** This is the one bad bot. It over-folds to
  relentless aggression (the "maniac" exploiter wins +23/hand). Root cause is undertraining:
  431k iters over 230k infosets is only ~1.9 visits/infoset (every other game is 4–42x). The
  fix is more training iterations, not an abstraction change. Grades/EV-loss derived from this
  blueprint will be unreliable until it converges.

## Caveats on the meters
- All numbers are LOWER bounds; true exploitability is at least this large.
- Stud games have **only** the fixed-exploiter meter — a principled per-public-state stud LBR is
  still an open milestone. So stud's small razz number is "no gross leak found," and stud's large
  stud8 number is a real proven leak (a fixed strategy that demonstrably beats it by 23/hand).
- Draw LBR settings 120 particles / 4000 hands/seat give s.e. ≈ 0.12–0.17 chips/hand; the ~0
  numbers are statistically indistinguishable from zero, the 2.84 is well above noise.
