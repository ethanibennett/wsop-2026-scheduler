"""Tabular subgame re-solver for Stud 8 (Milestone A — the critical path).

Given a root PBS, build the depth-limited subgame, run CFR+/DCFR to an
approximate equilibrium, and return:
  - the average strategy for the subgame, and
  - per-holding COUNTERFACTUAL VALUES for both players (the training target
    for value_net.py, and the quantity propagated in continual re-solving).

Hi/lo split: terminal utility splits the pot between best hi and best
8-or-better lo (mirror ../eval/stud8.js). The safe re-solving gadget
(Brown & Sandholm 2017) constrains the opponent via its counterfactual
values at the subgame root so refined play is no more exploitable.

This is the data-generation primitive AND the at-the-table search (Milestone
D). It is the most important next piece: without it, the network has no data.

Implementation options (decide here):
  (1) pure-Python stud rules + CFR over enumerated holdings (self-contained); or
  (2) a Node bridge that runs range-CFR over a stud8 subgame and returns CFVs.
"""
from __future__ import annotations


def resolve_subgame(pbs, iters: int = 1000, depth_limit: int | None = None,
                    leaf_value_fn=None):
    """Run CFR on the subgame rooted at `pbs`.

    Args:
        pbs: root Public Belief State (pbs.PBS).
        iters: CFR iterations (DeepStack used 1000 with CFR+).
        depth_limit: if set, replace leaves with `leaf_value_fn` (the value net)
            — this is continual re-solving (Milestone D). If None, solve to the
            end of the hand (Milestone A, exact).
        leaf_value_fn: PBS -> per-holding values, e.g. a CounterfactualValueNet.

    Returns:
        dict with `strategy` (avg) and `cfv` = [cfv_me, cfv_opp] per holding.
    """
    raise NotImplementedError("Milestone A: stud8 range-CFR subgame solver")
