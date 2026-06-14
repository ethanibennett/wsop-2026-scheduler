# Computation in Games of Incomplete Information
### A graduate-level survey, reading list, and engineering plan for the `solver/` module

> Status: research synthesis, 2026-06-14. Every citation below was checked against a
> primary source (arXiv/PMLR/AAAI-OJS/IJCAI/NeurIPS/Science/journal) during a
> structured literature sweep. Where a figure could only be corroborated from a
> companion paper or an authoritative secondary source (e.g. paywalled *Science*
> bodies), it is marked **[2°]**. A handful of sub-topics (Player/Student of Games;
> some draw/stud keyword sweeps) were interrupted by a service limit and are written
> from established knowledge, marked **[unverified-this-pass]**.

This document does three things:
1. **Part I** — a syllabus-style survey of the field, organized as eight teachable modules.
2. **Part II** — a prioritized reading list grouped by topic.
3. **Part III** — literature-grounded critiques and proposed changes to *our* CFR/abstraction code.
4. **Part IV** — a concrete, literature-backed architecture for a DeepStack/ReBeL-style neural solver for **Stud 8**.

Our system, for reference: a JavaScript **external-sampling MCCFR** engine with
**regret-matching⁺** and **linear averaging**, validated on Kuhn poker, solving
heads-up fixed-limit **2-7 Triple Draw**, **Badugi**, and **Stud 8-or-Better** with a
lossy **card-bucket + heuristic-discard + street-local-history** abstraction.

---

## PART I — SURVEY

### Module 1 — Foundations and complexity

**Extensive-form games, perfect recall, and the sequence form.** An imperfect-information
game is a tree with information sets (nodes a player cannot distinguish). Kuhn (1953)
gave the modern formalization (information sets, behavior strategies) and **Kuhn's
theorem** (mixed ≡ behavior strategies *under perfect recall*) — the precondition every
method below relies on. The **sequence form** (von Stengel, *Games and Economic
Behavior* 14(2):220–246, 1996; Koller, Megiddo & von Stengel, *GEB* 14(2):247–259, 1996)
represents strategies by *sequences of choices and their realization probabilities*,
giving a description of size **linear** in the game tree rather than exponential. For
**two-player zero-sum** perfect-recall games this yields a **linear program of linear
size**, hence **polynomial-time** equilibrium computation; for general-sum two-player
games equilibria are the solutions of a **Linear Complementarity Problem** solved by
**Lemke's algorithm**.

**Equilibrium concepts.** Nash equilibrium; Aumann's **correlated equilibrium**
(*J. Math. Econ.* 1(1):67–96, 1974); **coarse-correlated equilibrium** (Moulin & Vial,
*Int. J. Game Theory* 7:201–221, 1978), where deviation is decided *ex ante*. These
matter because **regret-minimizing self-play converges to (coarse) correlated
equilibria** in general — and, crucially, to **Nash in two-player zero-sum** games.

**Complexity.** Computing a Nash equilibrium is **PPAD-complete** — first for ≥4 then
≥3 players (Daskalakis, Goldberg & Papadimitriou, STOC 2006 / *SIAM J. Comp.* 39(1),
2009) and finally for **two-player (bimatrix)** games (Chen & Deng, FOCS 2006). The
sharp dividing line for our purposes: **two-player zero-sum is in P** (von Neumann
minimax + LP duality) while everything else is hard. This is *why* heads-up poker is
tractable and multiplayer poker has no soundness guarantee.

**Canonical test games.** **Kuhn poker** (Kuhn 1950): 3-card deck, one card each, one
bet; no pure equilibrium; player 1 has a one-parameter family of equilibria (α∈[0,1/3]),
player 2 unique; **game value −1/18** to player 1. (Our engine's correctness test
reproduces exactly this value — a real, verified soundness check.) **Leduc hold'em**
(Southey et al., "Bayes' Bluff", UAI 2005): 6-card deck (J/Q/K ×2 suits), one private +
one public card, two rounds — the standard small benchmark.

### Module 2 — The CFR family (our engine's foundation)

**Regret matching** (Hart & Mas-Colell, *Econometrica* 68(5):1127–1150, 2000): play
actions with probability proportional to positive cumulative regret; in self-play the
empirical play converges a.s. to the correlated-equilibrium set. This is the local
minimizer plugged into every infoset.

**Counterfactual Regret Minimization** (Zinkevich, Johanson, Bowling & Piccione, NIPS
2007). The two load-bearing facts:
- **Regret decomposition (Thm 3):** total regret ≤ Σ over infosets of *positive immediate
  counterfactual regret*. This is what makes a huge game decomposable into independent
  per-infoset regret-matching problems.
