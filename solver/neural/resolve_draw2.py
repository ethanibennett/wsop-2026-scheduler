"""M2a: EXACT 2-ROUND (one-draw) BADUGI re-solver — the draw resolver's OWN
private-draw CHANCE transition chained onto the verified M1 single-round tree.

WHAT THIS ADDS OVER M1 (resolve_draw.py):
  M1 solved ONE betting round -> badugi showdown. M2a solves the full one-draw
  subgame

      pre-draw betting round  ->  DRAW NODE  ->  post-draw betting round  ->  showdown

  as ONE 2-round tree. It reuses resolve.py's game-agnostic CFR+ machinery for
  the betting/showdown, and adds ONE new node type — the DRAW BOUNDARY — that is
  this resolver's OWN transition. It does NOT reuse or touch stud's `_deal_leaf`
  / `_exact_6th_to_7th` / `encode_board` public-card seams: a private draw does
  NOT collapse to a shared public subgame. Each seat discards + redraws
  INDEPENDENTLY from the shared unseen deck.

THE ONE-TREE DESIGN (why this is exact AND tractable):
  * The holding space is a SINGLE shared universe of 4-card hands (all C(live,4)),
    used for BOTH the pre-draw and the post-draw round. `reach[0]`/`reach[1]` are
    each seat's distribution over that SAME universe; pre-draw they are the input
    ranges, post-draw they are the drawn-into distributions. Since a pre-draw and
    a post-draw hand are both just 4-card combos over the same deck, no
    index-space change is needed across the draw — only a REACH REMAP.
  * DRAW DECISION nodes (phase='draw'): ordinary decision nodes keyed by curSeq,
    so the inherited regret-matching learns each seat's keep/discard (count)
    strategy exactly like a bet node. OOP (seat 1) draws first, then IP (seat 0)
    — draw-game.js order. Legal actions are the union of draw counts; a holding
    whose drawOptions omits a count contributes 0 reach down that branch
    (a fixed per-holding sigma mask, `self._dmask`).
  * The DRAW CHANCE node (phase='replace'): a private-per-seat reach remap. For
    seat p that chose count k, the post-draw reach is
        reach_post[p] = PROJ[p][k] @ reach_pre[p],
    where PROJ[p][k] is the REACH-INDEPENDENT sparse matrix that sends pre-hand i
    to each post-hand (choose_keep(i,k) ∪ R, R a k-subset of the unseen deck) with
    the uniform replacement weight 1/C(|deck−hand_i|,k). Built ONCE at
    construction. After the remap the traversal recurses straight into the
    post-draw betting root — the SAME strategy tables — so the two rounds solve
    JOINTLY as one subgame (no nested re-solve). The seats' shared-deck coupling
    (their final hands can't overlap) is enforced exactly at the SHOWDOWN leaf by
    the inherited `cardset` collision exclusion — the marginal per-seat draw law
    is the correct conditional, and the coupling only affects which (i,j) showdown
    pairs are legal, which the leaf already handles. (Certified against an
    independent brute force in the self-tests — gate d.)

  Because `_cfr`/`_eval_avg`/`_br`/`strategy_report` are written for pure DECISION
  trees, the replacement CHANCE node is added by OVERRIDING those four with a
  thin `phase=='replace'` branch that does the reach remap + straight recursion
  (no per-holding sigma, no regret) and otherwise defers to identical logic. The
  fold/showdown leaf and the CFR+ update rule are untouched.

ROOT STATE (WART FIX vs M1): `resolve_draw2` takes an arbitrary pre-draw start
(pot / contributions / base / bets / toAct), so it re-solves ANY mid-hand
pre-draw spot — not just the hardcoded blinds pot=3 (M1's `_root_node` ignored
its pot= arg).

Pure Python (no numpy/torch); self-tests on run.
"""
from __future__ import annotations
from itertools import combinations
from typing import Dict, List, Optional, Tuple

from pbs import DECK, rank_val
from resolve import _Resolver, GameSpec, _regret_match_plus, _sort_holding
from eval_badugi import badugi_share, badugi_score, best_badugi_subset

SMALL_BET, BIG_BET, CAP = 2, 4, 4
HAND_SIZE = 4


# ── badugi draw abstraction (faithful port of badugi-game.js) ───────────────
def choose_keep(hand: tuple, draw_count: int) -> tuple:
    """Keep the best-scoring valid subset of size len-draw_count
    (badugi-game.js chooseKeep). Returns a sorted tuple of kept cards."""
    keep_n = len(hand) - draw_count
    if keep_n <= 0:
        return tuple()
    best, best_score = None, None
    n = len(hand)
    for mask in range(1, 1 << n):
        sub = tuple(hand[i] for i in range(n) if mask & (1 << i))
        if len(sub) != keep_n:
            continue
        v = badugi_score(list(sub))
        if best_score is None or v < best_score:
            best_score, best = v, sub
    return tuple(_sort_holding(best)) if best else tuple()


