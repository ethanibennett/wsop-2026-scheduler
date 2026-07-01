# Project progress — Mixed-Games CFR Solver & Study System

> Living status board. **Updated: 2026-06-18.** Dates after "today" are estimates,
> not commitments — they show sequence/dependencies. Update this file at the end
> of each session (move bars to `done`/`active`, adjust the table). The
> `project_progress_gantt` widget renders from this same roadmap.

Status legend: `done` ✅ · `active` 🔵 (in progress) · `todo` ⬜ (upcoming) · `paused` 🟠

```mermaid
gantt
    title Mixed-Games CFR Solver & Study System
    dateFormat YYYY-MM-DD
    axisFormat %b %d
    todayMarker on

    section Tabular blueprints
    CFR engine · parallel · supervisor · meter   :done,   t1, 2026-06-10, 2026-06-18
    2-7 triple draw blueprint (~1.9M)            :done,   t2, 2026-06-10, 2026-06-18
    Badugi blueprint (~1.75M)                    :done,   t3, 2026-06-10, 2026-06-18
    Stud 8 blueprint (431k, frozen)              :crit,   t4, 2026-06-10, 2026-06-18
    Study UI — viewer + trainer                  :done,   t5, 2026-06-14, 2026-06-18

    section Neural solver core
    Milestone A — subgame re-solver              :done,   n1, 2026-06-18, 1d
    Milestone B v0 — 25 buckets                  :done,   n2, 2026-06-18, 1d
    Datagen + train + net-leaf                   :done,   n3, 2026-06-18, 1d
    Sparse exact re-solver                       :done,   n4, 2026-06-18, 1d

    section Data + training (active)
    24/7 bucketed datagen (1.2M+)                :active, d1, 2026-06-18, 8d
    Scaling-curve validation (R^2 0.88)          :done,   d2, 2026-06-18, 2d
    solve_spot — node-locked study tool          :done,   d3, 2026-06-18, 1d
    Train 7th-street net (R^2 0.879 @ 100k)      :done,   d4, 2026-06-19, 1d
    Gate RESOLVED: data-limited -> SCALE         :milestone, done, d5, 2026-06-19, 0d

    section Neural completion
    Vectorize re-solver (throughput)             :        c1, 2026-06-22, 4d
    Milestone B — EMD / OCHS buckets             :        c2, 2026-06-25, 6d
    Bootstrap 6th to 3rd street nets             :        c3, 2026-06-29, 8d
    Milestone D — continual re-solving           :        c4, 2026-07-03, 5d
    Study UI integration                         :        c5, 2026-06-28, 6d

    section Solver quality + tooling
    Parallel-merge bug — guard (then lifted)     :done,   q1, 2026-06-18, 1d
    Parallel-merge fix (average workers)         :done,   q2, 2026-06-18, 1d
    Monker-style HU equity graphs                :done,   q4, 2026-06-18, 1d
    LBR / best-response meter (draw games)       :        q3, 2026-06-22, 4d

    section Razz — neural pipeline validation
    Razz evaluator                               :done,   z1, 2026-06-18, 1d
    Razz re-solver (GameSpec) + 1-D bucketing    :done,   z2, 2026-06-18, 1d
    Razz bucketed engine + datagen               :done,   z3, 2026-06-18, 1d
    Razz net fit (verify) — R^2 0.895            :done,   z4, 2026-06-18, 1d
    Razz data scale-up (optional)                :        z5, 2026-06-19, 3d

    section Multiway (backburner)
    Multiway engine + abstractions (all games)   :        x1, 2026-07-12, 21d
    Multiway neural (Stud 8)                     :        x2, 2026-08-02, 21d
```

## Status table