- **Convergence (Thm 4):** average regret ≤ Δ·|Iᵢ|·√|Aᵢ| / √T — the **O(1/√T)** bound,
  linear in the number of infosets.
- **You must output the reach-weighted *average* strategy**, not the current iterate
  (which can cycle). σ̄ᵢ(a|I) = Σₜ πᵢ^{σᵗ}(I)·σᵗ(a|I) / Σₜ πᵢ^{σᵗ}(I). *Averaging uniformly
  instead of by reach is the single most common implementation bug.*

**Monte Carlo CFR** (Lanctot, Waugh, Zinkevich & Bowling, NIPS 2009). Sample a block of
terminals each iteration; the sampled counterfactual value is an **unbiased estimator**
of the true one (Lemma 1). Variants:
- **External sampling** (what we use): sample opponent + chance, enumerate the
  traverser's own actions. Importance weights cancel; needs only a **constant factor**
  more iterations than vanilla CFR (Thm 4) but each iteration costs ~O(√|H|) vs O(|H|).
- **Outcome sampling:** one trajectory per iteration; carries a 1/δ variance penalty
  (Thm 5) — higher variance, model-free-friendly.
- **Chance sampling:** sample only nature.

**CFR+** (Tammelin 2014, arXiv:1407.5042; Tammelin, Burch, Johanson & Bowling, IJCAI
2015) — three changes:
1. **Regret-matching⁺:** floor cumulative regret at 0 *after each update*,
   R⁺ = max(R⁺ + instantaneous, 0). Negative regret never accumulates, so an action that
   becomes good again recovers immediately.
2. **Alternating updates:** update one player per pass.
3. **Linear averaging:** weight iteration t by max(t−d, 0).
The famous **~1/T** empirical speedup is *not a proven rate* — the proofs give O(1/√T)
soundness plus a tracking-regret bound; the 1/T behavior is observed, not theorized. CFR+
powered **Cepheus** (Module 6).

**Linear & Discounted CFR** (Brown & Sandholm, AAAI 2019, arXiv:1809.04040). **DCFR(α,β,γ)**
multiplies, each iteration t: positive regrets by tᵅ/(tᵅ+1), negative regrets by
tᵝ/(tᵝ+1), average-strategy contributions by (t/(t+1))ᵞ. **LCFR = DCFR(1,1,1)**;
**CFR+ = DCFR(∞,−∞,2)**. The recommended **default α=3/2, β=0, γ=2 outperformed CFR+ in
every game tested**, usually by 2–3×. Caveat: β=0 lets suboptimal-action regrets sit at 0
rather than →−∞, which **breaks negative-regret pruning**; use **β=0.5** if you want
pruning.

**Variance reduction.** **VR-MCCFR** (Schmid et al., AAAI 2019) adds RL-style
state-action **baselines** as control variates; unbiased even when bootstrapped; reported
~1 order-of-magnitude speedup, ~3 orders variance reduction, and made CFR+-with-sampling
viable. **AIVAT** (Burch, Schmid, Moravčík, Morrill, Bowling, AAAI 2017) is the matching
*evaluation*-time estimator (Module 7).

**Pruning, speed, warm starts.** Regret-Based Pruning (Brown & Sandholm, NIPS 2015) skips
negative-regret subtrees while preserving guarantees; **Best-Response Pruning** (ICML
2017) asymptotically prunes any action not in a best response to some equilibrium (~7×
space). **Lazy-CFR** (Zhou et al., ICLR 2020) traverses ~O(√|I|) infosets/round.
**Strategy-based warm starting** (Brown & Sandholm, AAAI 2016) warm-starts CFR from *any*
strategy in a single traversal without altering convergence bounds — relevant for
resuming from a coarser solution.

### Module 3 — Abstraction (our biggest weakness; see Part III)

**Lossless abstraction / GameShrink** (Gilpin & Sandholm, *J. ACM* 54(5), 2007): merge
strategically interchangeable states via *ordered game isomorphism*; any equilibrium of
the abstracted game lifts to the original. Solved Rhode Island Hold'em (~3.1B nodes)
exactly. Lossless reduction is limited, motivating lossy methods.

**Lossy card abstraction — the central practical art:**
- **Expectation-based (myopic):** cluster by a scalar like E[HS] or E[HS²]. Cheap, but a
  1-D value cannot separate hands of equal current strength but different *potential*.