def draw_options(hand: tuple) -> List[int]:
    """Draw counts worth considering: snow(0), the natural draw, and break(1)
    if already a complete badugi (badugi-game.js drawOptions)."""
    natural = 4 - len(best_badugi_subset(list(hand)))
    opts = {0, natural}
    if natural == 0:
        opts.add(1)
    return sorted(opts)


def _no_stud_seam(*_a):
    raise NotImplementedError("draw games have no stud bring-in / upcard seat rule")


BADUGI = GameSpec('badugi', badugi_share, _no_stud_seam, _no_stud_seam)


class _DrawResolver2(_Resolver):
    """pre-draw round -> DRAW node (decisions + private replacement chance) ->
    post-draw round -> showdown, solved as ONE tree over a shared 4-card-hand
    holding universe. Overrides the betting seams + the root + a thin
    replacement-chance branch in the four traversals."""

    def __init__(self, holdings, start: dict, range0, range1, iters: int,
                 pre_bet: int = SMALL_BET, post_bet: int = BIG_BET,
                 live: Optional[List[str]] = None,
                 game: Optional[GameSpec] = None):
        self._start = dict(start)
        self._pre_bet = pre_bet
        self._post_bet = post_bet
        pot = start['contrib'][0] + start['contrib'][1]
        super().__init__(street=7, up=[[], []], dead=[], pot=pot,
                         range0=range0, range1=range1, leaf_fn=None,
                         iters=iters, depth_limit=None, holdings=holdings,
                         share_matrix=None, game=game or BADUGI)
        self.k = HAND_SIZE
        self.st0 = -1
        # the unseen deck the replacement draws from (no public cards in a draw
        # game). Restrict to `live` for a tiny exact instance.
        self._live = list(live) if live is not None else list(DECK)
        # index holdings by their CANONICAL (deck-sorted) form so a projected
        # post-draw hand — built as a set and sorted by _sort_holding — matches
        # regardless of the caller's holding tuple order (combinations order in
        # `live` is NOT deck-sorted, e.g. ('As','2d',..) vs sorted ('2d',..,'As')).
        self._hidx = {tuple(_sort_holding(h)): i
                      for i, h in enumerate(self.holdings)}
        self._build_draw_structure()
        self._build_dense_showdown()

    def _build_dense_showdown(self):
        """Dense, collision-aware showdown tables built ONCE (reach-independent):
          _sh[i][j]  = seat-0 pot fraction (holding i vs j), 0 if they collide
          _ok[i]     = list of j that DON'T collide with i (share cards)
        Replaces the per-leaf dict/frozenset showdown loop (the O(H^2) hot path
        run at every showdown leaf across the whole 2-round tree) with plain
        list indexing — the single biggest per-iteration speedup at H=70."""
        H = self.H
        cs = self.cardset
        sh = [[0.0] * H for _ in range(H)]
        ok = [[] for _ in range(H)]
        for i in range(H):
            ci = cs[i]
            oki = ok[i]
            shi = sh[i]
            for j in range(H):
                if ci & cs[j]:
                    continue
                shi[j] = self._share(i, j)
                oki.append(j)
        self._sh = sh
        self._ok = ok

    # ── reach-independent draw structure (built ONCE) ───────────────────────
    def _build_draw_structure(self):
        """Precompute, for each holding i and each draw count k in drawOptions(i):
          PROJ[k][i] = list of (post_hand_index, weight)  (weight = 1/#combos)
        plus the union of draw counts and the per-count per-holding legality mask.
        Post-draw hands live in the SAME holding index space (all are 4-card
        combos over the deck); any post-hand not already in `self.holdings` would
        be unreachable given `live`, so it will always be present for a full
        C(live,4) holding list — which is what the exact instance uses."""
        counts = set()
        for h in self.holdings:
            counts.update(draw_options(h))
        self._ucd = sorted(counts)
        # PROJ[k] : {i: [(j, w), ...]}   ;  legal[k] : set of holdings allowing k
        self._proj: Dict[int, Dict[int, List[Tuple[int, float]]]] = {}
        self._legal_k: Dict[int, set] = {}
        for k in self._ucd:
            projk: Dict[int, List[Tuple[int, float]]] = {}
            legalk = set()
            for i, hand in enumerate(self.holdings):
                if k not in draw_options(hand):
                    continue
                legalk.add(i)
                kept = choose_keep(hand, k)
                if k == 0:
                    j = self._hidx.get(tuple(_sort_holding(kept)))
                    projk[i] = [(j, 1.0)] if j is not None else []
                    continue
                removed = set(hand)
                pool = [c for c in self._live if c not in removed]
                combos = list(combinations(pool, k))
                w = 1.0 / len(combos)
                acc: Dict[int, float] = {}
                for R in combos:
                    j = self._hidx.get(tuple(_sort_holding(set(kept) | set(R))))
                    if j is not None:
                        acc[j] = acc.get(j, 0.0) + w
                projk[i] = list(acc.items())
            self._proj[k] = projk
            self._legal_k[k] = legalk
        # per-holding legal ACTION-INDEX set for a draw node (indices into the
        # draw action list ['d%d'%k for k in ucd]); used to renormalize each
        # holding's draw sigma over only its legal counts (illegal counts get 0
        # and are NOT redistributed elsewhere — so no reach mass is created or
        # lost across the draw decision -> zero-sum holds to machine precision).
        self._dlegal_ai = []
        for i, hand in enumerate(self.holdings):
            opts = set(draw_options(hand))
            self._dlegal_ai.append(
                [ai for ai, k in enumerate(self._ucd) if k in opts])

    def _remap(self, seat_reach: List[float], k: int) -> List[float]:
        """Project a seat's pre-draw reach through count-k keep+replacement into
        post-draw reach (same holding index space). Holdings that don't allow k
        contribute nothing (masked)."""
        out = [0.0] * self.H
        projk = self._proj[k]
        for i, r in enumerate(seat_reach):
            if r == 0.0:
                continue
            row = projk.get(i)
            if not row:
                continue
            for j, w in row:
                out[j] += r * w
        return out

    def _project_back(self, post_cfv: List[float], k: int) -> List[float]:
        """Project a POST-draw counterfactual value back to PRE-draw holdings via
        the TRANSPOSE of the reach remap: pre-hand i's cfv = Σ_j PROJ[k][i][j]·
        post_cfv[j] (the replacement-weighted average of the post-hand cfvs it
        maps to). Reach forward uses PROJ; value backward uses PROJ^T — together
        they make the chance node value-consistent and ZERO-SUM. A holding that
        can't choose k gets 0 (its reach is 0 down this branch, so its cfv is
        unused)."""
        out = [0.0] * self.H
        projk = self._proj[k]
        for i in range(self.H):
            row = projk.get(i)
            if not row:
                continue
            acc = 0.0
            for j, w in row:
                acc += w * post_cfv[j]
            out[i] = acc
        return out

    def _dmask(self, seat_reach: List[float], k: int) -> List[float]:
        """Zero the reach of holdings that would not choose count k (the per-hand
        legal draw set) — the sigma mask for the draw decision branch."""
        legal = self._legal_k[k]
        return [seat_reach[i] if i in legal else 0.0 for i in range(self.H)]

    def _draw_sigma(self, raw_sigma, A):
        """Renormalize each holding's draw-node action distribution over ONLY its
        legal draw counts (illegal counts -> 0, legal renormalized to sum 1). If a
        holding has 0 legal counts (never — 0 is always legal), fall back to
        uniform. Applied to both the CFR+ current sigma and the average sigma so
        reach is conserved and cfv/regret are consistent."""
        out = [[0.0] * A for _ in range(self.H)]
        for i in range(self.H):
            legal_ai = self._dlegal_ai[i]
            s = 0.0
            ri = raw_sigma[i]
            for ai in legal_ai:
                s += ri[ai]
            oi = out[i]
            if s > 0:
                for ai in legal_ai:
                    oi[ai] = ri[ai] / s
            else:
                u = 1.0 / len(legal_ai)
                for ai in legal_ai:
                    oi[ai] = u
        return out

    # ── fast dense showdown / fold leaf (overrides the parent's dict path) ───
    def _leaf_value(self, node: dict, reach):
        H = self.H
        ok = self._ok
        if node['folded'] is not None:
            # fold: the folder loses their contribution; project over the
            # non-colliding opponent reach (dense _ok list, no frozensets).
            c = node['contrib']
            if node['folded'] == 0:
                u0, u1 = -c[0], c[0]
            else:
                u0, u1 = c[1], -c[1]
            r0, r1 = reach[0], reach[1]
            cfv0 = [0.0] * H
            cfv1 = [0.0] * H
            for i in range(H):
                s = 0.0
                for j in ok[i]:
                    s += r1[j]
                cfv0[i] = u0 * s
            for j in range(H):
                s = 0.0
                for i in ok[j]:
                    s += r0[i]
                cfv1[j] = u1 * s
            return cfv0, cfv1
        # showdown, dense: cfv0[i] = Σ_{j !collide} r1[j]·(sh[i][j]·pot − c0)
        c = node['contrib']
        pot = c[0] + c[1]
        c0, c1 = c[0], c[1]
        r0, r1 = reach[0], reach[1]
        sh = self._sh
        cfv0 = [0.0] * H
        cfv1 = [0.0] * H
        for i in range(H):
            oki = ok[i]
            shi = sh[i]
            acc = 0.0
            for j in oki:
                acc += r1[j] * (shi[j] * pot - c0)
            cfv0[i] = acc
        for j in range(H):
            okj = ok[j]                               # symmetric collision set
            acc = 0.0
            for i in okj:
                acc += r0[i] * ((1.0 - sh[i][j]) * pot - c1)
            cfv1[j] = acc
        return cfv0, cfv1

    def _br_leaf(self, node: dict, reach_fixed, brp: int):
        if node['folded'] is not None:
            return super()._br_leaf(node, reach_fixed, brp)
        c = node['contrib']
        pot = c[0] + c[1]
        H = self.H
        sh, ok = self._sh, self._ok
        out = [0.0] * H
        if brp == 0:
            for i in range(H):
                acc = 0.0
                shi = sh[i]
                for j in ok[i]:
                    acc += reach_fixed[j] * (shi[j] * pot - c[0])
                out[i] = acc
        else:
            for j in range(H):
                acc = 0.0
                for i in ok[j]:
                    acc += reach_fixed[i] * ((1.0 - sh[i][j]) * pot - c[1])
                out[j] = acc
        return out

    # ── root: arbitrary pre-draw start state (WART FIX) ─────────────────────
    def _root_node(self, pot: float) -> dict:
        s = self._start
        return dict(contrib=list(s['contrib']), base=s['base'], bets=s['bets'],
                    toAct=s['toAct'], acted=list(s['acted']), folded=None,
                    phase='bet', curSeq='', k0=None, k1=None)

    def _is_leaf(self, node: dict) -> bool:
        return node['folded'] is not None or node['phase'] == 'showdown'

    def _legal_actions(self, node: dict) -> List[str]:
        if node['phase'] == 'draw':
            return ['d%d' % k for k in self._ucd]
        p = node['toAct']
        facing = node['contrib'][1 - p] - node['contrib'][p]
        if facing > 0:
            acts = ['f', 'c']
            if node['bets'] < CAP:
                acts.append('r')
            return acts
        acts = ['k']
        if node['bets'] < CAP:
            acts.append('b')
        return acts

    def _apply_action(self, node: dict, a: str) -> dict:
        if a[0] == 'd':
            return self._apply_draw(node, int(a[1:]))
        n = dict(node)
        n['contrib'] = node['contrib'][:]
        n['acted'] = node['acted'][:]
        p = n['toAct']
        n['acted'][p] = True
        n['curSeq'] += a
        facing = n['contrib'][1 - p] - n['contrib'][p]
        if a == 'f':
            n['folded'] = p
            return n
        if a == 'c' or a == 'k':
            n['contrib'][p] += facing
            if n['acted'][1 - p]:
                if n.get('drawn'):
                    n['phase'] = 'showdown'          # post-draw round closed
                else:
                    self._end_pre_bet(n)             # -> draw node (OOP first)
            else:
                n['toAct'] = 1 - p
            return n
        n['contrib'][p] = n['contrib'][1 - p] + \
            (self._post_bet if n.get('drawn') else self._pre_bet)
        n['bets'] += 1
        n['toAct'] = 1 - p
        return n

    def _end_pre_bet(self, n: dict) -> None:
        n['phase'] = 'draw'
        n['toAct'] = 1                                # OOP/BB draws first
        n['curSeq'] += '/'                            # separate pre/draw history

    def _apply_draw(self, node: dict, k: int) -> dict:
        n = dict(node)
        n['curSeq'] += 'd%d' % k
        p = node['toAct']
        if p == 1:                                    # OOP drew -> IP draws next
            n['k1'] = k
            n['toAct'] = 0
            return n
        n['k0'] = k                                   # IP drew -> replacement chance
        n['phase'] = 'replace'
        return n

    def _post_round_node(self, node: dict) -> dict:
        """The post-draw betting root reached after the replacement chance.
        Fresh betting round: bets=0, OOP (seat 1) acts first, big bet."""
        n = dict(node)
        n['contrib'] = node['contrib'][:]
        n['phase'] = 'bet'
        n['bets'] = 0
        n['toAct'] = 1
        n['acted'] = [False, False]
        n['drawn'] = True
        n['curSeq'] += '|'                            # separate post-draw history
        return n

    # ── the four traversals: add the phase=='replace' CHANCE branch ─────────
    # Everything else is byte-identical to the inherited logic; only the chance
    # node (no per-holding sigma, a reach remap, straight recursion) is new.
    def _cfr(self, node: dict, reach):
        if node['phase'] == 'replace':
            k0, k1 = node['k0'], node['k1']
            child = [self._remap(reach[0], k0), self._remap(reach[1], k1)]
            pcfv0, pcfv1 = self._cfr(self._post_round_node(node), child)
            # project post-draw CFVs back to pre-draw index space (PROJ^T)
            return self._project_back(pcfv0, k0), self._project_back(pcfv1, k1)
        if self._is_leaf(node):
            return self._leaf_value(node, reach)
        p = node['toAct']
        opp = 1 - p
        acts = self._legal_actions(node)
        A = len(acts)
        key = node['curSeq']
        is_draw = node['phase'] == 'draw'
        reg = self.regret.get(key)
        if reg is None:
            reg = [[0.0] * A for _ in range(self.H)]
            self.regret[key] = reg
            self.strat[key] = [[0.0] * A for _ in range(self.H)]
        strat_sum = self.strat[key]
        sigma = [_regret_match_plus(reg[i]) for i in range(self.H)]
        if is_draw:                                   # renormalize over legal cts
            sigma = self._draw_sigma(sigma, A)

        cfv_self = [0.0] * self.H
        cfv_opp = [0.0] * self.H
        child_self = [None] * A
        for ai, a in enumerate(acts):
            cr_p = [reach[p][i] * sigma[i][ai] for i in range(self.H)]
            child_reach = [None, None]
            child_reach[p] = cr_p
            child_reach[opp] = reach[opp]
            c0, c1 = self._cfr(self._apply_action(node, a), child_reach)
            cs = c0 if p == 0 else c1
            co = c1 if p == 0 else c0
            child_self[ai] = cs
            for i in range(self.H):
                cfv_self[i] += sigma[i][ai] * cs[i]
                cfv_opp[i] += co[i]

        for i in range(self.H):
            ri = reg[i]
            si = strat_sum[i]
            rp = reach[p][i]
            cs_i = cfv_self[i]
            ai_iter = self._dlegal_ai[i] if is_draw else range(A)
            for ai in ai_iter:
                ri[ai] = max(0.0, ri[ai] + child_self[ai][i] - cs_i)
                si[ai] += rp * sigma[i][ai]
        return (cfv_self, cfv_opp) if p == 0 else (cfv_opp, cfv_self)

    def _eval_avg(self, node: dict, reach):
        if node['phase'] == 'replace':
            k0, k1 = node['k0'], node['k1']
            child = [self._remap(reach[0], k0), self._remap(reach[1], k1)]
            pcfv0, pcfv1 = self._eval_avg(self._post_round_node(node), child)
            return self._project_back(pcfv0, k0), self._project_back(pcfv1, k1)
        if self._is_leaf(node):
            return self._leaf_value(node, reach)
        p = node['toAct']
        opp = 1 - p
        acts = self._legal_actions(node)
        A = len(acts)
        key = node['curSeq']
        is_draw = node['phase'] == 'draw'
        avg = [self._avg_sigma_row(key, i, A) for i in range(self.H)]
        if is_draw:
            avg = self._draw_sigma(avg, A)
        cfv_self = [0.0] * self.H
        cfv_opp = [0.0] * self.H
        for ai, a in enumerate(acts):
            cr_p = [reach[p][i] * avg[i][ai] for i in range(self.H)]
            child_reach = [None, None]
            child_reach[p] = cr_p
            child_reach[opp] = reach[opp]
            c0, c1 = self._eval_avg(self._apply_action(node, a), child_reach)
            cs = c0 if p == 0 else c1
            co = c1 if p == 0 else c0
            for i in range(self.H):
                cfv_self[i] += avg[i][ai] * cs[i]
                cfv_opp[i] += co[i]
        return (cfv_self, cfv_opp) if p == 0 else (cfv_opp, cfv_self)

    def _br(self, node: dict, reach_fixed, brp: int):
        if node['phase'] == 'replace':
            kf = node['k0'] if (1 - brp) == 0 else node['k1']
            kb = node['k0'] if brp == 0 else node['k1']
            child_fixed = self._remap(reach_fixed, kf)
            post_br = self._br(self._post_round_node(node), child_fixed, brp)
            # BR player's post-draw value projected back to its pre-draw hands
            return self._project_back(post_br, kb)
        if self._is_leaf(node):
            return self._br_leaf(node, reach_fixed, brp)
        p = node['toAct']
        acts = self._legal_actions(node)
        A = len(acts)
        key = node['curSeq']
        is_draw = node['phase'] == 'draw'
        if p == brp:                                  # BR player maximizes/holding
            children = []
            for a in acts:
                ch = self._br(self._apply_action(node, a), reach_fixed, brp)
                if is_draw:
                    legal = self._legal_k[int(a[1:])]
                    ch = [ch[i] if i in legal else -1e30 for i in range(self.H)]
                children.append(ch)
            return [max(children[ai][i] for ai in range(A))
                    for i in range(self.H)]
        out = [0.0] * self.H                          # fixed player: avg strategy
        avg = [self._avg_sigma_row(key, i, A) for i in range(self.H)]
        if is_draw:
            avg = self._draw_sigma(avg, A)
        for ai, a in enumerate(acts):
            rf = [reach_fixed[i] * avg[i][ai] for i in range(self.H)]
            child = self._br(self._apply_action(node, a), rf, brp)
            for i in range(self.H):
                out[i] += child[i]
        return out

    def strategy_report(self):
        rep: Dict[str, dict] = {}

        def rec(node, reach):
            if node['phase'] == 'replace':
                child = [self._remap(reach[0], node['k0']),
                         self._remap(reach[1], node['k1'])]
                rec(self._post_round_node(node), child)
                return
            if self._is_leaf(node):
                return
            p = node['toAct']
            acts = self._legal_actions(node)
            A = len(acts)
            key = node['curSeq']
            is_draw = node['phase'] == 'draw'
            avg = [self._avg_sigma_row(key, i, A) for i in range(self.H)]
            if is_draw:
                avg = self._draw_sigma(avg, A)
            tot = sum(reach[p])
            if tot > 0:
                freq = [0.0] * A
                for i in range(self.H):
                    rp = reach[p][i]
                    row = avg[i]
                    for ai in range(A):
                        freq[ai] += rp * row[ai]
                freq = [f / tot for f in freq]
            else:
                freq = [1.0 / A] * A
            rep[key] = {'player': p, 'actions': acts, 'freq': freq}
            for ai, a in enumerate(acts):
                cr = [reach[p][i] * avg[i][ai] for i in range(self.H)]
                child_reach = [None, None]
                child_reach[p] = cr
                child_reach[1 - p] = reach[1 - p]
                rec(self._apply_action(node, a), child_reach)

        rec(self.root, [self.range[0][:], self.range[1][:]])
        return rep


