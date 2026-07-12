# Derived full-ring 3rd-street ENTRY RANGE — implementation spec

Replaces the two HAND-TUNED entry approximations with ONE game-theoretically
derived object `P*(h | m)` = P(voluntarily enter | 3-card start, contest size m):
1. the ORACLE opponent-range prior (grade.js `entryPrior` / `RAZZ_ENTRY_W` / `STUD8_ENTRY_W`);
2. the razz3 multiway solver's biased ROOT DEAL (razz3-game.js `positionalPrior` geometric door decay).

Design: workflow `wf_583effdb` (4 methods → synthesize → 4-lens adversarial critique → finalize).
Directive: [[feedback-solve-dont-handtune]] — DERIVE, never hand-tune a weight table or ask the pro for VPIP.

## Method — equity fixed point on the SCALAR entering-mass map
- Enter iff `E[multiwayShare(h) * pot] - c >= 0`  ⇔  `E[share(h)] >= E* = c/pot`.
  Threshold on the TRUE split share (not a share cutoff) auto-penalizes reverse-quartered
  one-way stud8 hands. For razz (non-split) it reduces to `share >= E*`.
- Fixed point iterated on the **scalar mass** `p = Φ(p)` = fraction of the 22,100 starts whose
  split-share EV vs the top-p self-consistent field clears 0. (The per-hand `[0,1]^H` set-lattice
  proof is UNSOUND — hero equity depends only on the normalized opp dist, so bumping a strong
  hand LOWERS hero equity; isotonicity fails. The 1-D map IS monotone: looser field → weaker
  marginals → higher clearing count. Existence by IVT.)
- Start `w0=1` (enter-all, weakest field) → monotone-decreasing chain → GREATEST fixed point
  (maximal participation consistent with pot odds; correct for a PRIOR). Measure `Φ'(p*)` by
  finite diff; **assert |Φ'|<1** (uniqueness gate); surface multiplicity as a finding.
- Stochastic approximation (MC is noisy): `w_{t+1}=(1-α_t)w_t + α_t·σ_t`, `σ_t=logistic(EV_t/τ)`,
  τ = measured MC std-error (NOT tuned), α_t Robbins-Monro (Σα=∞, Σα²<∞). Stop on continuous
  mass `|p_t - p_{t-1}| < 1e-3` (never on 0/1 flips). Freeze hands only in the last 1-2 iters vs
  the TIGHTENED field. Per-iter guardrail: aggregate equity non-increasing as field tightens.

## DONE (built + tested, `solver/entry/entry-core.test.js` 9/9)
- `equity.js multiwayShare(game, hero7, [opp7...])` — EV-exact k-way split share (exported).
- `solver/entry/economics.js potAndCost({m, action, antes})` — reads ANTE/BRING/SMALL/ANTES/NSEAT
  from razz3-game.js. `E*_open = SMALL/(ANTES·ANTE + m·SMALL) = 4/(8+12) = 0.20`;
  `E*_bringin = (SMALL-BRING)/… = 2/20 = 0.10`; `E*(m=2,open)=0.25`. Locks to utility() pot accounting.
- razz3-game.js now also exports `NSEAT` (and already had `UNIFORM_PRIORS` for the deal fix).

## TODO
3. `solver/entry/equity-fixed-point.js` — enumerate `allHands(3)` (EXPLOIT ISOMORPHISM: razz depends
   only on the 3 ranks → ~O(hundreds) not 22,100; stud8 by suit-pattern). Field weight w(h); sample
   from `P(contest)=max(w(h), forcedBringInMass(h))` (highest-door seat always present, never P=0).
   MC EV per hand (M grows 2000→8000, CRN across iters), Robbins-Monro update, scalar-mass convergence.
   **COMPUTE-HEAVY offline batch** — run detached like the grinds; emit `pEnter.<game>.m<m>.json` for m∈{2,3}.
4. `solver/entry/validate-entry.js` — the gates (razz: A-2-3→1.0, 2-2-5→~0, K-Q-9 voluntary→~0 but
   P(contest)>0 as forced bring-in, (A-2)K-door softened & ≤ CFR continuation; stud8: 3-3-3→1.0,
   A-2-4→1.0, bare-low-in-baby-field→FOLD (reverse-quarter, the key stud8 gate), (K-K)4→marginal,
   K-Q-9→~0; monotonicity in low strength; range WIDENS antes 6→8 with zero re-tuning; |Φ'|<1; VPIP a
   REPORTED DIAGNOSTIC only, never a gate that selects a constant).
5. Wire consumer 1 (oracle): grade.js — DELETE entryPrior/RAZZ_ENTRY_W/STUD8_ENTRY_W; multiply each
   opp holding's blueprint reach by `P*(h | m of the subgame)` (m=2 HU 7th resolver, m=3 grade7). For
   RAZZ where the uniform/IW CFR exists, feed the ACTION-CONDITIONED street-0 strategy instead of a scalar.
6. Wire consumer 2 (razz3 deal): thread `priors: UNIFORM_PRIORS` through train3.js `makeGame` + gameDesc.opts;
   short-circuit newHand's 40-try door-rejection when uniform (keep the 15-card foldedBurn). Re-grind. Optional
   variance-optimal: deal `q(h)∝max(P*(h|3),ε)` with importance weight `p_uniform/q` (IW-invariant equilibrium).
7. Razz-only one-shot CFR cross-check (NOT an outer loop — IW-invariance makes that a no-op): read endogenous
   `c_full` off the converged tree → tighter threshold; read `P_CFR(enter)=1-reach-weighted-fold` and replace
   marginal buckets. cap-3 grind checks the cap-2 ceiling isn't itself too loose.

## RISKS (honest, from the finalize)
Horizon asymmetry (full-runout equity vs single 3rd-street c) → E*=0.20 is the WIDE end by design;
CFR c_full tightens razz, stud8 ships loose on foldable draws (no stud8 multiway solver yet → prior-only,
low-confidence at the margin, reverse-quarter gate is its only guard). cap-2 CFR under-models raise wars.
foldedBurn removes 15 RANDOM cards but real folders hold high cards (second-order card-removal inconsistency).
3-player CFR is coarse-correlated not certified-Nash → ship behind the per-seat BR error-bar gate.
Full spec (verbatim finalize) archived from workflow task `wu4akb0gi`.