- **Potential-aware** (Gilpin, Sandholm & Sørensen, AAAI 2007): represent each hand by a
  **histogram over transitions into future-round buckets**, capturing draws. Wins at
  moderate-to-fine granularity.
- **Distribution-aware + EMD** (Johanson, Burch, Valenzano & Bowling, AAMAS 2013):
  cluster full **hand-strength distributions** with **k-means under Earth Mover's
  Distance**, using **Opponent Cluster Hand Strength (OCHS)** features.
  Distribution-aware beats expectation-based at equal size; **imperfect-recall**
  abstractions beat perfect-recall ones at equal size.
- **Potential-aware + imperfect-recall + EMD** (Ganzfried & Sandholm, AAAI 2014): the
  state-of-the-art recipe — a recursively-defined EMD over next-round buckets. **Why EMD
  over L2:** EMD respects the *ordinal closeness* of strength bins (moving mass to an
  adjacent bin is cheap); L2 treats all bins as equidistant and misjudges similarity.

**Theory.** **Abstraction pathology** (Waugh, Schnizlein, Bowling & Szafron, AAMAS 2009):
a *strict refinement* of an abstraction can produce a **more** exploitable full-game
strategy — quality is **non-monotonic**. This is the reason you must *measure*
exploitability, not assume "more buckets = better." Solution-quality **bounds**
(Kroer & Sandholm, EC 2014; EC 2016 for imperfect recall; NeurIPS 2018 unified) give a
priori guarantees that exploitability degrades gracefully with abstraction error, and
reduce single-level abstraction to a clustering problem *whose distance is the bound
itself* — directly connecting theory to k-means/EMD practice.

**Action abstraction & translation** (for no-limit; less relevant to our fixed-limit
games): hard nearest-action translation is exploitable (Schnizlein et al., IJCAI 2009);
the **pseudo-harmonic mapping** (Ganzfried & Sandholm, IJCAI 2013) is near-optimal;
Brown & Sandholm (IJCAI 2015) refine the action abstraction *during* solving.

**Draw-specific, recent:** Fu, Yin, Liu, Xu & Huang (arXiv:2511.12089 "KrwEmd";
arXiv:2510.15094 "SOOG/FROI", both 2025, **preprints**) argue mainstream outcome-based
imperfect-recall abstraction "forgets everything" about card history and propose
EMD-based, history-retaining metrics evaluated **specifically on draw poker** — the
closest work to our 2-7 TD / Badugi setting. **No dedicated peer-reviewed *stud*
abstraction paper exists** — for Stud 8 the applicable theory is the general
EMD/potential-aware/IR machinery.

### Module 4 — Subgame and real-time solving

The chain that makes real-time play sound:
- **CFR-D / decomposition** (Burch, Johanson & Bowling, AAAI 2014): the first
  decomposition with **full-game optimality guarantees**. A subgame is reconstructable
  from **(the player's range, the opponent's counterfactual values at the boundary)** —
  the object a value network later learns to predict.
- **Safe & nested subgame solving** (Brown & Sandholm, NeurIPS 2017, **best paper**):
  *unsafe* solving fixes the opponent's blueprint range and can *increase*
  exploitability; *safe* solving constrains the opponent via a **re-solving gadget**
  (opponent chooses to "terminate" for its blueprint counterfactual value or "follow"
  into the subgame), guaranteeing the refined strategy is **no more exploitable than the
  blueprint**. **Nested** solving re-solves when the opponent acts off the abstraction —
  beating action translation.
- **Depth-limited solving with multi-valued states** (Brown, Sandholm & Amos, NeurIPS
  2018): a leaf has **no single value**; instead the opponent may choose among several
  continuation strategies, each giving a different leaf-value vector, and the solver must
  be robust to all. Yielded "Modicum," a master-level HUNL bot on a **4-core CPU / 16 GB**.

This is the scaffold a neural value network plugs into: replace the explicit set of
continuation strategies / boundary CFVs with a **learned counterfactual-value function**.

### Module 5 — Neural methods and the public belief state (the Stud 8 path)

**The state to condition on: the Public Belief State (PBS).** Given the common-knowledge
public history `s_pub`, let `Sᵢ(s_pub)` be the infostates player i could be in; a **PBS**
β = (ΔS₁(s_pub), …, ΔSₙ(s_pub)) pairs the public state with each player's **belief/range**
over its own infostates. The **Bayesian Action Decoder** (Foerster et al., ICML 2019)
formalizes acting in a **public-belief MDP**; **ReBeL** (Brown, Bakhtin, Lerer & Gong,
NeurIPS 2020) shows **any imperfect-information game becomes a perfect-information game
over PBSs**, enabling AlphaZero-style self-play+search.

