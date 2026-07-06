"""One-shot badugi fit: caches featurized tensors, checkpoints the best net
EVERY epoch (so a reap loses nothing), prints progress, writes metrics JSON.
Reuses train_badugi.featurize/split + value_net verbatim. CPU-disciplined."""
import json, os, sys, time
import numpy as np
import torch
torch.set_num_threads(int(os.environ.get('TORCH_THREADS', '1')))
import train_badugi as T
from value_net import CounterfactualValueNet, huber_value_loss

SH = 'data/badugi1'
OUT = 'nets/badugi_draw1.pt'
METRICS = 'nets/badugi_draw1.metrics.json'
CACHE = 'nets/_badugi_feat_cache.pt'
EPOCHS = int(os.environ.get('EPOCHS', '60'))
BATCH = int(os.environ.get('BATCH', '512'))
SEED = 0

t0 = time.time()
if os.path.exists(CACHE):
    C = torch.load(CACHE)
    extra, r0, r1, t0_, t1_, pots = (C['extra'], C['r0'], C['r1'], C['t0'],
                                     C['t1'], C['pots'])
    tr, va, split = C['tr'], C['va'], C['split']
    print(f"loaded feat cache ({extra.shape[0]} ex) {time.time()-t0:.1f}s", flush=True)
else:
    data = T.load_dataset(SH)
    tr, va, split = T.board_disjoint_split(data, val_frac=0.12, seed=SEED)
    def col(k): return torch.tensor([d[k] for d in data], dtype=torch.float32)
    extra, r0, r1, t0_, t1_ = col('extra'), col('r0'), col('r1'), col('t0'), col('t1')
    pots = torch.tensor([float(ex['pot']) for ex in T.read_shards(SH)], dtype=torch.float32)
    torch.save({'extra': extra, 'r0': r0, 'r1': r1, 't0': t0_, 't1': t1_,
                'pots': pots, 'tr': tr, 'va': va, 'split': split}, CACHE)
    print(f"featurized+cached ({extra.shape[0]} ex) {time.time()-t0:.1f}s", flush=True)

print(f"split: {split['n_states']} states, train/val "
      f"{split['n_train']}/{split['n_val']}, {split['n_val_states']} val states", flush=True)

board = torch.zeros((extra.shape[0], 0), dtype=torch.float32)
tr_t = torch.tensor(tr, dtype=torch.long)
va_t = torch.tensor(va, dtype=torch.long)

torch.manual_seed(SEED)
net = CounterfactualValueNet(n_holdings=T.N_DRAW_BUCKETS, board_dim=0, extra_dim=T.EXTRA_DIM)
opt = torch.optim.Adam(net.parameters(), lr=1e-3)
best_val, best_state, best_epoch = float('inf'), None, -1
n_tr = len(tr)

for epoch in range(EPOCHS):
    if epoch == int(EPOCHS * 0.6):
        for g in opt.param_groups:
            g['lr'] = 1e-4
    net.train()
    perm = tr_t[torch.randperm(n_tr)]
    for i in range(0, n_tr, BATCH):
        idx = perm[i:i+BATCH]
        opt.zero_grad()
        p0, p1 = net(board[idx], extra[idx], r0[idx], r1[idx])
        loss = huber_value_loss(p0, t0_[idx]) + huber_value_loss(p1, t1_[idx])
        loss.backward()
        opt.step()
    net.eval()
    with torch.no_grad():
        p0, p1 = net(board[va_t], extra[va_t], r0[va_t], r1[va_t])
        vloss = (huber_value_loss(p0, t0_[va_t]) + huber_value_loss(p1, t1_[va_t])).item()
    if vloss < best_val:
        best_val, best_epoch = vloss, epoch
        best_state = {k: v.clone() for k, v in net.state_dict().items()}
        os.makedirs('nets', exist_ok=True)
        torch.save(best_state, OUT)       # checkpoint EVERY improvement
    print(f"epoch {epoch:3d}  val_huber {vloss:.5f}  best {best_val:.5f}@{best_epoch} "
          f"[{time.time()-t0:.0f}s]", flush=True)

# ── final metrics on the BOARD-DISJOINT val split (both seats) ──
net.load_state_dict(best_state)
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

m = {'val_r2': val_r2, 'val_mae': val_mae, 'train_mae': train_mae,
     'baseline_mae': base_mae, 'val_mae_chips': val_mae_chips,
     'best_epoch': best_epoch, 'best_val_huber': best_val, 'epochs': EPOCHS,
     'n_examples': int(extra.shape[0]), 'n_states': split['n_states'],
     'n_val_states': split['n_val_states'], 'n_train': split['n_train'],
     'n_val': split['n_val'], 'target_std': float(np.std(y_tr)),
     'extra_dim': T.EXTRA_DIM, 'n_buckets': T.N_DRAW_BUCKETS,
     'out_path': OUT, 'secs': round(time.time() - t0, 1)}
with open(METRICS, 'w') as f:
    json.dump(m, f, indent=2)
print("METRICS " + json.dumps(m), flush=True)
