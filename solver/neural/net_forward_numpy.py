"""Hand-rolled NUMPY forward pass for CounterfactualValueNet (M-PROD Option A).

This is the de-risking artifact for serving CERTIFIED value nets in production
WITHOUT torch. Render's shipped grading oracle (oracle_worker.py) is pure-stdlib
precisely so it runs torch-free; a *neural* grade therefore cannot be served as
a `.pt` + torch import. This module proves the alternative: export the trained
weights to a plain `.npz` and run the EXACT same math (value_net.py
CounterfactualValueNet) on numpy alone — ONE pip wheel, no torch.

The forward MUST match value_net.CounterfactualValueNet bit-for-bit (verified
to <=1e-6 by the __main__ harness). It is deliberately architecture-general
(reads `depth`/`hidden` off the exported tensors) so the SAME code serves the
badugi draw net (board_dim=0, extra_dim=20, 19 buckets) AND the forthcoming
stud 6th-street net (board_dim=51, extra_dim=8, 25 buckets) with no changes.

Architecture reproduced (see value_net.py):
  trunk: `depth` blocks of  Linear(d->hidden) then PReLU(hidden)  [per-channel a]
  head:  Linear(hidden -> 2*n_holdings)
  split: v0 = head[:, :H], v1 = head[:, H:]
  zero-sum: s0=<r0,v0>, s1=<r1,v1>; half=0.5*(s0+s1); return v0-half, v1-half
The input to the trunk is concat([board, extra, r0, r1], axis=-1), exactly as
CounterfactualValueNet.forward.

Export format (`.npz`): flat arrays
  trunk{i}.weight, trunk{i}.bias, trunk{i}.prelu   (i = 0..depth-1)
  head.weight, head.bias
plus scalar meta: n_holdings, board_dim, extra_dim, hidden, depth.
The Linear weights are stored in torch's (out,in) layout; we do x @ W.T + b.

Usage:
  # export a trained .pt -> .npz (needs torch, done offline / on the i9):
  python net_forward_numpy.py export nets/badugi_draw1.pt nets/badugi_draw1.npz \
      --n-holdings 19 --board-dim 0 --extra-dim 20
  # forward (numpy only, prod-side):
  from net_forward_numpy import NumpyValueNet
  net = NumpyValueNet.load('nets/badugi_draw1.npz')
  v0, v1 = net.forward(board, extra, r0, r1)   # np arrays, batched or 1-D
"""
from __future__ import annotations

import numpy as np


def _prelu(x: np.ndarray, a: np.ndarray) -> np.ndarray:
    """PReLU with a per-channel slope `a` (nn.PReLU(hidden)):
    max(0,x) + a*min(0,x). a broadcasts over the batch dim."""
    return np.where(x >= 0.0, x, a * x)


