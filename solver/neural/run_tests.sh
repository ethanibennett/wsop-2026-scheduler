#!/usr/bin/env bash
# Run the pure-Python neural-solver self-tests (no numpy/torch needed).
# net_leaf.py and train.py self-test their torch-free glue (bucketing, scatter,
# featurize); only their actual net inference / training loop needs PyTorch.
# value_net.py is excluded — run it inside the venv ("python value_net.py").
set -euo pipefail
cd "$(dirname "$0")"

for f in eval_stud8.py eval_razz.py eval_badugi.py pbs.py bucket.py train.py net_leaf.py \
         resolve.py razz_game.py resolve_draw.py resolve_draw2.py bucket_razz.py \
         bucket_resolve_razz.py datagen_razz.py datagen.py bucket_resolve.py \
         datagen_bucketed.py solve_spot.py validate.py; do
  echo "── $f ──"
  python3 "$f"
done
echo "all pure-Python neural self-tests passed"