# ── public entry ─────────────────────────────────────────────────────────────
def _blinds_start() -> dict:
    """draw-game.js newHand pre-draw start (SB 1 / BB 2, button acts first)."""
    return dict(contrib=[1, 2], base=0, bets=1, toAct=0, acted=[False, False])


def reachable_holdings(pre_hands, live):
    """The minimal CLOSED holding set for a sparse-support solve: the pre-draw
    hands plus EVERY post-draw image (choose_keep(h,k) ∪ any k-subset of the
    unseen deck) they can reach for k in drawOptions(h). Using this as the
    resolver's `holdings` keeps H tiny for a genuine larger-deck instance (so the
    two ranges can be truly disjoint) while remaining EXACT — the draw projection
    never leaves this set. Returns a deck-sorted list of 4-card tuples."""
    out = set()
    for h in pre_hands:
        h = tuple(_sort_holding(h))
        out.add(h)
        for k in draw_options(h):
            if k == 0:
                out.add(tuple(_sort_holding(choose_keep(h, k))))
                continue
            kept = choose_keep(h, k)
            pool = [c for c in live if c not in set(h)]
            for R in combinations(pool, k):
                out.add(tuple(_sort_holding(set(kept) | set(R))))
    return sorted(out, key=lambda t: tuple(DECK.index(x) for x in t))


