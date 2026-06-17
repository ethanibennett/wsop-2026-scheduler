"""Counterfactual value network for heads-up Stud 8 (DeepStack-style).

Maps a Public Belief State (public board + pot + both players' range vectors)
to a per-holding counterfactual value for each player, as a fraction of the
pot, with a differentiable zero-sum correction. Architecture follows
Moravcik et al. (DeepStack, Science 2017): a 7x500 PReLU trunk, Huber loss,
Adam; values normalized as fractions of the pot for generalization.

This file is fully implemented and runnable (`python value_net.py` runs a
shape smoke test). The PBS *encoding* (how many holdings, how the board is
featurized) is defined in `pbs.py`; this module is parameterized by those
dimensions so it does not need to change as bucketing (Milestone B) evolves.
"""
from __future__ import annotations
import torch
import torch.nn as nn


class ZeroSumLayer(nn.Module):
    """Force the two players' values to be consistent with a zero-sum game.

    Given per-holding values v0, v1 (fractions of pot) and the input ranges
    r0, r1, the range-weighted sums s0 = <r0, v0>, s1 = <r1, v1> should sum to
    ~0 in a zero-sum game. They generally don't, so subtract half the total
    error from each side (differentiable). This mirrors DeepStack's outer
    "zero-sum" layer and substantially improves accuracy.
    """

    def forward(self, v0, v1, r0, r1):
        s0 = (v0 * r0).sum(dim=-1, keepdim=True)
        s1 = (v1 * r1).sum(dim=-1, keepdim=True)
        half = 0.5 * (s0 + s1)
        return v0 - half, v1 - half


class CounterfactualValueNet(nn.Module):
    """PBS -> (v0, v1) per-holding counterfactual values (fraction of pot).

    Args:
        n_holdings: size of each player's range / value vector (raw holdings
            given the board, or #buckets after Milestone B).
        board_dim:  width of the public-board + dead-cards feature vector.
        extra_dim:  scalar/aux features (pot ratio, street one-hot, ...).
        hidden:     trunk width (DeepStack uses 500).
        depth:      number of hidden layers (DeepStack uses 7).
    """

    def __init__(self, n_holdings: int, board_dim: int, extra_dim: int = 8,
                 hidden: int = 500, depth: int = 7):
        super().__init__()
        self.n_holdings = n_holdings
        in_dim = board_dim + extra_dim + 2 * n_holdings  # board + aux + both ranges
        layers = []
        d = in_dim
        for _ in range(depth):
            layers += [nn.Linear(d, hidden), nn.PReLU(hidden)]
            d = hidden
        self.trunk = nn.Sequential(*layers)
        self.head = nn.Linear(hidden, 2 * n_holdings)  # v0 then v1
        self.zero_sum = ZeroSumLayer()

    def forward(self, board, extra, r0, r1):
        x = torch.cat([board, extra, r0, r1], dim=-1)
        out = self.head(self.trunk(x))
        v0, v1 = out[..., :self.n_holdings], out[..., self.n_holdings:]
        return self.zero_sum(v0, v1, r0, r1)


def huber_value_loss(pred, target, delta: float = 1.0):
    """Huber loss over the per-holding counterfactual values (DeepStack)."""
    return nn.functional.huber_loss(pred, target, delta=delta)


if __name__ == "__main__":
    # Shape smoke test with placeholder dims (3rd street ~ C(46,2) holdings).
    B, H, BOARD = 16, 1035, 64
    net = CounterfactualValueNet(n_holdings=H, board_dim=BOARD)
    board = torch.randn(B, BOARD)
    extra = torch.randn(B, 8)
    r0 = torch.softmax(torch.randn(B, H), dim=-1)
    r1 = torch.softmax(torch.randn(B, H), dim=-1)
    v0, v1 = net(board, extra, r0, r1)
    zsum = ((v0 * r0).sum(-1) + (v1 * r1).sum(-1)).abs().mean().item()
    params = sum(p.numel() for p in net.parameters())
    print(f"ok: v0 {tuple(v0.shape)}, v1 {tuple(v1.shape)}, "
          f"zero-sum residual {zsum:.2e}, params {params/1e6:.2f}M")
