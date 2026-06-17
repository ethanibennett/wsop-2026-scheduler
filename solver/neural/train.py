"""Train the Stud 8 counterfactual value network (Milestone C).

Standard supervised regression: load (PBS-tensor -> CFV) shards from datagen,
fit CounterfactualValueNet with Huber loss + Adam, lr 1e-3 (drop to 1e-4),
select on validation Huber, save the best epoch. One net per street (or a
street-conditioned net), latest streets first (bootstrapping).
"""
from __future__ import annotations
import torch
from value_net import CounterfactualValueNet, huber_value_loss  # noqa: F401


def train(shards_dir: str, n_holdings: int, board_dim: int, epochs: int = 350):
    """Fit the value net; returns the trained module. TODO: data loading."""
    raise NotImplementedError("Milestone C: dataset loader + training loop")
