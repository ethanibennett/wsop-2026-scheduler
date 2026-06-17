# Mixed-Games Solver & Study System — Roadmap

**Vision:** a powerhouse study system for the mixed games no commercial solver
covers (2-7 Triple Draw, Badugi, Stud 8, and siblings) — solvers + a learning
loop (watch GTO play, quiz yourself, drill spots, find your leaks).

**How to read this:** phases are ordered; within a phase, items are roughly
sequenced. Timelines are effort estimates, not deadlines. Status tags:
`[done]`, `[wip]`, `[next]`, `[later]`. Companion docs: `RESEARCH.md` (the cited
literature + design rationale), `README.md` (module overview).

---

## Phase 0 — Foundation `[done]`

- `[done]` External-sampling MCCFR engine, now on **DCFR(3/2,0,2)**; validated by Kuhn → −1/18.
- `[done]` Three games + evaluators (2-7 lowball, Badugi, Stud hi/lo-8).
- `[done]` Training CLI (checkpoint/resume, time-box, periodic crash-safe saves) + **overnight GitHub Actions** training that stages strategies on a review branch.
- `[done]` Study UI on the admin Hands tab: **Watch Solver** (self-play viewer, replayer felt table), **Solver Trainer** (quiz), the **"Why" / pot-odds** line, **dead-card** display.
- `[done]` `RESEARCH.md` — verified, cited literature survey + this roadmap.

---

## Phase 1 — Solver correctness & quality `[wip]` — ~1–2 weeks

The goal: make the three solvers *measurably* good and fix the abstraction
flaws we found (the deuce premium / "draw to a 6" / wheel-draws-mislabeled-as-pat).

1. `[done]` **DCFR(3/2,0,2)** regret rule (≈2–3× over CFR+ on future runs).
2. `[wip]` **2-7 draw-aware abstraction** — classify by what a hand draws *to*, honest draw counts, idiomatic labels; retraining tonight.
3. `[wip]` **Exploitability meter** (the single most important tool): reports how exploitable each strategy is, in chips/hand. Started in `solver/exploitability.js`: an **exact** best response on Kuhn (validates the engine + confirms reach-weighted averaging — trained → 0.002, uniform → 0.46) and a Monte-Carlo **lower bound** for the big games via simple fixed exploiters. **Next:** the principled per-public-state best response / LBR with belief tracking (stud8 first), which gives a tight number and **detects abstraction pathology** (finer ≠ better). Build that before trusting further abstraction changes.
4. `[next]` **Badugi** + **Stud 8** abstraction review/redesign in the same spirit (draw/holding structure, not just the made-hand label).
5. `[next]` Re-train all three on the cleaned abstractions; review staged branch; **deploy code + strategies together** (the merge that's currently pending).
6. `[later]` Average-strategy reach-weighting: formalize the audit (currently validated only by Kuhn convergence).

**Exit criterion:** each game reports a stable, low exploitability number, and
the heuristics we mine read correctly (no "draw to a 6").

---

## Phase 2 — Abstraction depth & more games `[next]` — ~2–6 weeks

1. `[next]` **Distribution-aware EMD bucketing** (the real fix, RESEARCH.md C4): cluster hands by their **equity distribution** with k-means under Earth Mover's Distance, potential-aware + imperfect-recall. This *learns* deuce-blocker value, smoothness, straight risk automatically instead of us hand-coding bits — the proper answer to the abstraction flaws Phase 1 patched by hand.
2. `[next]` **Expand the draw action space** (C5) so the solver fully chooses draw counts (street-dependent), rather than the heuristic offering snow-vs-natural.
3. `[later]` **More mixed games** — the engine is game-agnostic; add **Razz, Stud Hi, A-5 Triple Draw, Badeucy/Badacy**, mostly evaluators + rules.
4. `[later]` **Training speed**: VR-MCCFR baselines (~orders-of-magnitude variance cut), regret/best-response pruning, multi-night chained training via Actions cache for >6h runs.

**Exit criterion:** EMD abstraction measurably beats the hand-crafted one (via
the Phase 1 exploitability meter), across ≥3 games.

---

## Phase 3 — The study system `[later]` — ongoing, parallel to Phase 2

The features that turn solvers into a *study tool* (the actual product).

1. `[next]` **Spot drilling** — filter the trainer/viewer to a chosen street/situation ("3rd-street facing a complete", "pre-draw BB defense").
2. `[next]` **Range / frequency explorer** — browse the whole strategy (every bucket's mixed action), not just self-play.
3. `[later]` **Leak detection** — import your own session hands, compare your frequencies to the solver's, surface your biggest deviations. The killer feature; reuses the best-response/exploitability math from Phase 1.
4. `[later]` **Node-locking / custom scenarios** — solve a spot with a fixed opponent tendency.
5. `[later]` UX polish, mobile, and (optionally) opening parts of it up beyond admin.

---

## Phase 4 — Stud 8 neural solver `[later]` — multi-month, the frontier

A DeepStack/ReBeL-style real-time solver so you can solve **any** Stud 8 spot on
demand (not just a precomputed grid). Stud 8 is the right target because its rich
public upcards make the public-belief-state compact (RESEARCH.md Part IV). This is
a new Python+GPU system; the JS engine becomes the tabular subgame solver that
generates training data. Each milestone is independently useful.

- `[done]` **0. Foundation** — `solver/neural/`: milestone plan, PBS data contract, and the **value network implemented** (`value_net.py`: 7×500 PReLU + zero-sum layer + Huber). Critical-path next is Milestone A.
- `[next]` **A.** Tabular Stud 8 **CFR-D subgame solver** + exact best-response evaluator.
- `[later]` **B.** EMD bucketing for stud hi/lo ranges (builds on Phase 2).
- `[later]` **C.** 7th/6th-street **counterfactual value networks** + self-play data pipeline.
- `[later]` **D.** **Continual re-solving** at the table (depth-limited search + value net).
- `[later]` **E.** Earlier-street nets via bootstrapping.

---

## Cross-cutting principles

- **Measure before you trust.** Every abstraction/engine change is judged by the
  exploitability meter (Phase 1, item 3), because abstraction quality is
  non-monotonic (finer can be worse).
- **Deploy code + strategies atomically.** Infoset keys change with the
  abstraction; new strategies must ship with the code that produced them (the
  training workflow now stages both together).
- **Compute budget is the real constraint.** CFR scale is bounded by a runner's
  RAM (stud8 is memory-bound at ~7 GB); the neural phase needs GPUs. Free on a
  public repo via Actions; otherwise it costs minutes/$$.
- **Heads-up only for soundness.** Nash has no general guarantee at 3+ players;
  multiplayer mixed games are out of scope for "solved" claims.
- **Abstraction is the ceiling, not iterations.** Past the "stable blueprint"
  point, more hands barely help; only a better abstraction (Phase 2) or the
  neural solver (Phase 4) moves the ceiling toward true GTO.

---

## Nearest actions (this week)

1. Review tonight's re-abstracted 2-7 strategies on the staged branch; spot-check the new buckets/heuristics.
2. Build the **exploitability meter** — the gate for everything downstream.
3. Apply the draw-aware abstraction to **Badugi**; review **Stud 8**'s bucket.
4. Deploy the cleaned code + strategies together to production.
