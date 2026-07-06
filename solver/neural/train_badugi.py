"""Train the FIRST BADUGI value net (M6) — the neural DRAW-stack validation.

The badugi corpus (solver/neural/data/badugi1) is ~65k EXACT post-last-draw
labels: direct resolve_draw2 2-round (final draw + betting) solves over the
UNIVERSAL 19-bucket draw abstraction (draw_bucket.py). Each record is one
(both-range, betting-start-state) sample with per-bucket CFV targets; labels are
zero-sum to machine precision. These are DIRECT exact solves, not net-leaf
outputs, so they are untainted by the deal-leaf bug (commit e73808d).

REUSE of the stud pipeline:
  * value_net.CounterfactualValueNet (7x500 PReLU trunk + ZeroSumLayer, Huber,
    fraction-of-pot targets) — reused VERBATIM with board_dim=0 (badugi has NO
    public board) and n_holdings = N_DRAW_BUCKETS = 19.
  * the train.py fit shape (Huber + Adam, lr 1e-3 -> 1e-4 at 60%, select on val
    Huber, save best) — reused, but re-implemented here so the featurization and
    the BOARD-DISJOINT split are badugi-aware.

FEATURIZATION (the discards/blockers-as-upcards analogue):
  * holdings axis = the 19 draw buckets (made-class x draw-to x blocker
    composition; draw_bucket.bucket_of_holding). r0/r1 come straight from the
    record's per-bucket branges.
  * badugi has no board, so board_dim=0. The public conditioning lives in an
    `extra` vector built from the exact pre-draw BETTING/DRAW state (the badugi
    analogue of stud's upcards): pot ratio, the contrib gap (to-call) as a
    fraction of pot, a bets-level one-hot {0..4}, toAct, the two acted flags,
    the base (dead-money) ratio, a big-bet-round flag, draws_left, and a
    start_kind one-hot (the discard/aggression-context one-hots the task calls
    for). Everything is an O(1) function of the record's public fields.

BOARD-DISJOINT SPLIT (the honest generalization test):
  badugi has no public cards, so the "board" that must never leak across the
  train/val split is the PUBLIC BETTING/DRAW STATE (contrib, bets, toAct, acted,
  base, start_kind) — there are exactly 37 of them in the corpus. We hold out a
  whole subset of these public states for validation, so the net is scored on
  betting contexts it NEVER trained on (not just unseen range samples of a seen
  context). This is strictly harder than a random-row split and is the draw
  analogue of stud's board-disjoint eval.

CPU discipline: OMP_NUM_THREADS=1, foreground, small outputs. Pure supervised
regression; a transient burst, not a grind.
"""
from __future__ import annotations
import glob
import json
import math
import os
from typing import Dict, List, Tuple

from draw_bucket import N_DRAW_BUCKETS

# ── featurization ────────────────────────────────────────────────────────────
BOARD_DIM = 0                     # badugi has NO public board
_START_KINDS = ['fresh', 'even', 'limp', 'raise', 'threebet', 'cap']
# extra = [pot/100, toCall/pot, base/pot, big-bet-flag, draws_left/3] (5)
#       + [toAct==0, toAct==1] (2) + [acted0, acted1] (2)
#       + bets one-hot 0..4 (5) + start_kind one-hot (6)
EXTRA_DIM = 5 + 2 + 2 + 5 + len(_START_KINDS)     # 20


def public_state_key(ex: dict) -> tuple:
    """The 'board' of badugi: the public betting/draw state. The split key —
    never leak one of these across train/val."""
    st = ex['start']
    return (tuple(st['contrib']), st['bets'], st['toAct'],
            tuple(st['acted']), st['base'], ex['start_kind'])


def encode_extra(ex: dict) -> List[float]:
    """Public betting/draw state -> the badugi `extra` vector (width EXTRA_DIM).

    The discards/aggression-context one-hots that play the role stud's upcards
    play. Pure function of the record's public fields."""
    st = ex['start']
    pot = float(ex['pot']) or 1.0
    c0, c1 = float(st['contrib'][0]), float(st['contrib'][1])
    to_call = abs(c0 - c1)
    base = float(st['base'])
    bets = int(st['bets'])
    post_bet = float(ex.get('post_bet', 4))
    pre_bet = float(ex.get('pre_bet', 2))
    big_round = 1.0 if post_bet > pre_bet else 0.0    # last draw = big-bet round
    draws_left = float(ex.get('draws_left', 1))
    feats = [pot / 100.0, to_call / pot, base / pot, big_round, draws_left / 3.0]
    feats += [float(st['toAct'] == 0), float(st['toAct'] == 1)]
    feats += [1.0 if st['acted'][0] else 0.0, 1.0 if st['acted'][1] else 0.0]
    feats += [1.0 if bets == b else 0.0 for b in range(5)]           # bets 0..4
    kind = ex.get('start_kind')
    feats += [1.0 if kind == k else 0.0 for k in _START_KINDS]
    return feats