**DeepStack** (Moravčík et al., *Science* 356:508–513, 2017) — the canonical
counterfactual-value-network system, and the template for Stud 8:
- **Continual re-solving:** at every decision, re-solve the current public subgame from
  scratch using only your range + opponent CFVs (the CFR-D/gadget idea), so there is *no
  blueprint translation error*. Soundness (Thm 1): exploitability < k₁ε + k₂/√T given
  value-network error ε.
- **Value network:** 7 fully-connected layers × **500 PReLU** units. **Inputs:** pot size
  (as a fraction of stacks), public cards, and **both players' ranges as distributions
  over 1,000 buckets** (k-means/EMD hand clusters). **Outputs:** a **counterfactual value
  per bucket per player**, expressed **as a fraction of the pot** (key for
  generalization). Three nets: turn, flop, and an exact pre-flop auxiliary (169 distinct
  hands, no bucketing).
- **Zero-sum correction layer:** a differentiable outer layer subtracts half the (range-
  weighted) value-sum from each side so the two players' values sum to zero.
- **Loss:** **Huber**, optimized with **Adam**.
- **Data generation:** solve **random subgames** with **CFR+ (1,000 iters, no card
  abstraction, F/C/pot/all-in)** and log (situation → CFV vector). 10M turn games
  (>175 core-years on 6,144 CPUs), 1M flop games (~½ GPU-year). Ranges sampled by a
  recursive procedure designed to **cover the ranges CFR might encounter**, not just
  equilibrium ranges.
- **At the table:** sparse depth-limited lookahead (≤4 actions deep), value net at the
  leaves, **<5 s/decision on one GTX 1080**. Result: **+486 mbb/g (AIVAT) over 33 pros**,
  and **LBR exploitability = 0** while abstraction bots measured 3,300–4,700 mbb/g.

**ReBeL** (Brown et al., NeurIPS 2020) — the cleaner, more general recipe:
- A **PBS value network** v̂: β → ℝ^{|S₁|+|S₂|} outputs a value per infostate of both
  players. At a depth-limited leaf, query v̂ on the **leaf PBS** to set leaf values, then
  solve the subgame with CFR.
- **Self-play data generation (Algorithm 1):** from a root PBS, build a depth-limited
  subgame, set leaf values from v̂, run T CFR iterations, **log (root PBS → solved CFV
  vector)** as a training example, then **sample a random CFR iteration t∼unif{t_warm…T}**
  and descend on that iteration's policy to pick the next root PBS, and recurse.
- **The random-iteration trick is the soundness key:** it keeps the generated PBS
  distribution covering what real play produces and prevents an opponent from steering
  play to PBSs where the net is weak. **Provably converges to Nash in 2p0s** given an
  accurate value net and enough CFR iterations; test-time exploitability scales with
  value-net error + 1/√T. ReBeL beat top humans at HUNL using *far less domain knowledge*
  than DeepStack.

**The model-free / scalable CFR-network line** (relevant if a perfect re-solve simulator
is awkward):
- **Deep CFR** (Brown, Lerer, Gross & Sandholm, ICML 2019): replace the tabular regret
  table with an **advantage network** V(I,a) (card embeddings rank+suit+card, bet
  features → MLP → one output per action), trained by **iteration-weighted MSE** (Linear
  CFR) on a **reservoir buffer** of sampled regrets; a separate average-strategy network.
  Uses external-sampling MCCFR (needs a resettable simulator). Beat NFSP and matched fine
  abstractions with 2–3 orders fewer samples.
- **Single Deep CFR** (Steinberger, 2019): drops the average-strategy network — keep every
  iteration's value net and sample one (weight ∝ t) per game — removing a whole layer of
  approximation error.
- **DREAM** (Steinberger, Lerer & Brown, 2020): **model-free** via outcome sampling + a
  learned **history-value baseline** (expected SARSA) to tame the importance-sampling
  variance; no simulator needed.
- **ESCHER** (McAleer, Farina, Lanctot & Sandholm, ICLR 2023): drops importance sampling
  entirely by sampling from a *fixed* distribution and learning a history value function;
  variance orders of magnitude below DREAM, scales to dark chess.
- **NFSP** (Heinrich & Silver, 2016) / **FSP** (Heinrich, Lanctot & Silver, ICML 2015):
  the fictitious-play lineage — a best-response **DQN** network + an average-policy
  network trained by **supervised classification** on a **reservoir** of the agent's own
  best-response actions, mixed by an anticipatory parameter η≈0.1. Reaches ~0.06
  exploitability in Leduc with no domain knowledge; the standard neural baseline.