| Phase | Item | Status | Notes |
|---|---|---|---|
| Tabular | CFR engine, parallel, supervisor, meter | ✅ done | external-sampling MCCFR, DCFR(3/2,0,2) |
| Tabular | 2-7 triple draw blueprint | ✅ done | committed ~1.88M (single-thread, exploit_lb ~2.6); a 7M parallel retrain was corrupt → reverted/parked |
| Tabular | Badugi blueprint | ✅ done | committed ~1.75M (single-thread, exploit_lb ~0); parallel retrain reverted |
| Tabular | Stud 8 blueprint | 🟠 paused | 431k average restored; full-state ckpt lost; frozen |
| Tabular | Study UI (viewer + trainer) | ✅ done | Watch Solver + Solver Trainer on Hands tab |
| Neural core | Milestone A — subgame re-solver | ✅ done | `resolve.py`; range-CFR+ + exact BR gauge; cross-checked vs JS |
| Neural core | Milestone B v0 — bucketing | ✅ done | `bucket.py`; 25 buckets (hi×lo); value-preserving |
| Neural core | Datagen + train + net-leaf | ✅ done | `datagen.py`/`train.py`/`net_leaf.py`; CPU-only |
| Neural core | Sparse exact re-solver | ✅ done | explicit-holdings support for narrow/node-locked ranges |
| Data+train | 24/7 bucketed datagen | 🔵 active | `datagen_bucketed.py` + `overnight.sh`; 186k+ examples, ~20k/hr, 14 workers |
| Data+train | Scaling-curve validation | ✅ done | `validate.py`; R² 0.59→0.71→0.77→**0.88** as data 1.5k→12.75k→30k→100k; data-limited confirmed, no plateau |
| Data+train | solve_spot study tool | 🔵 active | on-demand node-locked spot solver (later streets) |
| Data+train | Train 7th-street net | ✅ done | **`nets/st7_100k.pt`, R² 0.879** (val MAE 0.023) at 100k examples; first production-grade net, improving with more data (1.2M on disk) |
| Data+train | **Gate: scale vs EMD buckets** | ✅ done | **DATA-LIMITED → SCALE.** val MAE 0.045→0.042→0.038→0.034, R² 0.59→0.67→0.71→0.76 (1.5k→30k); train flat ~0.005 → 25 buckets not the ceiling, keep collecting. EMD deferred. |
| Completion | Vectorize re-solver (throughput) | ⬜ todo | numpy; the lever for >> data + real-time |
| Completion | Milestone B — EMD/OCHS buckets | ⬜ todo | contingent on the gate |
| Completion | Bootstrap 6th→3rd street nets | ⬜ todo | DeepStack-style, trained net as leaf |
| Completion | Milestone D — continual re-solving | ⬜ todo | at-the-table re-solve with net leaf |
| Completion | Study UI integration | ⬜ todo | Python re-solver ↔ Node app bridge |
| Quality | Parallel-merge bug — guard | ✅ done | temporary single-thread guard; **lifted** once the fix below was verified |
| Quality | Parallel-merge fix (avg workers) | ✅ done | `mergeAverage`; DCFR-correct, verified on Kuhn (W=8 → 0.0008); parallelism = variance reduction now |
| Tooling | Monker-style HU equity graphs | ✅ done | `equity.js`; range-vs-range equity + distribution curves, all 3 games, no CFR |
| Quality | LBR / best-response meter | 🔵 active | **core VALIDATED on Kuhn** (`solver/lbr.js`): LBR=exact BR 0.4583 on an exploitable σ (vs 0.366 fixed-exploiter), ≈0 on near-eq. Next: draw-game adapters (particle filter over opp hands + draw tracking) to measure td27/badugi |
| Razz | Razz evaluator | ✅ done | `eval_razz.py`; ace-to-five low, self-tested |
| Razz | Re-solver (GameSpec) | ✅ done | `razz_game.py` + parameterized `resolve.py`; solves any razz subgame exactly (zero-sum + BR→0) — **a usable exact razz solver already** |
| Razz | 1-D bucketing + bucketed engine | ✅ done | `bucket_razz.py` (8-bucket low ladder) + `bucket_resolve_razz.py` (~0.5s/board) |
| Razz | Datagen | ✅ done | `datagen_razz.py`; same schema, `n_buckets=8`; `validate.py` auto-detects |
| Razz | Net fit (verify) | ✅ done | **PASSED: val R²=0.895, MAE 0.051 vs 0.194 baseline** on a first 560-ex batch → DeepStack stack works end-to-end; see `neural/RAZZ.md` |
| Razz **(product)** | Exact spot solver | ✅ done | `solve_spot.py --game razz`; GTO strategy + EV + exploitability per spot, exact later streets — **a usable study tool now** |
| Razz **(product)** | Full-game net + net_leaf | ✅ done | `nets/razz7_3k.pt` **R² 0.948**; `net_leaf` **zero-sum-corrected** (DeepStack) + verified (real net leaf resolves zero-sum, gap 0.0) → covers early streets / real-time |
| Razz **(product)** | Equity graphs + study UI | ⬜ todo | JS `eval_razz` port + `equity.js` matchup; app integration |
| Multiway | Engine + abstractions (all games) | 🟠 backburner | big lift: stack is 2-player; multiway CFR is heuristic (general-sum) |
| Multiway | Neural multiway (Stud 8) | 🟠 backburner | N-range PBS + N-output value net |

## How to read it

The headline: the **tabular foundation and the neural solver core are done**; we're
in the **data-generation + validation** phase, with the open question being whether
more data keeps improving the net (→ scale) or plateaus (→ build EMD bucketing).
Everything in "completion" is gated on that decision.
