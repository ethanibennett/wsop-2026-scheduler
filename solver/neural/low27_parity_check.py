"""JS<->Python EXACT-INTEGER parity harness for the 2-7 lowball evaluator
(the eval-side analogue of badugi_parity_check.py, self-contained: it spawns
node itself so one command runs the whole gate).

For N random 5-card hands (deterministic mulberry32 seed, full 52-card deck,
sampled WITHOUT replacement) it computes score27 in BOTH languages —
../eval/low27.js via an inline `node -e` oracle, eval_low27.py directly — and
diffs the raw integers. The packing is pure integer math well under 2^53, so
the two scores must be IDENTICAL, not merely order-equivalent.

GATE: 0 mismatches over >= 10,000 hands. Exit 0 iff the gate passes.

Usage: python3 low27_parity_check.py [n_hands] [seed]
"""
from __future__ import annotations
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from eval_low27 import score27  # noqa: E402

_NODE_ORACLE = r"""
const path = require('path');
const root = process.argv[1];                       // repo root
const { score27 } = require(path.join(root, 'solver', 'eval', 'low27.js'));
const { makeRng, makeDeck, cardStr } = require(path.join(root, 'solver', 'engine', 'cards.js'));
const n = parseInt(process.argv[2], 10);
const rng = makeRng(parseInt(process.argv[3], 10) >>> 0);
const out = [];
for (let t = 0; t < n; t++) {
  // 5 distinct cards via partial Fisher-Yates on a fresh deck
  const d = makeDeck();
  for (let i = 0; i < 5; i++) {
    const j = i + Math.floor(rng() * (d.length - i));
    const tmp = d[i]; d[i] = d[j]; d[j] = tmp;
  }
  const hand = d.slice(0, 5);
  out.push([hand.map(cardStr), score27(hand)]);
}
process.stdout.write(JSON.stringify(out));
"""


def run(n_hands: int = 10000, seed: int = 20260705) -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.abspath(os.path.join(here, "..", ".."))
    proc = subprocess.run(
        ["node", "-e", _NODE_ORACLE, root, str(n_hands), str(seed)],
        capture_output=True, text=True, check=True)
    cases = json.loads(proc.stdout)
    assert len(cases) == n_hands, (len(cases), n_hands)

    mism = 0
    examples = []
    for cards, js_score in cases:
        py = score27(cards)
        if py != js_score:
            mism += 1
            if len(examples) < 8:
                examples.append((cards, js_score, py))
    print(f"hands: {len(cases)}   exact-integer mismatches: {mism}")
    for e in examples:
        print(f"  MISMATCH {e[0]}  js={e[1]}  py={e[2]}")
    return mism


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10000
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 20260705
    sys.exit(1 if run(n, seed) else 0)