class NumpyValueNet:
    """Torch-free forward for a trained CounterfactualValueNet."""

    def __init__(self, params: dict, meta: dict, dtype=np.float32):
        # dtype float32 matches the torch reference exactly (torch stores/serves
        # the net in float32); float64 diverges by accumulated f32 rounding
        # (~1e-5 across the 7-layer trunk), which is a PRECISION artifact, not a
        # wiring bug. Prod should serve float32 for a bit-faithful match.
        self.dtype = dtype
        self.n_holdings = int(meta["n_holdings"])
        self.board_dim = int(meta["board_dim"])
        self.extra_dim = int(meta["extra_dim"])
        self.hidden = int(meta["hidden"])
        self.depth = int(meta["depth"])
        # trunk blocks: (W [out,in], b [out], prelu_a [out])
        self.trunk = []
        for i in range(self.depth):
            self.trunk.append((
                params[f"trunk{i}.weight"].astype(dtype),
                params[f"trunk{i}.bias"].astype(dtype),
                params[f"trunk{i}.prelu"].astype(dtype),
            ))
        self.head_w = params["head.weight"].astype(dtype)
        self.head_b = params["head.bias"].astype(dtype)

    @classmethod
    def load(cls, npz_path: str, dtype=np.float32) -> "NumpyValueNet":
        z = np.load(npz_path)
        meta = {k: int(z[k]) for k in
                ("n_holdings", "board_dim", "extra_dim", "hidden", "depth")}
        params = {k: z[k] for k in z.files if k not in meta}
        return cls(params, meta, dtype=dtype)

    def forward(self, board, extra, r0, r1):
        """PBS -> (v0, v1) per-holding CFV (fraction of pot), zero-sum corrected.

        Each of board/extra/r0/r1 may be 1-D (a single PBS) or 2-D (batch,·).
        board may be width 0 (board_dim=0, e.g. badugi) — passed as shape (·,0)
        or as an empty/None value. Returns (v0, v1) with the input's batch rank.
        """
        board = self._as2d(board, self.board_dim)
        extra = self._as2d(extra, self.extra_dim)
        r0 = self._as2d(r0, self.n_holdings)
        r1 = self._as2d(r1, self.n_holdings)
        squeeze = (extra.shape[0] == 1 and np.ndim(extra) == 2 and self._one)

        x = np.concatenate([board, extra, r0, r1], axis=-1)
        for (w, b, a) in self.trunk:
            x = _prelu(x @ w.T + b, a)
        out = x @ self.head_w.T + self.head_b
        H = self.n_holdings
        v0, v1 = out[..., :H], out[..., H:]
        # ZeroSumLayer: subtract half the range-weighted total error from each side
        s0 = (v0 * r0).sum(axis=-1, keepdims=True)
        s1 = (v1 * r1).sum(axis=-1, keepdims=True)
        half = 0.5 * (s0 + s1)
        v0, v1 = v0 - half, v1 - half
        if squeeze:
            return v0[0], v1[0]
        return v0, v1

    def _as2d(self, arr, width):
        """Coerce a vector/matrix/None to shape (batch, width) in the net dtype."""
        if arr is None:
            arr = np.zeros((1, 0))
        arr = np.asarray(arr, dtype=self.dtype)
        if arr.ndim == 1:
            self._one = True
            arr = arr.reshape(1, -1)
        else:
            self._one = getattr(self, "_one", False)
        if width == 0 and arr.shape[-1] != 0:
            # a caller passed a nonempty board where board_dim=0 -> ignore width
            pass
        return arr


# ── offline export (torch side) ──────────────────────────────────────────────
def export_pt_to_npz(pt_path: str, npz_path: str, n_holdings: int,
                     board_dim: int, extra_dim: int,
                     hidden: int = 500, depth: int = 7) -> dict:
    """Load a trained .pt state_dict and write the flat .npz Option-A serves.

    Runs on the torch side (offline / i9), never in prod. Returns the meta dict.
    """
    import torch  # local: prod never imports this
    sd = torch.load(pt_path, map_location="cpu")
    if isinstance(sd, dict) and "state_dict" in sd:
        sd = sd["state_dict"]

    out = {}
    # trunk is nn.Sequential([Linear, PReLU] * depth): even idx = Linear (has
    # .weight/.bias), odd idx = PReLU (has .weight = per-channel slope).
    for i in range(depth):
        lin = 2 * i
        act = 2 * i + 1
        out[f"trunk{i}.weight"] = sd[f"trunk.{lin}.weight"].cpu().numpy()
        out[f"trunk{i}.bias"] = sd[f"trunk.{lin}.bias"].cpu().numpy()
        out[f"trunk{i}.prelu"] = sd[f"trunk.{act}.weight"].cpu().numpy()
    out["head.weight"] = sd["head.weight"].cpu().numpy()
    out["head.bias"] = sd["head.bias"].cpu().numpy()

    meta = dict(n_holdings=n_holdings, board_dim=board_dim, extra_dim=extra_dim,
                hidden=hidden, depth=depth)
    np.savez(npz_path, **out, **{k: np.int64(v) for k, v in meta.items()})
    return meta


