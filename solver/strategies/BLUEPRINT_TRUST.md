# Blueprint Trust / Exploitability Report

Measured 2026-06-30; razz row updated 2026-07-05 for the v2 hole-aware ship (`razz.json` is now
the v2 blueprint; the previous one is frozen at `razz.frozen-v1.json`). How exploitable is each
trainer bot? Lower chips/hand = closer to unexploitable (0 == Nash). All games are heads-up
fixed-limit.

## Meters used
- **Particle-filter LBR** (`solver/lbr-draw.js` + `solver/lbr-draw-run.js`) — the principled,
  tight exploitability **lower bound** for the DRAW games (td27, badugi, a5td). Best-responds
  per public state via weighted opponent-hand particles; continuation = max{sigma, aggro};
  ships `max(particle-filter, fixed-exploiter)`. Run at 120 particles / 4000 hands/seat.
- **Fixed-exploiter LB** (`solver/exploitability.js`) — a looser **lower bound** for the STUD
  games (razz, stud8): the most any of three fixed strategies (station / maniac / rock) beats
  the blueprint by. This catches gross leaks but cannot certify near-optimality.
- **Best-response stud LBR** (`solver/lbr-stud.js` + `solver/lbr-stud-run.js`) — the STUD
  analogue of the draw particle-filter, and now the principled stud meter the earlier "no stud
  LBR yet" caveat was waiting on. It best-responds at each of its own nodes against a
  reach-weighted posterior over the opponent's hidden down cards (reusing the trainer grader's
  belief primitives), continuation = max{sigma, aggro}, deviate-on-margin with CRN across
  actions; ships `max(LBR, fixed-exploiter)`. **KEY READ on gate (3):** for razz the fixed
  exploiter reports ~0 while this LBR reports several chips/hand — this is NOT a contradiction,
  it means **the LBR found a +EV deviation the crude station/maniac/rock exploiters cannot
  represent**. Verified genuine, not an argmax artifact: with margin=1000 (meter can never
  deviate ⇒ LBR≡σ) the measured deviation is 0.02±0.94 (unbiased machinery), and it rises
  monotonically as the margin drops (m=1→1.46, m=0.25→2.28), the signature of a well-gated LBR
  finding real leaks. This is the documented "HU blueprints play unrealistically aggressive"
  gap made measurable. NOTE: this meter measures the PURE HU blueprint WITHOUT dead-card
  conditioning (deadCards=[]), unlike the trainer; and at its shipped default range budget the
  7th street is MC-sampled, not exact — headlines need thousands of hands for a tight SE.

Both meters are **lower bounds**: true exploitability is `>=` the reported number. A small
number is only trustworthy-as-near-zero for the draw games (the LBR is tight there); for stud a
small fixed-exploiter number means "no gross leak found," not "proven near-optimal."

## TRUST TABLE

| Game   | Exploitability (chips/hand) | Meter (bound)              | Iters     | Infosets | Iters/infoset | Trust verdict |
|--------|-----------------------------|----------------------------|-----------|----------|---------------|---------------|
| razz   | **1.42** ± 0.24 (LB)        | best-response stud LBR (LB)| 2,000,000 | 80,404   | 24.9          | TRUST — v2 hole-aware bucket, shipped 2026-07-05. Best-response LBR 1.424 ± 0.241 chips/hand (lbr-stud, 3000 hands/seat, seed 12345); fixed-exploiter 0. The frozen v1 measured **3.509 ± 0.304 by the SAME meter** — the old headline "0.000" was the weaker fixed-exploiter bound, not a contradiction. v2 fixes the hole-blind 3rd/4th-street own-bucket (2-3-4 == J-Q-K, one infoset): hole-conditioned steal spread is now 69.2pp vs v1's flat 19.3pp (trash completes 17% vs 77%). |
| stud8  | **23.4**  (LB)              | fixed-exploiter (LB, loose)| 431,000   | 230,693  | **1.9**       | DO NOT TRUST — massive over-folding leak vs maniac (+23.4). Severely undertrained: largest infoset space, fewest iters (~1.9 visits/infoset). Needs a long grind. |
| td27   | **2.84**                    | combined (PF + fixed, LB)  | 1,885,000 | 136,359  | 13.8          | TRUST the number — re-confirmed 2.845 (known baseline ≈2.84). Real residual leak: maniac fixed-exploiter (2.84) still beats the PF bound (1.16); a few chips exploitable. Mature, usable. |
| badugi | **0.000**  (<=~0.2)         | combined (PF + fixed, LB)  | 1,752,000 | 42,212   | 41.5          | TRUST — re-confirmed 0.000 (known baseline ≈0). PF best-seat dev negative, fixed-exploiter 0; near the noise floor (±0.135 s.e.). Most mature blueprint. |
| a5td   | **0.000**  (<=~0.13)        | combined (PF + fixed, LB)  | 2,537,500 | 583,257  | 4.4           | TRUST — NEW: snapshot measured, all rollout deviations negative (sigma/aggro both lose to blueprint), PF floored at 0, fixed-exploiter 0; within noise (±0.125 s.e.). Largest infoset space but still hard to exploit. |

(a5td measured from a stable snapshot of the live-training file `/tmp/a5td_snapshot.json`,
copied before metering to avoid a partial-read race; iters/infosets per its meta at snapshot time.)

## Headline findings
- **razz: 1.42 ± 0.24 chips/hand by the principled best-response LBR — trustworthy bot**
  (v2 hole-aware bucket, 2026-07-05). Do not compare this number to the old "0.000": that was
  the loose fixed-exploiter bound, under which v2 also reads 0.000. Same-meter comparison:
  v2 1.424 vs v1 3.509 — the abstraction fix cut the proven exploitable gap ~2.5x.
- **badugi, a5td: ~0 chips/hand — trustworthy bots.** Safe to ship as trainer opponents
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
- Stud games now have the **best-response stud LBR** (`lbr-stud.js`, see Meters above) in
  addition to the fixed exploiters; razz's headline is that LBR (1.42 ± 0.24 at 3000 hands/seat).
  The stud8 row still shows the older fixed-exploiter reading (a real proven leak at the time it
  was measured; stud8 was since retrained — see the in-app GAME_TRUST for its current badge).
- Draw LBR settings 120 particles / 4000 hands/seat give s.e. ≈ 0.12–0.17 chips/hand; the ~0
  numbers are statistically indistinguishable from zero, the 2.84 is well above noise.