def featurize(ex: dict) -> dict:
    """One badugi record -> {extra, r0, r1, t0, t1, key} as plain lists.

    r0/r1 are the per-bucket ranges (already bucketed in the corpus); t0/t1 are
    the per-bucket CFV targets as a FRACTION OF THE POT (the net's
    normalization, exactly as stud). `key` is the board-disjoint split key."""
    pot = float(ex['pot']) or 1.0
    cfv0, cfv1 = ex['cfv']
    br0, br1 = ex['branges']
    assert ex.get('bucketed') and len(br0) == N_DRAW_BUCKETS, "expect bucketed badugi record"
    t0 = [v / pot for v in cfv0]
    t1 = [v / pot for v in cfv1]
    return {'extra': encode_extra(ex), 'r0': list(br0), 'r1': list(br1),
            't0': t0, 't1': t1, 'key': public_state_key(ex)}


def read_shards(shards_dir: str):
    for sh in sorted(glob.glob(os.path.join(shards_dir, 'shard_*.jsonl'))):
        with open(sh) as f:
            for line in f:
                line = line.strip()
                if line:
                    yield json.loads(line)


def load_dataset(shards_dir: str) -> List[dict]:
    return [featurize(ex) for ex in read_shards(shards_dir)]


# ── board-disjoint split ─────────────────────────────────────────────────────
def board_disjoint_split(data: List[dict], val_frac: float = 0.12,
                         seed: int = 0) -> Tuple[List[int], List[int], dict]:
    """Assign WHOLE public states to val until ~val_frac of the mass is held
    out; the rest are train. No public state is ever shared across the split."""
    import random
    by_key: Dict[tuple, List[int]] = {}
    for i, d in enumerate(data):
        by_key.setdefault(d['key'], []).append(i)
    keys = sorted(by_key.keys(), key=lambda k: (-len(by_key[k]), str(k)))
    rng = random.Random(seed)
    order = keys[:]
    rng.shuffle(order)
    n = len(data)
    target = int(n * val_frac)
    val_keys, val_n = [], 0
    for k in order:
        if val_n >= target:
            break
        val_keys.append(k)
        val_n += len(by_key[k])
    val_set = set(val_keys)
    tr = [i for i, d in enumerate(data) if d['key'] not in val_set]
    va = [i for i, d in enumerate(data) if d['key'] in val_set]
    info = {'n_states': len(by_key), 'n_val_states': len(val_keys),
            'n_train': len(tr), 'n_val': len(va),
            'val_keys': [str(k) for k in val_keys]}
    return tr, va, info