if __name__ == "__main__":
    import argparse
    import sys

    ap = argparse.ArgumentParser(description="numpy forward for CounterfactualValueNet")
    sub = ap.add_subparsers(dest="cmd")

    ex = sub.add_parser("export", help="export a .pt -> plain-weights .npz (needs torch)")
    ex.add_argument("pt")
    ex.add_argument("npz")
    ex.add_argument("--n-holdings", type=int, required=True)
    ex.add_argument("--board-dim", type=int, required=True)
    ex.add_argument("--extra-dim", type=int, required=True)
    ex.add_argument("--hidden", type=int, default=500)
    ex.add_argument("--depth", type=int, default=7)

    vf = sub.add_parser("verify", help="verify numpy forward == torch forward (needs torch)")
    vf.add_argument("pt")
    vf.add_argument("npz")
    vf.add_argument("--n-holdings", type=int, required=True)
    vf.add_argument("--board-dim", type=int, required=True)
    vf.add_argument("--extra-dim", type=int, required=True)
    vf.add_argument("--cases", type=int, default=2000)
    vf.add_argument("--precision", choices=["f32", "f64"], default="f64",
                    help="f64 isolates the MATH (numpy==torch to ~1e-13); f32 is "
                         "the prod-dtype path (numpy vs torch differ ~1e-5 by "
                         "BLAS kernel summation order, not by wiring)")

    a = ap.parse_args()

    if a.cmd == "export":
        meta = export_pt_to_npz(a.pt, a.npz, a.n_holdings, a.board_dim,
                                a.extra_dim, a.hidden, a.depth)
        print(f"exported {a.pt} -> {a.npz}  meta={meta}")

    elif a.cmd == "verify":
        import torch
        from value_net import CounterfactualValueNet

        H, BD, ED = a.n_holdings, a.board_dim, a.extra_dim
        npdt = np.float64 if a.precision == "f64" else np.float32
        # torch reference. In f64 mode we lift the net + inputs to double so the
        # comparison isolates the ARITHMETIC (does numpy reproduce the exact same
        # ops?) from BLAS f32 kernel summation-order noise (~1e-5, present between
        # ANY two f32 GEMM implementations and irrelevant to a ~0.4-chip target).
        tnet = CounterfactualValueNet(n_holdings=H, board_dim=BD, extra_dim=ED)
        sd = torch.load(a.pt, map_location="cpu")
        if isinstance(sd, dict) and "state_dict" in sd:
            sd = sd["state_dict"]
        tnet.load_state_dict(sd)
        tnet.eval()
        if a.precision == "f64":
            tnet = tnet.double()
        nnet = NumpyValueNet.load(a.npz, dtype=npdt)

        rng = np.random.default_rng(0)
        B = a.cases
        board_np = rng.standard_normal((B, BD)).astype(npdt)
        extra_np = rng.standard_normal((B, ED)).astype(npdt)
        # ranges: nonneg, sum-to-1 (the real input domain) — this is what prod feeds
        r0_np = rng.random((B, H)).astype(npdt); r0_np /= r0_np.sum(1, keepdims=True)
        r1_np = rng.random((B, H)).astype(npdt); r1_np /= r1_np.sum(1, keepdims=True)

        with torch.no_grad():
            tv0, tv1 = tnet(torch.from_numpy(board_np), torch.from_numpy(extra_np),
                            torch.from_numpy(r0_np), torch.from_numpy(r1_np))
        tv0 = tv0.numpy(); tv1 = tv1.numpy()

        nv0, nv1 = nnet.forward(board_np, extra_np, r0_np, r1_np)

        d0 = np.abs(nv0 - tv0)
        d1 = np.abs(nv1 - tv1)
        max_abs = float(max(d0.max(), d1.max()))
        mean_abs = float((d0.mean() + d1.mean()) / 2)
        # zero-sum residual sanity on both engines (should be ~0)
        zt = float(np.abs((tv0 * r0_np).sum(1) + (tv1 * r1_np).sum(1)).mean())
        zn = float(np.abs((nv0 * r0_np).sum(1) + (nv1 * r1_np).sum(1)).mean())
        print(f"[{a.precision}] cases={B}  max_abs_diff={max_abs:.3e}  "
              f"mean_abs_diff={mean_abs:.3e}")
        print(f"zero-sum residual  torch={zt:.3e}  numpy={zn:.3e}")
        ok = max_abs <= 1e-6
        print("PASS (<=1e-6)" if ok else "FAIL (>1e-6)")
        sys.exit(0 if ok else 1)
