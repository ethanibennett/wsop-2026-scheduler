# Plan of Record — Continual-Resolving Player + Oracle (2026-07-02)

Supersedes `ROADMAP-2026-06-18-superseded.md`. Synthesized from a 3-design judge panel
(unanimous verdict: Design A "incremental-certainty" wins, with Design B's theory corrections
and Design C's delivery machinery grafted in). North star: an optimal ≤3-players-per-hand
6-8-max solver/trainer, better than any human, both practice opponent and grading oracle,
with PUBLISHED measured trust floors.

## Architecture: one engine, two planes, four trust tiers

- **Frozen reference:** `solver/neural/resolve.py` (pure-python range-form CFR+, GameSpec seam,
  leaf_value_fn contract, exact 7th showdown, `root_action_ev`). No perf work ever lands here.
- **Speed path:** numpy backend (`resolve_fast`), permanently gated by an equivalence suite
  vs the reference (value 1e-6, freqs 1e-3, exploitability 1e-4).
- **Private-chance primitive:** `resolve_draw2.py`'s brute-force-certified PROJ/PROJ^T reach remap —
  reused for ALL private-card boundaries, including stud's 6th→7th down card (structurally identical).
- **Two planes:** ORACLE = high iters, CFR-D gadget on, exact rungs preferred, certified-net leaves
  only, async allowed, realism never touches it. OPPONENT = same resolver ~400 iters with node-locked
  blueprint realism priors. Blueprints are permanently demoted to realism priors + range carriers —
  never the grading standard, never labeled GTO.
- **Trust tiers, displayed per grade in the GUI:** EXACT / CERTIFIED-NET / LADDERED / FIELD, with
  subgame exploitability ε, self-consistency gauge, provenance label, and the 3-prior sensitivity
  flag (grades that flip across opponent-range priors are flagged "range-sensitive", not charged).
- **Certification currency is CHIPS, not R²:** a net earns grading rights only via an end-to-end gate —
  depth-limited resolve with net leaf vs the exact solve of the same spot, ≥500 board-disjoint spots,
  mean abs grade error ≤0.25 small bets, ZERO flips of big-mistake grades (>1 SB). Board-disjoint R²
  is monitoring-only; same-board R² is disqualified as evidence.

## Milestones (clock: 2026-07-03; steering rule: every 2 weeks re-rank (game×street) cells by logged EV-loss×hands — M5-M8 order is a default, not a contract)

- **M0 (days 1-4) — ship what's built:** 7th-street oracle Pro mode to prod (`ORACLE_PYTHON=python3`);
  razz-v2 hole-aware blueprint when the retrain lands. GATE: 20 live prod grades bit-match local;
  self-consistency within the 300-iter noise bound.
- **M1 (wk 0-2) — substrate integrity:** (a) deal-leaf fix (CONFIRMED 2026-07-02: `resolve.py:361`
  evaluates the net leaf PRE-deal with the current street's board, `datagen.py:81` trains on POST-deal
  street roots — all pre-fix net-leaf validation numbers are VOID; the shipped exact 7th oracle is
  untainted). Fix = sampled-deal leaf in `net_leaf.py`: M≈32 joint next-street deals, card removal on
  both reaches, batch-call the street-(s+1) net post-deal, CRN across CFR iterations.
  (b) numpy backend + equivalence gate + measured ≥5x. (c) restart the 7th datagen daemon ONLY after
  a verified-restorable off-box backup exists (the corpus was deleted once).
- **M2 (wk 1-2) — exact draw endgame rungs:** post-last-draw exact oracle for badugi/td27 via
  root_action_ev + draw GameSpecs over particle-filter support (td27 NEVER at full width —
  C(47,5)≈1.5M is infeasible; reduced-deck exactness gates, stated honestly). First blocker-aware
  exact draw grades ever. Pure-python, prod-compatible.
- **M3 (wk 1-3) — CFR-D gadget + belief carrier:** ~50-80-line terminate-or-enter gadget + carry.py
  (r ∝ r ⊙ σ(a|·), collision zeroing, PROJ[k]·r on observed draw counts, opponent CFVs per DeepStack).
  GATE (exact): gadget re-solve of an exactly-solved game reproduces root value/strategy ≤1e-3.
  No chained re-solve grades anyone before this is green. Unsafe range re-solving is permitted ONLY
  for the opponent role, never the oracle.
- **M4 (wk 2-5) — exact 6th, fast:** resolve_stud6 PROJ lift (universe C(unseen,3), H≈8-15k,
  mmap-shared float32 share matrices) on the numpy path; plan 10min-2h/solve. GATE: matches
  `_exact_6th_to_7th` to 1e-6 on every guard-allowed board. Ships via the nightly i9 batch re-grade
  channel + async deep-grade queue. Starts perpetual exact-6th label datagen (10-25k labels / 3 wk).
- **M5 (wk 4-7) — certified 6th net:** trained on M4 exact labels via the post-fix pipeline;
  certify.py chips-gate above. Fail → the exact async tier keeps grading; the product does not stall.
- **M6 (wk 5-9) — draw nets (M2b continuation):** bucket_draw = made-class × draw-to-class × blocker
  composition; per-round discard-count one-hots in encode_pbs (discards/blockers = the upcard analogue).
  Bucketed PROJ certified vs exact PROJ on small decks BEFORE trust. Same certify.py harness.
- **M7 (wk 6-10) — continual re-solving + opponent upgrade:** continual.py (uses M3 gadget) +
  solve_server.py + GUI. Live prod opponent = blueprint splicing at top-K telemetry leak nodes,
  gated by FULL-GAME exact BR: ≥50% exploitability cut at refined nodes, zero regression elsewhere.
  Resolver-opponent gates: LBR meters ≤ blueprint's numbers; ≥+1 chip/hand vs blueprint over 100k
  duplicate-dealt hands, CI excluding 0.
- **M8 (wk 8-13) — early-street ladder (telemetry-steered):** 5th/4th/3rd stud + earlier draw rounds
  by bootstrap with certified street-(s+1) leaves. Honestly-weaker gates (ladder consistency,
  adversary panel, duplicate matches), displayed as such. Razz hole-blind early streets retired here.
- **M9 (wk 10-15) — multiway certified grading:** 3-seat exact 7th-street resolver (support-restricted)
  + extended br3.js; grade = certified-EV-loss-vs-stated-profile with the per-seat exploitability
  error bar (~4.8% reduced-game floor) published on every grade. The GTO label is BANNED in multiway
  (launch blocker). k≈4 continuation-policy opponents online; collapse-to-HU range handoff with
  consistency checks. razz3 grind resumes as background filler only.
- **M-PROD (wk 3+, parallel):** nightly batch re-grade channel first ("grades need to be right, not
  instant"); numpy .npz inference if the single pip wheel is admitted (torch-vs-numpy 1e-6 gate);
  i9 webhook oracle node last, with graceful blueprint fallback. GATE: prod grade byte-matches local
  on a 100-spot replay set.

## Kill criteria (abridged)

M1a: fixed leaf grades WORSE vs exact → full stop on all net-leaf work until understood.
M1b: equivalence suite can't hit 1e-6 → the numpy path never becomes a datagen or serving path.
M1c: off-box backup not verified restorable → the datagen daemon does not start.
M2: brute-force parity fails on reduced decks → that game's rung does not ship.
M3: gadget can't reproduce an exactly-solved game ≤1e-3 → STOP all chained/continual re-solving
(this is the sound/unsound line). M4: >4h/solve after batching → redesign; the trust bar slips in
schedule, never in kind. M5/M6: mean error >0.25 SB OR one big-mistake flip → the net grades NO ONE.
M7: spliced blueprint's full-game BR regresses at any untouched node → revert immediately.
M9: per-seat BR gap not exactly reproducible, or the GUI can't display the no-equilibrium label →
multiway grades do not ship. GLOBAL: any grade path whose provenance label would have to lie does
not ship; the trust floor is never traded for a date.

## Killed / demoted

EMD abstraction (verdict final: scale the fixed-grid family). The exact 6th→7th recursion as a
serving path (demoted to gate-oracle duty). Live resolver-opponent on Render (infeasible on
Node + stock python3). Multiway value nets / any multiway equilibrium story this cycle.
DeepStack-scale corpora / ReBeL-scale self-play (not feasible on one i9). Blueprint exploitability
grinding beyond razz-v2 + the stud8 fix — the never-idle default is now EXACT-LABEL DATAGEN.
razz3 escalating ladder above its current band until M9. a5td-specific work (rides td27 machinery).
Same-board R² as a decision input. New CLI-facing solver surfaces (GUI mandate). Performance work
inside resolve.py (frozen reference).
