# futurega.me Premium Plan — Pricing the Solver as the Moat

Last updated: 2026-06-30
Companion to `MONETIZATION-PLAN.md` (the broad freemium/suite plan) and
`solver/ROADMAP.md` (the technical sequencing). This doc covers one question
the other two don't: **what makes futurega.me sophisticated enough to command
a price that isn't utility-app money — and how to package and sell it.**

---

## 0. The thesis in one paragraph

`MONETIZATION-PLAN.md` monetizes the **commodity layer** — schedule browsing,
P&L tracking, replayer, staking — and benchmarks it against bankroll trackers
and SharkScope ($2–15/mo). That ceiling is real and it is low, because every
one of those features has competitors. The **mixed-game CFR solver** is the
only thing in this codebase with *no commercial competitor*, and it is the only
thing that belongs in the GTO-tool price band (GTO Wizard $50–130/mo,
PioSOLVER hundreds one-time). It is also, right now, the only feature entirely
absent from the monetization plan — it sits behind an admin gate, invisible to
the tier system. **The premium price comes from the solver. Everything else is
the funnel that feeds it.**

---

## 1. The gap in the current plan

| | Commodity layer (priced today) | Solver layer (unpriced) |
|---|---|---|
| Features | schedules, tracking, replayer, staking, social | mixed-game GTO solver, trainer, self-play viewer |
| Competitors | PokerTracker, SharkScope, PokerAtlas, Nash Bankroll | **none** for mixed games |
| Benchmark band | $2–15/mo | $50–130/mo (GTO Wizard), $250–1100 one-time (Pio) |
| Willingness to pay | seasonal, price-sensitive | year-round, high-intent students |
| In the tier system? | yes (`MONETIZATION-PLAN.md §6`) | **no** — admin-gated `Hands` tab only |

The existing plan's `Pricing Benchmarks` section (§7) lists nine products. Not
one is a solver, because when the plan was written the solver wasn't framed as
the product. That framing is the whole opportunity: the moment futurega is
benchmarked against GTO Wizard instead of SharkScope, the defensible price
roughly triples — but *only for the solver surface*, and *only if it clears the
trust bar* (§3).

---

## 2. Why the solver is the moat

- **NLHE/PLO solving is saturated.** Pio, GTO Wizard, Simple Postflop, etc.
  Entering there means competing on price against funded incumbents. Dead end.
- **Mixed games have essentially zero study tooling.** H.O.R.S.E., 8-Game,
  Dealer's Choice, the $50k Poker Players Championship — the highest-buy-in,
  highest-skill events in the game — and a player who wants to study them GTO
  has *nowhere to go*. That's not a crowded niche; it's an empty one.
- **You already hold the hard part.** From `solver/`: a validated
  external-sampling MCCFR engine (DCFR(3/2,0,2), Kuhn-verified), evaluators and
  heads-up fixed-limit implementations for **2-7 Triple Draw, Badugi, Stud 8**,
  a training CLI with checkpoint/resume, overnight GitHub Actions training, and
  a study UI (Solver Trainer quiz + Watch Solver self-play viewer). The seed of
  a category-defining product is built and running.
- **The audience overlaps the funnel perfectly.** The WSOP/series players the
  scheduler already attracts in May–July are exactly the people who play mixed
  events and would pay to study them. The scheduler acquires them; the solver
  retains and monetizes them year-round.

This last point quietly fixes the central tension `MONETIZATION-PLAN.md §0`
worries about — summer churn. The scheduler is seasonal by nature. **The solver
is a year-round study product.** It is the off-season retention engine the
current plan doesn't have.

---

## 3. What "sophisticated enough to command a price" actually requires

Pricing against GTO Wizard means meeting a GTO-tool buyer's bar. Four things,
in order. The technical detail for each lives in `solver/ROADMAP.md`; here is
what each one is *for commercially*.

