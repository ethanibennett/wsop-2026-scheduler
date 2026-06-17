"""Training-data generation for the Stud 8 value network (Milestone C).

Loop (DeepStack / ReBeL):
  1. sample a reachable public state (street, upcards, dead, pot);
  2. sample both players' ranges with a coverage-oriented procedure (cover the
     PBSs that actually arise, per ReBeL's random-CFR-iteration trick);
  3. resolve.resolve_subgame(pbs) -> per-holding CFVs;
  4. write (encode_pbs(pbs) -> cfv) to a reservoir/shard on disk.
Bootstrap: generate 7th/6th-street data first; use those nets as leaf values
for earlier streets.
"""
from __future__ import annotations


def generate(out_dir: str, n: int, street: int):
    """Generate `n` (PBS -> CFV) examples for `street`, sharded into out_dir."""
    raise NotImplementedError("Milestone C: PBS/range sampling + solve + log")