- **Player/Student of Games** (Schmid et al., 2021/2023) **[unverified-this-pass]**:
  unify search+learning (growing-tree CFR) across perfect and imperfect information with
  sound self-play.

### Module 6 — Landmark systems (calibration)

| System | Game | Method | Compute | Result |
|---|---|---|---|---|
| **Cepheus** (Bowling, Burch, Johanson, Tammelin, *Science* 2015) | HU **limit** hold'em (>10¹⁴ infosets) | CFR+ | 4,800 CPUs × 68 days (~900 core-yr); 262 TiB → 10.9 TiB compressed | **0.986 mbb/g** exploitability — "essentially weakly solved" |
| **DeepStack** (*Science* 2017) | HU **no-limit** | continual re-solving + value nets | 1 GTX 1080 at play time | +486 mbb/g vs 33 pros; LBR = 0 |
| **Libratus** (Brown & Sandholm, *Science* 2018) | HU no-limit | blueprint (MCCFR) + safe nested subgame solving + self-improver | "Bridges" supercomputer **[2°]** | beat 4 pros, ~147 mbb/hand, 120k hands |
| **Pluribus** (Brown & Sandholm, *Science* 2019) | **6-max** no-limit | MCCFR (Linear CFR) blueprint + depth-limited search | **~$144 / 8 days on 64 cores** to train; 2 CPUs at play | beat elite pros; +48 mbb/g (5H+1AI), +32 (1H+5AI) |

Two lessons for us: (1) blueprint + real-time search beats a pure blueprint and is cheap
(Pluribus); (2) the *value-network* route (DeepStack) is what removes the need for a giant
precomputed table.

### Module 7 — Evaluation (how to *know* you're near optimal)

- **Exact exploitability / best response** (Johanson, Waugh, Bowling & Zinkevich, IJCAI
  2011): the worst-case value against a best-responding opponent, reported in **mbb/g**;
  their accelerated method made exact HULHE exploitability feasible (~76 CPU-days for a
  game where the naïve traversal would take ~10 years). **NashConv(π) = Σᵢ δᵢ(π)** where
  δᵢ is i's gain from deviating to a best response; **exploitability = NashConv / #players**;
  **zero ⇒ Nash** (OpenSpiel, Lanctot et al. 2019).
- **CFR-BR** (Johanson, Bard, Burch & Bowling, AAAI 2012): solve with one player in the
  *unabstracted* game via best response — finds the **least exploitable strategy
  representable in an abstraction**, and *directly demonstrates abstraction pathology*
  (real-game exploitability drops, then **rises**, as CFR runs).
