"""Consolidate many tiny JSONL training shards into a few large ones.

The bucketed/razz datagen writes one shard per ~25 examples (SHARD_SIZE), so a
long grind leaves ~145k microscopic files in e.g. solver/neural/data/st7. Loading
training data then pays a per-file open/stat/close for every 25 rows, which is
slow and unkind to the filesystem. This tool merges those shards into a handful
of big ones (default ~25,000 examples each) WITHOUT touching the contents: every
JSON line is copied through verbatim, byte-for-byte, just packed into fewer files.

Why order is preserved exactly
------------------------------
`datagen.read_shards(dir)` yields examples in `sorted(os.listdir(dir))` order,
then line-by-line within each file. A live data dir interleaves multiple worker
tags (shard_w5_00000.jsonl, shard_w6_00000.jsonl, ...); under sorted() that means
ALL of w5's shards (by numeric index) precede ALL of w6's, etc.

To make the consolidated dir reproduce the IDENTICAL example sequence under
read_shards, we:
  1. group inputs by tag (the shard name minus its trailing _<index>);
  2. order each tag's shards by numeric index (how zero-padded names already
     sort), and order the tags lexicographically (how sorted() groups them);
  3. concatenate, emitting output files named  shard_<tag>_c<NNNNN>.jsonl.

The literal 'c' (0x63) sorts AFTER every digit, so for a given tag every
consolidated file sorts *after* all of that tag's original numeric shards but
*before* the next tag's shards -- i.e. the consolidated files slot into exactly
the read-order positions of the inputs they replace. Within a tag,
c00000 < c00001 < ... preserves intra-tag order. The 'shard_' prefix and
'.jsonl' suffix are kept, so read_shards still consumes the output unchanged.
(If the consolidated dir contains ONLY consolidated files -- the normal case, a
fresh --out dir -- read order is trivially the emission order regardless of the
'c' trick; the trick matters only if you consolidate in place alongside leftover
raw shards, which is supported but not the default.)

Safety
------
This tool is read-only on its inputs. It never deletes or moves a source shard;
it only writes new files into --out. Removing the originals after you've verified
the output is left to you (--list-inputs prints them).

CLI
---
  # merge data/st7 -> a fresh dir, ~25k examples per file (READ-ONLY on inputs):
  python3 consolidate.py --in some/copy/of/st7 --out some/consolidated --per-file 25000

  # just report what would happen (no writes):
  python3 consolidate.py --in some/dir --dry-run

  # run the self-test (synthetic shards in a temp dir; includes a speed measurement):
  python3 consolidate.py            # no args -> self-test
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from typing import Dict, List, Optional, Tuple

# Reuse the project's canonical reader so "consumable by read_shards" is tested
# against the real implementation, not a copy of it.
from datagen import read_shards

# shard_<tag>_<index>.jsonl  -- tag may itself contain underscores; the index is
# the FINAL underscore-delimited run of digits. This matches both the bucketed
# naming (shard_w0_00000.jsonl) and the plain datagen naming (shard_0000.jsonl,
# where the "tag" is empty).
_SHARD_RE = re.compile(r"^shard_(?P<tag>.*?)_?(?P<idx>\d+)\.jsonl$")

DEFAULT_PER_FILE = 25_000


def parse_shard_name(name: str) -> Optional[Tuple[str, int]]:
    """(-> (tag, index)) for a shard filename, or None if it doesn't match.

    'shard_w6_12103.jsonl'  -> ('w6', 12103)
    'shard_0007.jsonl'      -> ('',  7)
    'shard_w0c_00001.jsonl' -> ('w0c', 1)   # already-consolidated files round-trip
    """
    m = _SHARD_RE.match(name)
    if not m:
        return None
    return m.group("tag"), int(m.group("idx"))


def _consolidated_name(tag: str, out_idx: int) -> str:
    """Name for the out_idx-th consolidated file of `tag`.

    The 'c' marks it consolidated and (because 'c' > any digit) makes it sort
    after that tag's raw numeric shards but before the next tag -- preserving
    read_shards order even when written alongside leftover raw shards.
    """
    sep = "_" if tag else ""
    return f"shard_{tag}{sep}c{out_idx:05d}.jsonl"


def plan_inputs(in_dir: str) -> List[str]:
    """Source shard filenames, in EXACT read_shards order (sorted listdir).

    Only files matching the shard pattern are returned; any other .jsonl is left
    for the caller to notice (see find_foreign_jsonl)."""
    out = []
    for name in sorted(os.listdir(in_dir)):
        if name.endswith(".jsonl") and parse_shard_name(name) is not None:
            out.append(name)
    return out


def find_foreign_jsonl(in_dir: str) -> List[str]:
    """.jsonl files that read_shards WOULD read but we can't parse a tag/index
    from. We refuse to silently drop their ordering, so we report them."""
    return sorted(
        n for n in os.listdir(in_dir)
        if n.endswith(".jsonl") and parse_shard_name(n) is None
    )


def group_by_tag(names: List[str]) -> "Dict[str, List[str]]":
    """Group shard names by tag, each group ordered by numeric index.

    Returns an insertion-ordered dict whose keys (tags) are in sorted order, so
    iterating tags then their shards reproduces read_shards' global order.
    """
    groups: Dict[str, List[Tuple[int, str]]] = {}
    for name in names:
        parsed = parse_shard_name(name)
        assert parsed is not None  # plan_inputs already filtered
        tag, idx = parsed
        groups.setdefault(tag, []).append((idx, name))
    ordered: Dict[str, List[str]] = {}
    for tag in sorted(groups):
        ordered[tag] = [name for _idx, name in sorted(groups[tag])]
    return ordered


def consolidate(in_dir: str, out_dir: str, per_file: int = DEFAULT_PER_FILE,
                progress=None) -> dict:
    """Merge all shards in `in_dir` into ~`per_file`-example files in `out_dir`.

    READ-ONLY on `in_dir`: copies every JSON line through verbatim, never deletes
    or moves a source. Returns a stats dict:
        {examples, in_files, out_files, tags, out_dir}.
    Examples are streamed (one source file in memory at a time), so memory use is
    bounded by the largest single source shard, not the dataset.
    """
    if per_file < 1:
        raise ValueError("per_file must be >= 1")
    in_dir = os.path.abspath(in_dir)
    out_dir = os.path.abspath(out_dir)
    if out_dir == in_dir:
        # Hard stop: writing consolidated files into the source dir risks
        # confusing a concurrent reader/writer and re-consolidating our own
        # output. Consolidation is meant to target a fresh directory.
        raise ValueError("--out must differ from --in (consolidate into a fresh dir)")

    names = plan_inputs(in_dir)
    foreign = find_foreign_jsonl(in_dir)
    if foreign:
        raise ValueError(
            f"{len(foreign)} .jsonl file(s) in {in_dir} don't match the shard "
            f"naming and would be read by read_shards but can't be ordered "
            f"safely, e.g. {foreign[:3]}. Move them aside first.")

    os.makedirs(out_dir, exist_ok=True)
    grouped = group_by_tag(names)

    total_examples = 0
    out_files = 0
    in_done = 0
    n_in = len(names)

    for tag, shard_names in grouped.items():
        out_idx = 0
        buf: List[str] = []          # raw JSON lines (no trailing newline)
        buf_n = 0

        def flush():
            nonlocal out_idx, out_files, buf, buf_n
            if not buf:
                return
            path = os.path.join(out_dir, _consolidated_name(tag, out_idx))
            with open(path, "w") as f:
                f.write("\n".join(buf))
                f.write("\n")
            out_idx += 1
            out_files += 1
            buf = []
            buf_n = 0

        for sname in shard_names:
            with open(os.path.join(in_dir, sname)) as f:
                for line in f:
                    line = line.rstrip("\n")
                    if not line.strip():
                        continue  # read_shards skips blank lines, so they carry no example
                    buf.append(line)
                    buf_n += 1
                    total_examples += 1
                    if buf_n >= per_file:
                        flush()
            in_done += 1
            if progress:
                progress(in_done, n_in)
        flush()  # tail of this tag (we don't pack across tags -> order stays clean)

    return {
        "examples": total_examples,
        "in_files": len(names),
        "out_files": out_files,
        "tags": len(grouped),
        "out_dir": out_dir,
    }


# --------------------------------------------------------------------------- #
# Optional faster loader.
#
# read_shards opens/closes a file per shard and json.loads line-by-line. After
# consolidation there are few files, so the open/close cost is already gone and
# read_shards is plenty fast. This helper exists for callers that want to read a
# whole consolidated file at once (one syscall round-trip, bulk splitlines); it
# yields the SAME dicts in the SAME order as read_shards. It's a drop-in for
# `for ex in read_shards(dir)` and is validated against read_shards in the test.
# --------------------------------------------------------------------------- #
def read_shards_fast(in_dir: str):
    """Like datagen.read_shards, but slurps each file in one read().

    Same yield order and same dicts as read_shards. Most useful on consolidated
    (large) files; on the tiny raw shards it offers little.
    """
    for name in sorted(os.listdir(in_dir)):
        if not name.endswith(".jsonl"):
            continue
        with open(os.path.join(in_dir, name)) as f:
            data = f.read()
        for line in data.splitlines():
            if line.strip():
                yield json.loads(line)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _cli(argv: List[str]) -> int:
    p = argparse.ArgumentParser(
        description="Merge many tiny JSONL shards into a few large ones "
                    "(read_shards-compatible, contents preserved exactly).")
    p.add_argument("--in", dest="in_dir", required=True,
                   help="source dir of shard_*.jsonl (READ-ONLY; not modified)")
    p.add_argument("--out", dest="out_dir", required=True,
                   help="destination dir for consolidated shards (must differ from --in)")
    p.add_argument("--per-file", type=int, default=DEFAULT_PER_FILE,
                   help=f"max examples per consolidated file (default {DEFAULT_PER_FILE})")
    p.add_argument("--dry-run", action="store_true",
                   help="report the plan (file/example counts) without writing")
    p.add_argument("--list-inputs", action="store_true",
                   help="after consolidating, print the source files (so you can rm them yourself)")
    a = p.parse_args(argv)

    in_dir = os.path.abspath(a.in_dir)
    if not os.path.isdir(in_dir):
        print(f"error: --in {in_dir} is not a directory", file=sys.stderr)
        return 2

    # A small guard so the tool can't be aimed at the live grind dirs by accident.
    live = {"st7", "razz7", "st6"}
    if os.path.basename(in_dir) in live:
        print(f"refusing to read the live grind dir {in_dir!r} "
              f"(make a copy first; the grind is writing there). Override is "
              f"intentionally not provided.", file=sys.stderr)
        return 2

    names = plan_inputs(in_dir)
    foreign = find_foreign_jsonl(in_dir)
    if foreign:
        print(f"error: {len(foreign)} unrecognized .jsonl file(s) in {in_dir} "
              f"(e.g. {foreign[:3]}). They'd be read by read_shards but can't be "
              f"ordered; move them aside first.", file=sys.stderr)
        return 2
    if not names:
        print(f"no shard_*.jsonl files in {in_dir}", file=sys.stderr)
        return 1

    grouped = group_by_tag(names)
    if a.dry_run:
        # Count examples cheaply (line count) without writing anything.
        est = 0
        # Single pass over the inputs: count examples per tag, then derive both
        # the total and the per-tag output-file count (we don't pack across tags,
        # so each tag contributes ceil(n_tag / per_file) files, >= 1).
        out_est = 0
        for tag, shards in grouped.items():
            n = 0
            for s in shards:
                with open(os.path.join(in_dir, s)) as f:
                    n += sum(1 for ln in f if ln.strip())
            est += n
            out_est += max(1, -(-n // a.per_file))
        print(f"[dry-run] {len(names)} input shards across {len(grouped)} tag(s), "
              f"{est} examples -> ~{out_est} consolidated file(s) "
              f"(<= {a.per_file} examples each) in {os.path.abspath(a.out_dir)}")
        return 0

    t0 = time.time()
    last = [0.0]

    def prog(done, total):
        now = time.time()
        if now - last[0] > 2.0 or done == total:
            last[0] = now
            print(f"  {done}/{total} source shards merged", flush=True)

    try:
        stats = consolidate(in_dir, a.out_dir, per_file=a.per_file, progress=prog)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    dt = time.time() - t0
    print(f"consolidated {stats['examples']} examples: "
          f"{stats['in_files']} files -> {stats['out_files']} files "
          f"across {stats['tags']} tag(s) in {dt:.1f}s -> {stats['out_dir']}")
    if a.list_inputs:
        print("source shards (NOT deleted by this tool):")
        for n in names:
            print(os.path.join(in_dir, n))
    return 0


# --------------------------------------------------------------------------- #
# Self-test: synthetic shards in a temp dir, full round-trip validation +
# a rough load-time measurement. Never touches the live data dirs.
# --------------------------------------------------------------------------- #
def _selftest() -> int:
    import shutil
    import tempfile

    work = tempfile.mkdtemp(prefix="consolidate_test_")
    src = os.path.join(work, "src")
    dst = os.path.join(work, "dst")
    os.makedirs(src)
    try:
        # Build synthetic shards that mimic the real layout: multiple worker
        # tags interleaved, SHARD_SIZE-ish tiny files, realistic-ish bucketed
        # records (varied types so byte-exactness actually means something).
        import random
        rng = random.Random(12345)
        TAGS = ["w0", "w5", "w6", "w10"]   # includes w10 to exercise lexical tag order
        SHARD_SIZE = 25
        N_SHARDS_PER_TAG = 80              # 80*25 = 2000 examples/tag, 8000 total
        gid = 0
        expected: List[dict] = []          # ground truth in read_shards order

        # read_shards orders by sorted filename; precompute that order for truth.
        planned_names = []
        for tag in TAGS:
            for i in range(N_SHARDS_PER_TAG):
                planned_names.append((tag, i))
        # write files
        per_tag_examples: Dict[str, List[dict]] = {t: [] for t in TAGS}
        for tag, i in planned_names:
            rows = []
            for _ in range(SHARD_SIZE):
                ex = {
                    "street": 7,
                    "up": [[f"{r}{s}" for r, s in zip("AKQJ", "cdhs")],
                           [f"{r}{s}" for r, s in zip("9876", "cdhs")]],
                    "dead": [],
                    "pot": rng.choice([16.0, 32.0, 48.0, 96.0]),
                    "bucketed": True,
                    "n_buckets": 25,
                    "branges": [[round(rng.random(), 6) for _ in range(25)],
                                [round(rng.random(), 6) for _ in range(25)]],
                    "cfv": [[round(rng.uniform(-50, 50), 4) for _ in range(25)],
                            [round(rng.uniform(-50, 50), 4) for _ in range(25)]],
                    "value": [round(rng.uniform(-5, 5), 6)],
                    "gid": gid,            # unique id so we can pinpoint any reorder/loss
                    "tag": tag,
                }
                ex["value"].append(-ex["value"][0])
                gid += 1
                rows.append(ex)
                per_tag_examples[tag].append(ex)
            path = os.path.join(src, f"shard_{tag}_{i:05d}.jsonl")
            with open(path, "w") as f:
                for ex in rows:
                    f.write(json.dumps(ex) + "\n")

        # Ground-truth read order = tags in sorted() order, shards by index.
        for tag in sorted(TAGS):
            expected.extend(per_tag_examples[tag])

        n_src_files = len(planned_names)
        total = len(expected)
        print(f"[selftest] wrote {n_src_files} synthetic shards "
              f"({total} examples) across {len(TAGS)} tags in {src}")

        # Sanity: the real read_shards yields exactly our ground-truth order.
        got_src = list(read_shards(src))
        assert len(got_src) == total, (len(got_src), total)
        assert got_src == expected, "read_shards order != constructed ground truth"

        # ---- consolidate (per-file small enough to force several outputs) ----
        per_file = 1500   # 2000 examples/tag -> 2 files/tag -> 8 output files
        stats = consolidate(src, dst, per_file=per_file)
        print(f"[selftest] consolidated -> {stats}")

        # 1) far fewer files
        assert stats["in_files"] == n_src_files
        assert stats["out_files"] < n_src_files
        out_listing = [n for n in sorted(os.listdir(dst)) if n.endswith(".jsonl")]
        assert len(out_listing) == stats["out_files"]
        # each output respects the cap
        for n in out_listing:
            with open(os.path.join(dst, n)) as f:
                cnt = sum(1 for ln in f if ln.strip())
            assert cnt <= per_file, (n, cnt)

        # 2) identical total count AND identical contents/order via read_shards
        got = list(read_shards(dst))
        assert len(got) == total, f"count changed: {len(got)} != {total}"
        assert got == expected, "consolidated contents/order != original"

        # 2b) byte-exactness of every record's JSON line is implied by dict
        #     equality above, but verify the serialized lines round-trip too:
        ids_src = [e["gid"] for e in expected]
        ids_dst = [e["gid"] for e in got]
        assert ids_src == ids_dst, "example sequence (gid order) changed"

        # 3) inputs untouched (read-only guarantee)
        still_there = [n for n in os.listdir(src) if n.endswith(".jsonl")]
        assert len(still_there) == n_src_files, "source files were modified!"

        # 4) the fast loader yields identical results
        got_fast = list(read_shards_fast(dst))
        assert got_fast == expected, "read_shards_fast disagrees with read_shards"

        # 5) idempotence-ish: re-reading consolidated with read_shards is stable
        assert list(read_shards(dst)) == got

        # ---- rough load-time measurement: tiny shards vs consolidated ----
        def time_load(reader, d, repeats=3):
            best = float("inf")
            n = 0
            for _ in range(repeats):
                t0 = time.perf_counter()
                n = sum(1 for _ in reader(d))
                best = min(best, time.perf_counter() - t0)
            return best, n

        t_small, n_small = time_load(read_shards, src)
        t_big, n_big = time_load(read_shards, dst)
        t_big_fast, _ = time_load(read_shards_fast, dst)
        assert n_small == n_big == total
        speedup = t_small / t_big if t_big else float("inf")
        speedup_fast = t_small / t_big_fast if t_big_fast else float("inf")
        print(f"[selftest] load {total} examples (best of 3):")
        print(f"    {n_src_files} small shards via read_shards : {t_small*1000:7.1f} ms")
        print(f"    {stats['out_files']} consolidated via read_shards: {t_big*1000:7.1f} ms "
              f"({speedup:.1f}x faster)")
        print(f"    {stats['out_files']} consolidated via fast loader : {t_big_fast*1000:7.1f} ms "
              f"({speedup_fast:.1f}x faster)")

        print("ok: consolidate self-tests pass "
              "(identical count + contents via read_shards, inputs untouched).")
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(_selftest() if len(sys.argv) == 1 else _cli(sys.argv[1:]))