# ── training ─────────────────────────────────────────────────────────────────
def train(shards_dir: str, epochs: int = 250, lr: float = 1e-3, batch: int = 256,
          val_frac: float = 0.12, seed: int = 0,
          out_path: str = 'nets/badugi_draw1.pt') -> dict:
    import numpy as np
    import torch
    from torch.utils.data import DataLoader, TensorDataset, Subset
    from value_net import CounterfactualValueNet, huber_value_loss

    torch.manual_seed(seed)
    data = load_dataset(shards_dir)
    if not data:
        raise ValueError(f"no examples in {shards_dir}")
    tr, va, split = board_disjoint_split(data, val_frac=val_frac, seed=seed)

    def col(key):
        return torch.tensor([d[key] for d in data], dtype=torch.float32)
    extra = col('extra')
    board = torch.zeros((len(data), 0), dtype=torch.float32)   # board_dim=0
    r0, r1, t0, t1 = col('r0'), col('r1'), col('t0'), col('t1')

    ds = TensorDataset(board, extra, r0, r1, t0, t1)
    train_dl = DataLoader(Subset(ds, tr), batch_size=batch, shuffle=True)
    va_t = torch.tensor(va, dtype=torch.long)

    net = CounterfactualValueNet(n_holdings=N_DRAW_BUCKETS, board_dim=BOARD_DIM,
                                 extra_dim=EXTRA_DIM)
    opt = torch.optim.Adam(net.parameters(), lr=lr)
    best_val, best_state, best_epoch = float('inf'), None, -1

    for epoch in range(epochs):
        if epoch == int(epochs * 0.6):
            for g in opt.param_groups:
                g['lr'] = 1e-4
        net.train()
        for bd, ex_, br0, br1, y0, y1 in train_dl:
            opt.zero_grad()
            p0, p1 = net(bd, ex_, br0, br1)
            loss = huber_value_loss(p0, y0) + huber_value_loss(p1, y1)
            loss.backward()
            opt.step()
        net.eval()
        with torch.no_grad():
            p0, p1 = net(board[va_t], extra[va_t], r0[va_t], r1[va_t])
            vloss = (huber_value_loss(p0, t0[va_t]) +
                     huber_value_loss(p1, t1[va_t])).item()
        if vloss < best_val:
            best_val, best_epoch = vloss, epoch
            best_state = {k: v.clone() for k, v in net.state_dict().items()}

    if best_state is not None:
        net.load_state_dict(best_state)
        os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
        torch.save(best_state, out_path)

    # ── metrics on the BOARD-DISJOINT val split (both seats, fraction-of-pot) ──
    net.eval()
    tr_t = torch.tensor(tr, dtype=torch.long)
    with torch.no_grad():
        vp0, vp1 = net(board[va_t], extra[va_t], r0[va_t], r1[va_t])
        tp0, tp1 = net(board[tr_t], extra[tr_t], r0[tr_t], r1[tr_t])
    # stack both seats' per-bucket targets/preds
    y_val = torch.cat([t0[va_t], t1[va_t]], dim=0).numpy().ravel()
    p_val = torch.cat([vp0, vp1], dim=0).numpy().ravel()
    y_tr = torch.cat([t0[tr_t], t1[tr_t]], dim=0).numpy().ravel()
    p_tr = torch.cat([tp0, tp1], dim=0).numpy().ravel()

    # predict-the-mean baseline is fit on TRAIN targets (no val leakage)
    base_mean = float(y_tr.mean())
    val_mae = float(np.mean(np.abs(p_val - y_val)))
    train_mae = float(np.mean(np.abs(p_tr - y_tr)))
    base_mae = float(np.mean(np.abs(y_val - base_mean)))
    ss_res = float(np.sum((y_val - p_val) ** 2))
    ss_tot = float(np.sum((y_val - base_mean) ** 2))
    val_r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float('nan')

    # chips-scale sanity: MAE in chips uses each example's pot (targets are /pot)
    pots = np.array([float(ex['pot']) for ex in read_shards(shards_dir)])
    pot_val = np.repeat(pots[va], 2 * N_DRAW_BUCKETS)  # 2 seats x 19 buckets
    val_mae_chips = float(np.mean(np.abs(p_val - y_val) * pot_val))

    return {'val_r2': val_r2, 'val_mae': val_mae, 'train_mae': train_mae,
            'baseline_mae': base_mae, 'val_mae_chips': val_mae_chips,
            'best_epoch': best_epoch, 'best_val_huber': best_val,
            'n_examples': len(data), 'out_path': out_path,
            'target_std': float(np.std(y_tr)), **split}


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="Train the first badugi value net.")
    p.add_argument('--shards', default='data/badugi1')
    p.add_argument('--epochs', type=int, default=250)
    p.add_argument('--lr', type=float, default=1e-3)
    p.add_argument('--batch', type=int, default=256)
    p.add_argument('--val-frac', type=float, default=0.12)
    p.add_argument('--seed', type=int, default=0)
    p.add_argument('--out', default='nets/badugi_draw1.pt')
    p.add_argument('--selftest', action='store_true')
    a = p.parse_args()
    if a.selftest:
        # featurize/split shapes + normalization on one shard (no torch fit)
        one = sorted(glob.glob(os.path.join(a.shards, 'shard_*.jsonl')))[0]
        with open(one) as f:
            exs = [json.loads(l) for l in f if l.strip()]
        feats = [featurize(e) for e in exs]
        assert all(len(x['extra']) == EXTRA_DIM for x in feats)
        assert all(len(x['r0']) == N_DRAW_BUCKETS and len(x['t0']) == N_DRAW_BUCKETS
                   for x in feats)
        assert all(abs(sum(x['r0']) - 1.0) < 1e-6 for x in feats)
        tr, va, info = board_disjoint_split(feats, val_frac=0.3, seed=0)
        assert not (set(feats[i]['key'] for i in tr) &
                    set(feats[i]['key'] for i in va)), "split leaks a public state!"
        print(f"ok: badugi featurize/split self-test (EXTRA_DIM={EXTRA_DIM}, "
              f"buckets={N_DRAW_BUCKETS}, states={info['n_states']}, "
              f"train/val {info['n_train']}/{info['n_val']}, disjoint)")
    else:
        m = train(a.shards, epochs=a.epochs, lr=a.lr, batch=a.batch,
                  val_frac=a.val_frac, seed=a.seed, out_path=a.out)
        print(json.dumps({k: v for k, v in m.items() if k != 'val_keys'}, indent=2))