def resolve_draw2(holdings, range0, range1, iters: int = 300,
                  start: Optional[dict] = None,
                  pre_bet: int = SMALL_BET, post_bet: int = BIG_BET,
                  live: Optional[List[str]] = None,
                  game: Optional[GameSpec] = None) -> dict:
    """Solve the exact 2-round (one-draw) badugi subgame.

    WART FIX: `start` is an arbitrary pre-draw start state
    (contrib=[c0,c1], base, bets, toAct, acted). Defaults to draw-game.js blinds.
    `holdings` should be all C(live,4) so the post-draw universe is present.
    """
    st = start if start is not None else _blinds_start()
    R = _DrawResolver2(holdings, st, list(range0), list(range1), iters=iters,
                       pre_bet=pre_bet, post_bet=post_bet, live=live,
                       game=game or BADUGI)
    cfv0, cfv1 = R.solve()
    return {
        'strategy': R.strategy_report(),
        'cfv': [cfv0, cfv1],
        'holdings': R.holdings,
        'pot': R.root['contrib'][0] + R.root['contrib'][1],
        'value': [sum(R.range[0][i] * cfv0[i] for i in range(R.H)),
                  sum(R.range[1][i] * cfv1[i] for i in range(R.H))],
        'iters': iters,
        'exploitability': R.exploitability(),
        '_resolver': R,
    }


