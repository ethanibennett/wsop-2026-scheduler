"""Compute board-disjoint val metrics from the SAVED badugi net + feat cache.
Idempotent; safe to run after the fit (whether it finished or was reaped)."""
import json, os
import numpy as np
import torch
torch.set_num_threads(1)
import train_badugi as T
from value_net import CounterfactualValueNet

OUT = 'nets/badugi_draw1.pt'
CACHE = 'nets/_badugi_feat_cache.pt'
METRICS = 'nets/badugi_draw1.metrics.json'

C = torch.load(CACHE)
extra, r0, r1, t0_, t1_, pots = C['extra'], C['r0'], C['r1'], C['t0'], C['t1'], C['pots']
tr, va, split = C['tr'], C['va'], C['split']
board = torch.zeros((extra.shape[0], 0), dtype=torch.float32)
tr_t = torch.tensor(tr, dtype=torch.long)
va_t = torch.tensor(va, dtype=torch.long)

net = CounterfactualValueNet(n_holdings=T.N_DRAW_BUCKETS, board_dim=0, extra_dim=T.EXTRA_DIM)
net.load_state_dict(torch.load(OUT))
net.eval()
with torch.no_grad():
    vp0, vp1 = net(board[va_t], extra[va_t], r0[va_t], r1[va_t])
    tp0, tp1 = net(board[tr_t], extra[tr_t], r0[tr_t], r1[tr_t])
y_val = torch.cat([t0_[va_t], t1_[va_t]], 0).numpy().ravel()
p_val = torch.cat([vp0, vp1], 0).numpy().ravel()
y_tr = torch.cat([t0_[tr_t], t1_[tr_t]], 0).numpy().ravel()
p_tr = torch.cat([tp0, tp1], 0).numpy().ravel()
base_mean = float(y_tr.mean())
val_mae = float(np.mean(np.abs(p_val - y_val)))
train_mae = float(np.mean(np.abs(p_tr - y_tr)))
base_mae = float(np.mean(np.abs(y_val - base_mean)))
ss_res = float(np.sum((y_val - p_val) ** 2))
ss_tot = float(np.sum((y_val - base_mean) ** 2))
val_r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else float('nan')
pot_val = np.repeat(pots.numpy()[va], 2 * T.N_DRAW_BUCKETS)
val_mae_chips = float(np.mean(np.abs(p_val - y_val) * pot_val))
base_mae_chips = float(np.mean(np.abs(y_val - base_mean) * pot_val))

m = {'val_r2': val_r2, 'val_mae': val_mae, 'train_mae': train_mae,
     'baseline_mae': base_mae, 'val_mae_chips': val_mae_chips,
     'baseline_mae_chips': base_mae_chips,
     'n_examples': int(extra.shape[0]), 'n_states': split['n_states'],
     'n_val_states': split['n_val_states'], 'n_train': split['n_train'],
     'n_val': split['n_val'], 'target_std': float(np.std(y_tr)),
     'extra_dim': T.EXTRA_DIM, 'n_buckets': T.N_DRAW_BUCKETS, 'out_path': OUT}
with open(METRICS, 'w') as f:
    json.dump(m, f, indent=2)
print("METRICS " + json.dumps(m))