- **Local Best Response (LBR)** (Lisý & Bowling, AAAI-17 workshop): a cheap **lower bound**
  on exploitability — look one action ahead, assume check/call to showdown, maximize. It
  exposed that "tournament-strong" no-limit bots were **3,300–5,000 mbb/g** exploitable
  (worse than always folding's 750). Because it only needs to *play* a strategy, LBR is
  buildable for our games without a full best-response traversal.
- **AIVAT** (Burch et al., AAAI 2017): provably unbiased, low-variance *evaluation*
  estimator using a heuristic state value + known strategies as control variates; ~10×
  fewer hands for significance (85% SD reduction in the DeepStack match).

### Module 8 — Game-specific reality and frameworks (the gap we sit in)

**Frameworks.** **OpenSpiel** (Lanctot et al., 2019) is the reference for CFR-family
baselines (CFR, CFR-BR, ES/OS-MCCFR, RCFR, Deep CFR, NFSP, exploitability). **RLCard**
(Zha et al., 2019) and **PokerRL / Single Deep CFR** (Steinberger, 2019) round out the
deep/distributed tooling. **Decisive finding:** *none of the three implements 2-7 triple
draw, badugi, razz, seven-card stud, or stud hi-lo* — all are Hold'em/Leduc-only. A custom
solver+evaluator (exactly our `solver/` module) is genuinely required; these papers are
the right **methodology baselines** to cite.

**Why draw games are hard for the neural/PBS route.** The PBS methods (DeepStack, ReBeL)
thrive on **rich public information** (a small belief space given the public board). Draw
games are the opposite: **tiny public information** (you see only how many cards an
opponent drew, never which) and **huge private information** (a hand is a *sequence* of up
to ~14 seen cards across three draws). The PBS belief vector becomes enormous and poorly
constrained — which is exactly why **Stud 8 (rich upcards) is the right neural target and
2-7 TD / Badugi are not.**

---

## PART II — READING LIST (prioritized)

**Tier 0 — implement-from-these (our engine):**
1. Zinkevich, Johanson, Bowling, Piccione. *Regret Minimization in Games with Incomplete Information.* NIPS 2007.
2. Lanctot, Waugh, Zinkevich, Bowling. *Monte Carlo Sampling for Regret Minimization in Extensive Games.* NIPS 2009.
3. Tammelin. *Solving Large Imperfect Information Games Using CFR+.* arXiv:1407.5042, 2014. (+ IJCAI 2015 proof.)
4. Brown & Sandholm. *Solving Imperfect-Information Games via Discounted Regret Minimization.* AAAI 2019.

**Tier 1 — abstraction (the upgrade path):**
5. Johanson, Burch, Valenzano, Bowling. *Evaluating State-Space Abstractions in Extensive-Form Games.* AAMAS 2013.
6. Ganzfried & Sandholm. *Potential-Aware Imperfect-Recall Abstraction with EMD.* AAAI 2014.
7. Waugh, Schnizlein, Bowling, Szafron. *Abstraction Pathologies in Extensive Games.* AAMAS 2009.
8. Kroer & Sandholm. *Extensive-Form Game Abstraction with Bounds.* EC 2014 (+ EC 2016, NeurIPS 2018).
9. Fu et al. *KrwEmd* (arXiv:2511.12089) and *SOOG/FROI* (arXiv:2510.15094), 2025 — draw-specific.

**Tier 1 — evaluation (measure progress):**
10. Johanson, Waugh, Bowling, Zinkevich. *Accelerating Best Response Calculation…* IJCAI 2011.
11. Johanson, Bard, Burch, Bowling. *Finding Optimal Abstract Strategies (CFR-BR).* AAAI 2012.
12. Lisý & Bowling. *Equilibrium Approximation Quality… (LBR).* AAAI-17 workshop.
13. Burch, Schmid, Moravčík, Morrill, Bowling. *AIVAT.* AAAI 2017.

**Tier 2 — the Stud 8 neural build:**
14. Burch, Johanson, Bowling. *Solving Imperfect Information Games Using Decomposition (CFR-D).* AAAI 2014.
15. Brown & Sandholm. *Safe and Nested Subgame Solving.* NeurIPS 2017.
16. Brown, Sandholm, Amos. *Depth-Limited Solving for Imperfect-Information Games.* NeurIPS 2018.
17. Moravčík et al. *DeepStack.* Science 2017 (+ arXiv:1701.01724 supplement — the architecture details).
18. Brown, Bakhtin, Lerer, Gong. *ReBeL: Combining Deep RL and Search…* NeurIPS 2020.
19. Brown, Lerer, Gross, Sandholm. *Deep CFR.* ICML 2019 (+ Single-Deep-CFR, Steinberger 2019).

**Tier 2 — variance reduction & speed (optional but high-value):**
20. Schmid et al. *VR-MCCFR (baselines).* AAAI 2019.
21. Brown & Sandholm. *Best-Response Pruning.* ICML 2017; *Warm Starting.* AAAI 2016.

**Tier 3 — foundations & context:**
22. von Stengel (1996) and Koller–Megiddo–von Stengel (1996) — sequence form.
23. Hart & Mas-Colell. *Regret matching → correlated equilibrium.* Econometrica 2000.
24. Bowling, Burch, Johanson, Tammelin. *HU Limit Hold'em is Solved (Cepheus).* Science 2015.
25. Lanctot et al. *OpenSpiel.* arXiv:1908.09453, 2019 — reference implementations.

---

## PART III — PROPOSED CHANGES TO OUR CFR / ABSTRACTION CODE

Ordered by value-to-effort. Each is grounded in a cited result above.

**C1. Switch the averaging/discounting to DCFR(3/2, 0, 2).** *(High value, low effort.)*
We currently do regret-matching⁺ + linear averaging (≈ a CFR+/LCFR hybrid). Brown &
Sandholm (AAAI 2019) report **DCFR(3/2,0,2) beats CFR+ in every game tested, by ~2–3×**.
Concretely, in `engine/mccfr.js`: keep RM⁺, but each iteration t multiply accumulated
**positive** regret by t^1.5/(t^1.5+1), leave negatives at 0 (β=0 ≡ the RM⁺ floor we
already do), and weight the average-strategy accumulation by (t/(t+1))². This is a few
lines and is the single best "free" quality win. *Note:* β=0 is incompatible with
negative-regret pruning — fine, since we don't prune yet; if we later add pruning, use
β=0.5.

**C2. Audit the average-strategy reach-weighting.** *(Correctness — do first.)* Zinkevich
Thm and the MCCFR derivation require the average strategy be **reach-weighted**, and the
external-sampling estimator has a specific weighting. Our engine accumulates
`node.strat[i] += w·strat[i]` at opponent nodes with w = iteration index. We should verify
against Lanctot 2009 / the OpenSpiel external-sampling reference that this matches the
unbiased average-strategy update (the common bug is uniform-in-visit instead of
reach-weighted averaging). Until verified, treat this as the highest-priority correctness
item — a wrong average silently caps solution quality regardless of iteration count.

**C3. Build an exploitability meter.** *(High value — directly answers "how close to
optimal?")* We already compute an exact best response for Kuhn in the test. Generalize a
**full best-response traversal** over each game's *unabstracted* tree to report
**NashConv / exploitability in chips-per-hand**, and add a cheap **LBR** lower bound
(Lisý & Bowling) for spot checks. This converts "we ran N million iterations" into a
real number that (a) tells us when more iterations stop helping and (b) **detects
abstraction pathology** (Waugh 2009; the CFR-BR drop-then-rise signature). For the
draw/stud games the full best response is expensive but tractable offline on the
*abstracted* game; an exact full-game best response is the gold standard where feasible.
This is the principled replacement for guessing iteration counts.

**C4. Replace heuristic card buckets with distribution-aware EMD clustering.** *(Highest
quality ceiling; larger effort.)* Our buckets use hand-strength-class heuristics that
ignore the *distribution* of outcomes (potential). The literature consensus (Johanson
2013; Ganzfried–Sandholm 2014) is to cluster **hand-strength distributions** with
**k-means under EMD**, **potential-aware** and **imperfect-recall**. For our games:
compute, per hand per street, a histogram of equity-vs-random-continuation (or
OCHS-style features), then k-means/EMD into buckets. This is the change most likely to
materially lower exploitability — but Waugh (2009) warns it is **non-monotonic**, so it
must be paired with **C3** to confirm each refinement actually helps. The 2025 KrwEmd
work is the closest precedent for the *draw* games.

**C5. Treat the discard rule as a real (lossy) action abstraction.** *(Draw games —
important and under-appreciated.)* Right now the solver only chooses *how many* cards to
draw; *which* cards are fixed by a heuristic (`chooseKeep` keeps lowest / best sub-badugi).
That is an aggressive lossy **action abstraction** on the draw decision. A stronger solver
would let CFR choose among a *set* of discard subsets (at least the few strategically
distinct ones — e.g. break vs. stand pat vs. snow lines). Expanding the draw action set
(and measuring with C3) is the draw-game analogue of action abstraction; it is where 2-7
TD / Badugi quality is currently capped.

**C6. Optional speed: VR-MCCFR baselines and/or warm starting.** *(Medium value.)*
Adding state-action **baselines** (Schmid et al. 2019) can cut variance ~3 orders of
magnitude and is what makes more iterations affordable on a fixed compute budget;
**warm starting** (Brown & Sandholm 2016) lets a finer-abstraction run resume from a
coarser solution in one traversal. Both are accelerants, not correctness changes — do them
after C1–C3.

**Calibration for the overnight run.** Cepheus needed ~10¹⁴ infosets and 900 core-years to
reach 0.986 mbb/g. Our abstracted games are 10⁵–10⁶ infosets; the **2.4M / 1.4M / 0.45M**
iterations from the overnight job put all three in the "stable blueprint" regime. C3 will
tell us, in mbb/hand, exactly how far each still is from the abstraction's optimum — and
C4/C5 are what move the *abstraction's* optimum closer to true GTO.

---

## PART IV — A DEEPSTACK/ReBeL-STYLE NEURAL SOLVER FOR STUD 8

**Why Stud 8 (and not the draw games).** Stud has **rich public information** (4 upcards
per player by 6th street, plus all folded/dead upcards). Given the public board, each
player's hidden holding is a bounded set, so the **public belief state** is compact and
well-conditioned — the exact property DeepStack/ReBeL exploit. (See Module 8 for why draw
games fail this test.)

**1. The public belief state for Stud 8.**
- **Public state `s_pub`:** both players' **upcards** in order, all **dead upcards** (folded
  cards / the cards exposed in prior hands are out of scope, but the opponent's visible
  board and our own upcards are public), the **betting history** of the current and prior
  streets, the **pot/stack**, and **whose turn**.
- **Private infostate of a player:** their **down cards** — 2 on 3rd street, growing to 3
  by 7th (2 initial down + the 7th-street down card). Given `s_pub`, the set of possible
  holdings is the combinations of unseen cards consistent with the board — on 3rd street
  ≈ C(unseen, 2), shrinking the more cards are visible.
- **PBS** β = (r_me, r_opp), two probability vectors (ranges) over each player's possible
  down-card holdings consistent with `s_pub`. Bucketing (below) keeps these vectors small.

**2. Counterfactual-value network.** Following DeepStack/ReBeL:
- **Inputs:** (a) pot as a fraction of stacks; (b) an encoding of the public board — both
  players' upcards (rank+suit, as embeddings à la Deep CFR) and dead cards; (c) the two
  **range vectors** over (bucketed) holdings; (d) the street index. Hi/lo games add the
  current best **low draw** structure to the public features.
- **Outputs:** a **counterfactual value per holding (per bucket), per player**, expressed
  **as a fraction of the pot** (the normalization DeepStack found essential for
  generalization), wrapped in a **zero-sum correction layer** (subtract half the
  range-weighted value-sum from each side).
- **Architecture:** start with DeepStack's proven shape — ~7 fully-connected layers × ~500
  **PReLU** units, **Huber** loss, **Adam**. One network per street (3rd–7th), or a single
  street-conditioned net; an **exact small net** for the latest street where the holding
  space is tiny (analogous to DeepStack's 169-hand pre-flop net).
- **Hi/lo split:** the **terminal evaluator already computes the hi/lo split** (we built
  `describeHi7`/`describeLo8` and the split-pot utility). The value targets are simply the
  CFVs under that split payoff — no architectural change, the net just learns a
  two-component value surface.

**3. Bucketing for the ranges.** Use the **EMD/potential-aware imperfect-recall**
clustering from Part III/C4 to compress each player's holding distribution to ~1,000
buckets (DeepStack's number). Stud's hi/lo nature means clustering features should capture
**both** the high-hand strength distribution **and** the low-draw distribution
(8-or-better) — an OCHS-style feature pair.

**4. Training-data generation (the expensive part).** Mirror DeepStack/ReBeL:
- Solve **random Stud 8 subgames** rooted at sampled public states with a **tabular CFR+
  / CFR-D solver, no card abstraction**, ~1,000 iterations each, restricted bet actions
  (fixed-limit makes this *easy* — the action set is just check/call/complete/raise/fold,
  far simpler than no-limit bet sizing).
- Sample **ranges** with a coverage-oriented recursive procedure (ReBeL's random-iteration
  trick) so the net is accurate on the PBSs that *actually arise*, not just equilibrium
  ranges.
- Log **(PBS → CFV vector)** pairs. Start with the **river/7th-street and 6th-street nets**
  (smallest subgames), then use them as leaf evaluators to generate earlier-street data
  (DeepStack's bootstrapping: the turn net trains the flop net). Fixed-limit Stud 8
  subgames are **dramatically smaller than no-limit hold'em**, so this is far cheaper than
  DeepStack's 175 core-years — plausibly a single beefy machine or a modest cluster.

**5. At the table: continual re-solving.** Maintain our **own range** and the **opponent's
counterfactual values**; at each decision build a **depth-limited subgame**, set leaf
values from the net, run CFR (CFR+/DCFR) to a few hundred iterations, act on the average
strategy, and update range + opponent CFVs after every action/card (the **safe re-solving
gadget**, Brown & Sandholm 2017). This is *exactly* the study-tool feature you want:
**solve any Stud 8 spot on demand**, not just spots in a precomputed catalog.

**6. Guarantees & evaluation.** ReBeL gives a **provable approximate-Nash** at test time
with exploitability scaling as (value-net error) + O(1/√(CFR iters)). Validate with the
**LBR** lower bound and, on small Stud 8 variants, **exact exploitability** (Part III/C3).

**Sequencing.** This is a multi-month, Python+GPU effort (the JS MCCFR engine stays as the
*tabular subgame solver* that generates training data). Milestones: (i) a tabular Stud 8
**CFR-D subgame solver** + exact best-response evaluator; (ii) EMD bucketing for stud
hi/lo ranges; (iii) the 7th/6th-street value nets + data pipeline; (iv) continual
re-solving at the table; (v) earlier-street nets via bootstrapping. Each milestone is
independently useful — (i)+(ii) already sharpen the *catalog* solver we ship today.

---

*End of document. Companion: `solver/README.md` (module overview), `solver/train.js`
(training CLI), `.github/workflows/train-solvers.yml` (overnight training).*