if __name__ == "__main__":
    # Exact instance: a 12-card live deck with a SPARSE-SUPPORT holding universe.
    # Seat 0's hands are drawn from the first 6 cards and seat 1's from the last
    # 6, so EVERY seat0-vs-seat1 pre-draw pair is card-DISJOINT (a non-trivial
    # showdown; 8 cards is too tight — nearly every range pair collides). The
    # holding universe is `reachable_holdings` — both ranges' pre-draw hands +
    # every post-draw image they reach — so H stays TINY (fast, exact: the draw
    # projection never leaves the set) while the exact BR runs over the WHOLE
    # 2-round tree incl. the draw chance node. Each hand is a 3-card draw so the
    # draw DECISION and the post-draw betting both carry real strategic content.
    live = ['As', '2d', '3c', '4h', '5s', '6d',
            '7c', '8h', '9s', 'Td', 'Jc', 'Qh']
    pre0 = [('As', '2d', '3c', '5s'), ('As', '2d', '4h', '6d')]   # seat0 (cards 1-6)
    pre1 = [('7c', '8h', '9s', 'Jc'), ('8h', '9s', 'Td', 'Qh')]   # seat1 (cards 7-12)
    holds = reachable_holdings(pre0 + pre1, live)
    H = len(holds)
    hidx = {tuple(_sort_holding(h)): i for i, h in enumerate(holds)}

    def narrow(pres):
        r = [0.0] * H
        for h in pres:
            r[hidx[tuple(_sort_holding(h))]] = 1.0 / len(pres)
        return r
    r0 = narrow(pre0)
    r1 = narrow(pre1)

    def solve(rr0, rr1, iters, start=None, pre_bet=2, post_bet=4):
        st = start if start is not None else _blinds_start()
        R = _DrawResolver2(holds, st, list(rr0), list(rr1), iters=iters,
                           pre_bet=pre_bet, post_bet=post_bet, live=live)
        cfv0, cfv1 = R.solve()
        val = [sum(R.range[0][i] * cfv0[i] for i in range(H)),
               sum(R.range[1][i] * cfv1[i] for i in range(H))]
        return R, cfv0, cfv1, val

    # GATE (a): zero-sum residual on the 2-round subgame ~ machine precision.
    R, c0, c1, val = solve(r0, r1, iters=120)
    zs = abs(val[0] + val[1])
    assert zs < 1e-12, ('zero-sum', zs)
    # every decision node's range-aggregated frequencies form a distribution
    for nd in R.strategy_report().values():
        assert abs(sum(nd['freq']) - 1.0) < 1e-9, nd

    # GATE (b): exact BR exploitability -> 0 over the FULL 2-round tree (incl.
    # the draw chance node), monotone decreasing with iters. CFR+ on this
    # specific instance converges ~1/iters, so the in-file gate asserts the
    # DECREASE + a modest bound at 150 iters (~0.06); verify_draw2.py drives it
    # to <1e-2 at higher iters over the whole tree.
    def expl(iters):
        Rx, *_ = solve(r0, r1, iters=iters)
        return Rx.exploitability()
    e_lo = expl(10)
    e_mid = expl(60)
    e_hi = expl(150)
    assert e_hi < e_mid < e_lo, ('BR not monotone', e_lo, e_mid, e_hi)
    assert e_hi < 0.1 * e_lo, ('BR not shrinking enough', e_lo, e_hi)

    # GATE (d): brute-force reach/value correctness THROUGH the draw. Two single
    # hands, both drawing their natural count; the ONLY randomness is the joint
    # replacement. Independent brute force: enumerate every non-colliding
    # (R0,R1) replacement pair from the shared live deck, average the badugi
    # showdown chips. Compare to the resolver's replacement-chance remap +
    # showdown value on the same single-hand reach.
    allc = list(combinations(live, HAND_SIZE))

    def pick():
        for a in allc:
            if 4 - len(best_badugi_subset(list(a))) != 1:
                continue
            for b in allc:
                if set(a) & set(b):
                    continue
                if 4 - len(best_badugi_subset(list(b))) != 1:
                    continue
                return tuple(_sort_holding(a)), tuple(_sort_holding(b))
        return None, None
    h0, h1 = pick()
    assert h0 is not None, "need two disjoint natural-draw-1 hands"
    nat0 = 4 - len(best_badugi_subset(list(h0)))
    nat1 = 4 - len(best_badugi_subset(list(h1)))
    keep0 = set(choose_keep(h0, nat0))
    keep1 = set(choose_keep(h1, nat1))
    pot = 6.0
    pool0 = [c for c in live if c not in set(h0)]
    pool1 = [c for c in live if c not in set(h1)]
    # INDEPENDENT-MARGINAL reference (the range-CFR / DeepStack convention the
    # resolver uses): seat 0's counterfactual value for its pre-draw hand h0 is
    #   E_{R0}[ E_{R1, f0∩f1=∅}[ share(f0,f1)·pot − c0 ] ]
    # where R0 ~ uniform over pool0 (weight 1/n0), R1 ~ uniform over pool1 (weight
    # 1/n1), and colliding (f0,f1) pairs are DROPPED (not renormalized) — exactly
    # the unnormalized CFV the showdown leaf's `cardset` exclusion produces. This
    # certifies the reach projection PROJ (forward) + PROJ^T (backward) is exact.
    n0 = len(list(combinations(pool0, nat0)))
    n1 = len(list(combinations(pool1, nat1)))
    bf_seat0 = 0.0
    for R0 in combinations(pool0, nat0):
        f0 = keep0 | set(R0)
        for R1 in combinations(pool1, nat1):
            f1 = keep1 | set(R1)
            if f0 & f1:
                continue                              # shared deck: no overlap
            bf_seat0 += (1.0 / n0) * (1.0 / n1) * \
                (badugi_share(list(f0), list(f1)) * pot - pot / 2.0)

    # dedicated tiny resolver whose holding universe closes over BOTH test hands
    bf_holds = reachable_holdings([h0, h1], live)
    bidx = {tuple(_sort_holding(h)): i for i, h in enumerate(bf_holds)}
    i0, i1 = bidx[h0], bidx[h1]
    Hb = len(bf_holds)
    sr0 = [0.0] * Hb; sr0[i0] = 1.0
    sr1 = [0.0] * Hb; sr1[i1] = 1.0
    Rt = _DrawResolver2(bf_holds, dict(contrib=[3, 3], base=3, bets=0, toAct=1,
                                       acted=[False, False]),
                        sr0, sr1, iters=1, pre_bet=2, post_bet=4, live=live)
    # remap each seat's single-hand reach through the private replacement chance,
    # value the post-draw showdown (check-check == showdown EV) with the
    # INDEPENDENT parent dict path (a SECOND showdown implementation), then
    # PROJECT BACK to seat 0's pre-draw hand h0 (PROJ^T) — the exact quantity the
    # brute force computes.
    child = [Rt._remap(sr0, nat0), Rt._remap(sr1, nat1)]
    show = dict(contrib=[3.0, 3.0], folded=None, phase='showdown')
    scf0, _ = _Resolver._leaf_value(Rt, show, child)
    res_seat0 = Rt._project_back(scf0, nat0)[i0]
    assert abs(res_seat0 - bf_seat0) < 1e-9, ('brute-force reach/value',
                                              res_seat0, bf_seat0, n0 * n1)

    # WART FIX: arbitrary (non-blinds) start state actually used by the root.
    st = dict(contrib=[3, 3], base=3, bets=0, toAct=0, acted=[False, False])
    Rw, _, _, valw = solve(r0, r1, iters=60, start=st)
    assert Rw.root['contrib'] == [3, 3], Rw.root['contrib']
    assert abs(valw[0] + valw[1]) < 1e-12

    # dense fast showdown path == parent dict path (correctness of the optimizer)
    Rc = _DrawResolver2(holds, _blinds_start(), r0, r1, iters=1, live=live)
    sc_fast = Rc._leaf_value(show, [r0[:], r1[:]])
    sc_slow = _Resolver._leaf_value(Rc, show, [r0[:], r1[:]])
    assert max(abs(sc_fast[0][i] - sc_slow[0][i]) for i in range(H)) < 1e-12
    assert max(abs(sc_fast[1][j] - sc_slow[1][j]) for j in range(H)) < 1e-12

    print("ok: resolve_draw2 self-tests pass "
          f"(2-round badugi universe |H|={H}, narrow-range gate: zero-sum "
          f"{zs:.1e}, exact-BR {e_lo:.2e}->{e_hi:.2e}, brute-force reach match "
          f"{abs(res_seat0-bf_seat0):.1e} over {n0*n1} draw outcomes, "
          f"arbitrary start, dense==dict showdown)")