1. **Trust — non-negotiable, ships first.** Nobody pays for a solver they can't
   trust. The deliverable is a visible **exploitability number per game**
   (chips/hand), so a paying user can see how close to GTO each strategy is.
   This is `ROADMAP.md` Phase 1.3 and it gates everything downstream — both
   technically (abstraction quality is non-monotonic) and commercially (it's
   the credibility you're charging for). *Without this, there is no premium
   product, only a curiosity.*

2. **Breadth — the price-justification engine.** Each solved game is a bullet
   on the sales page and a reason the price holds. Current coverage: Stud 8,
   2-7 TD, Badugi. **Razz is the next piece** — it's the low half of the Stud 8
   evaluator you already wrote on the stud betting tree you already built, so
   it's the cheapest game you'll ever add, and it advances H.O.R.S.E. coverage.
   Then Limit Hold'em, Omaha-8, Stud-hi complete **H.O.R.S.E.**; add A-5 Triple
   Draw and Badeucy/Badacey and you cover most of **8-Game / Dealer's Choice**.
   "The only GTO tool that covers the full mix" is the headline.

3. **Study depth — the actual product.** A solver you can only watch is a demo.
   A solver you *study against* is the product (`ROADMAP.md` Phase 3):
   - **Range / frequency explorer** — browse every bucket's mixed strategy, not
     just self-play.
   - **Spot drilling** — filter the trainer to a chosen street/situation
     ("3rd-street facing a complete", "pre-draw BB defense").
   - **Leak detection — the killer feature.** Import your own session hands,
     compare your frequencies to the solver's, surface your biggest deviations
     in chips/hand. This reuses the exploitability/best-response math from
     step 1, and it is the single feature most worth paying for because it turns
     a static solution into a personalized coach. Nothing on the market does
     this for mixed games.

4. **Polish — make it a product, not an admin tool.** Today the solver lives on
   the admin-gated `Hands` tab (`BottomNav.jsx` shows it only when `isAdmin`).
   It needs to become a first-class **Study** surface with its own entitlement,
   onboarding, and paywall — visible to every user as a thing they can buy.

**Minimum viable premium** = step 1 (exploitability on the 3 existing games) +
step 3's range explorer + spot drilling, lifted out of the admin gate. That is
already worth charging for. Leak detection and Razz make it worth charging
*more*.

---

## 4. Packaging & pricing

### Recommendation: a separate Study entitlement, anchored to GTO Wizard

Do **not** fold the solver into the existing $7.99 Pro. That bundles a
$50/mo-band product into a $8/mo-band price and destroys the anchor. Instead,
add the solver as its own pillar — which the suite architecture in
`MONETIZATION-PLAN.md §10` already accommodates. It becomes the **fourth app**:

> futurega.me: **Planner** · **Replayer** · **Manager** · **Study**

Concrete pricing (cheaper than GTO Wizard because narrower and heads-up; far
above the scheduler Pro because it's a different buyer):

| Plan | Includes | Monthly | Annual |
|---|---|---|---|
| **Study** (single-app) | full solver: all games, range explorer, spot drilling, leak detection | **$19.99** | **$149.99** |
| **Study + Suite** | Study + Planner/Replayer/Manager | **$24.99** | **$179.99** |

Anchoring math the buyer does in their head: GTO Wizard is ~$50–130/mo and
*doesn't cover these games at all*; Study is $20/mo and is the only tool that
does. That's an easy yes for a mixed-game player, and it more than doubles the
ceiling the commodity plan tops out at.

### Free taster = the Watch Solver viewer

Same logic as the replayer-GIF watermark in `MONETIZATION-PLAN.md §10`: the
**Watch Solver** self-play viewer is inherently shareable and makes a great free
hook — let free users watch full solved hands on **one or two games** (say
Razz + 2-7 TD). Gate the trainer, range explorer, spot drilling, leak
detection, and the rest of the games. Watching is marketing; *studying* is paid.

### How it slots into the code that already exists

The subscription plumbing is built — you don't need new infrastructure, just
new rows in the existing maps:

- `TIER_RANK` in `server.js` already has `suite_pro_plus / suite_pro /
  planner_pro / replayer_pro / manager_pro / free`. Add **`study_pro`** (and
  optionally bump `suite_pro_plus` to imply Study).
- `getActiveSubscriptionRow` / `/api/subscription` / the 14-day trial already
  resolve effective tier — Study inherits all of it for free.
- Replace the `isAdmin` check that reveals the solver UI with a feature-gate on
  the Study entitlement (the `useSubscription().has('study')` pattern the plan
  specifies in §11).
- Payment rails (Stripe/Apple) are the same ones §11 already scopes; Study is
  just another SKU funneling into the one `subscriptions` table.

So shipping Study monetization is **~one tier string + one feature gate +
one paywall screen** on top of work already designed.

---

## 5. How the loop runs it (and stays honest)

This is where your "passive / loop-built" goal and the premium goal converge —
the solver is the rare feature where a loop genuinely does the work:

- **Training is already a loop.** `ROADMAP.md` Phase 0 has overnight GitHub
  Actions training that stages new strategies onto a review branch. Compute is
  ~free on a public repo. Adding a game = adding an evaluator + rules config,
  then letting the loop train it.
- **The verifier is the exploitability meter.** This is the maker–checker
  discipline from the loop-engineering discussion, done right: the training run
  is the maker; the **exploitability number is the deterministic checker**.
  Deploy a strategy to paying users *only* when exploitability drops below a
  threshold. The stopping condition is an inequality on an observable, not "the
  agent says it's done" — exactly the anti-pattern guard.
- **Your role is the curiosity budget.** Review staged strategies on the branch
  before they ship; spot-check that mined heuristics read correctly (no "draw
  to a 6"). That's the human checkpoint on an otherwise-autonomous pipeline,
  and it's cheap.
- **Deploy code + strategies atomically** (`ROADMAP.md` cross-cutting
  principle): infoset keys change with the abstraction, so strategies ship with
  the code that produced them. The Actions workflow already stages both.

The dev side (range explorer, spot drilling, leak detection, the Study paywall)
is well-scoped, low-blast-radius iterative work — the kind a coding loop grinds
on safely because nothing here touches money or external orders. The only
"production" risk is shipping a weakly-trained strategy, and the exploitability
gate is precisely the verifier that prevents it.

---

## 6. Sequenced next steps

Each step is independently shippable and ordered by leverage.

1. **Exploitability meter** (`ROADMAP.md` Phase 1.3) — the trust bar; gates
   everything. *Until this exists, there is no premium product.*
2. **Add Razz** — cheapest game to add, advances H.O.R.S.E., proves the
   "add-a-game" loop end to end.
3. **Lift the solver out of the admin gate** into a real **Study** tab; add
   `study_pro` to `TIER_RANK` + the feature matrix; wire the paywall. Free
   taster = Watch Solver on 1–2 games.
4. **Range/frequency explorer + spot drilling** (Phase 3.1–3.2) — turns the demo
   into a study tool worth $20/mo.
5. **Leak detection** (Phase 3.3) — the moat feature; justifies the price and
   the annual plan.
6. **Complete the mix** — LHE, Omaha-8, Stud-hi (H.O.R.S.E.), then A-5 TD /
   Badeucy (8-Game). Each launch is a marketing beat and a price-hold reason.

---

## 7. Revenue framing (small, real, sticky)

This is a niche, and that's the point — niches with no competitor hold price.
A mixed-game student base is small but high-intent and near-zero marginal
compute (strategies are precomputed; serving is static JSON):

| Paying Study subscribers | @ $19.99/mo (gross/yr) |
|---|---|
| 200 | ~$48,000 |
| 500 | ~$120,000 |
| 1,000 | ~$240,000 |

These stack *on top of* the commodity-tier revenue in
`MONETIZATION-PLAN.md §9`, and — unlike the seasonal scheduler line — they
recur year-round. The scheduler fills the funnel every summer; the solver is
what keeps the meter running in November. That combination, not either piece
alone, is what makes futurega.me worth a serious price.

---

## TL;DR

The scheduler is the funnel; the **solver is the product that commands the
price**. It's the only thing here with no competitor, it's aimed at the exact
players the scheduler already attracts, it fixes the summer-churn problem, and
its core engine is already built and training itself on a loop. Ship trust
(exploitability) first, package it as a separate **Study** entitlement priced
against GTO Wizard rather than SharkScope, and let the training loop expand
coverage game by game with the exploitability meter as the verifier.
