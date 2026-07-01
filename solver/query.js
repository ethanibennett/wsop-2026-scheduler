#!/usr/bin/env node
// ── Strategy query CLI ──────────────────────────────────────
// Ask "what's the blueprint's GTO strategy for THIS spot?" and get the
// trained action frequencies for a single draw-game infoset.
//
// The blueprint JSON (solver/strategies/<game>.json) is keyed by the
// game's own `infosetKey(state)` string, e.g. "1B|p2||o0|m0|TH". That key
// bundles SIX fields that all fall out of the betting/draw line:
//   <street><phase> | p<potBin> | <curSeq> | o<oppDraws> | m<myDraw> | <bucket>
// Rather than ask you to compute potBin / curSeq / the draw fields by hand
// (potBin is NOT recoverable from this-street history alone — it carries the
// pot from earlier streets), this tool REPLAYS the action line you give it
// through the real game engine, patches in your hand, and reads the engine's
// own infosetKey at the resulting node. So the key is correct by construction
// and is guaranteed to match what training wrote — no re-implementation of the
// abstraction here, we reuse games/<game>.js exactly (see STEP-1 reuse note in
// the report).
//
// ── How you specify a spot ──────────────────────────────────
//   --game   td27 | badugi | a5td        (which blueprint)
//   --hand   "<cards>"                    the HERO's cards at the decision,
//                                         e.g. "As 2h 3d Kc" (badugi=4 cards,
//                                         td27/a5td=5). Space/comma separated.
//   --line   "<full action line>"         the WHOLE hand up to (not including)
//                                         the hero's decision — both seats'
//                                         betting AND draw actions, in order,
//                                         from the deal. This is what pins down
//                                         street, pot, this-street sequence and
//                                         everyone's draw counts. Tokens:
//                                           f c r k b   (fold/call/raise/check/bet)
//                                           d0          stand pat
//                                           d1 d2 d3 d4 draw N
//                                         Empty / omitted = the very first
//                                         decision of the hand (button pre-draw,
//                                         first to act). Seat order is the game's
//                                         own: pre-draw button(0) acts first;
//                                         after every draw BB(1) acts/draws first.
//                                         `--history` is an accepted alias for
//                                         this flag.
//
//   Optional cross-checks (the tool derives these from --line; pass them only
//   to assert you replayed the line you meant — a mismatch is reported):
//   --street N    expected street index the decision is on (0..3)
//   --draws  "<o>/<m>"  expected opponent / hero draw fields (e.g. "0/1" or
//                       "10/-"), matched against the o../m.. the engine builds.
//
// ── Output ──────────────────────────────────────────────────
//   the infosetKey, the bucket the hand landed in, the legal actions with the
//   blueprint's frequencies, the visit mass, and — if the infoset was never
//   trained (or below the saved-mass floor) — a clear "unseen → uniform" note.
//
// ── Examples ────────────────────────────────────────────────
//   node solver/query.js --game badugi --hand "As 2h 3d 4c"
//   node solver/query.js --game badugi --hand "As 2h 3d Kc" --line "c k d1 d1"
//   node solver/query.js --game td27   --hand "2c 3d 4h 5s 7c" --line "r c d0 d0"
//   node solver/query.js --game a5td   --hand "Ac 2d 3h 4s 8c"   # no blueprint yet
//   node solver/query.js --selftest
//
// Read-only; loads the blueprint and the game modules, prints, exits.

const fs = require('fs');
const path = require('path');
const { GAMES, GAME_META } = require('./games');
const { cardFromStr, cardStr } = require('./engine/cards');
const { makeRng } = require('./engine/cards');

const STRAT_DIR = path.join(__dirname, 'strategies');
const QUERYABLE = ['td27', 'badugi', 'a5td']; // draw games this CLI targets

// ── arg parsing ─────────────────────────────────────────────
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
function has(name) { return process.argv.includes('--' + name); }

function fail(msg) { console.error('error: ' + msg); process.exit(1); }

// ── card parsing ────────────────────────────────────────────
// "As 2h 3d Kc" | "As,2h,3d,Kc" | "As2h3d Kc" -> [int,...]
function parseHand(str, expectN, gameId) {
  if (!str) fail(`--hand is required (e.g. "As 2h 3d 4c"). ${gameId} expects ${expectN} cards.`);
  let toks;
  if (/[\s,]/.test(str.trim())) {
    toks = str.trim().split(/[\s,]+/).filter(Boolean);
  } else {
    // tightly packed "As2h3d4c": split every 2 chars
    toks = str.trim().match(/.{1,2}/g) || [];
  }
  const cards = toks.map(t => {
    const c = cardFromStr(t);
    if (!Number.isInteger(c) || c < 0 || c > 51 || Number.isNaN(c)) fail(`bad card "${t}" in --hand`);
    return c;
  });
  if (new Set(cards).size !== cards.length) fail(`--hand has a duplicate card`);
  if (cards.length !== expectN) fail(`${gameId} hand must be ${expectN} cards, got ${cards.length} ("${str}")`);
  return cards;
}

// ── action line parsing ─────────────────────────────────────
// Tokenizes a betting+draw line: "c k d1 d1" -> ["c","k","d1","d1"].
// Also accepts packed draw tokens and stray separators.
function parseLine(str) {
  if (!str || !str.trim()) return [];
  const toks = str.trim().split(/[\s,]+/).filter(Boolean);
  const out = [];
  for (const t of toks) {
    const tt = t.toLowerCase();
    if (/^d[0-4]$/.test(tt)) { out.push(tt); continue; }
    if (/^[fcrkb]$/.test(tt)) { out.push(tt); continue; }
    // allow a run like "ck" or "crc" of single-letter betting actions
    if (/^[fcrkb]+$/.test(tt)) { for (const ch of tt) out.push(ch); continue; }
    fail(`unrecognized action token "${t}" in --line/--history (use f c r k b d0..d4)`);
  }
  return out;
}

// ── blueprint loading ───────────────────────────────────────
function blueprintPath(game) { return path.join(STRAT_DIR, `${game}.json`); }

function loadBlueprint(game) {
  const f = blueprintPath(game);
  if (!fs.existsSync(f)) return null;
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  // averageStrategy()/saved format: { game, name, iterations, infosets, strategy }
  // Fall back to a bare map just in case an older file was saved flat.
  const strategy = raw.strategy || raw;
  return { meta: raw, strategy };
}

// ── replay the line to the hero's decision node ─────────────
// Returns { state, key, acts } at the node where it's the hero's turn,
// having applied every action in `line`. Chance (draw replacement) nodes
// auto-resolve. The hero's hand is patched in just before the key is read so
// the bucket reflects YOUR cards (the engine dealt random ones at newHand).
function replayToNode(game, line, hand) {
  let s = game.newHand(makeRng(1)); // rng only seeds the (overwritten) deal
  const drawRng = makeRng(1);       // chance replacements: order fixed by shuffle
  let i = 0;
  const resolveChance = () => { while (game.isChance(s)) s = game.sampleChance(s, drawRng); };

  resolveChance();
  while (i < line.length) {
    if (game.isTerminal(s)) fail(`the action line ends the hand before the hero's decision (token ${i + 1}: "${line[i]}")`);
    const legal = game.legalActions(s);
    const a = line[i];
    if (!legal.includes(a)) {
      fail(`action "${a}" (token ${i + 1}) is not legal here. Legal: [${legal.join(', ')}]. ` +
        `phase=${s.phase} street=${s.street} toAct=${s.toAct === 0 ? 'button' : 'BB'}`);
    }
    s = game.applyAction(s, a);
    resolveChance();
    i++;
  }
  if (game.isTerminal(s)) fail('the action line ends the hand — there is no hero decision to query.');

  // We are now at the hero's decision node. Patch the acting seat's hand.
  const p = game.currentPlayer(s);
  if (hand.length !== s.hands[p].length) {
    fail(`hand size ${hand.length} does not match ${game.id}'s ${s.hands[p].length}-card hand`);
  }
  // make sure none of the hero's cards were "used" by the auto-resolved draws
  // of the OTHER seat (they came off the same deck); if so, just swap them out.
  s.hands[p] = hand.slice();
  const key = game.infosetKey(s);
  const acts = game.legalActions(s);
  return { state: s, key, acts, seat: p };
}

// ── strategy lookup (mirrors playout.js/spot.js strategyFor) ─
function lookup(strategy, key, acts) {
  const node = strategy[key];
  if (node && node.a.length === acts.length && node.a.every((a, i) => a === acts[i])) {
    return { probs: node.p, trained: true, mass: node.m || 0, storedActs: node.a };
  }
  return { probs: acts.map(() => 1 / acts.length), trained: false, mass: 0, storedActs: null };
}

// ── pretty action labels ────────────────────────────────────
function labelFor(game, a, state) {
  try { return game.actionLabel(a, state); } catch (_) { return a; }
}

// ── the main query path ─────────────────────────────────────
function runQuery() {
  const game = arg('game');
  if (!game) fail('--game is required (td27 | badugi | a5td)');
  if (!QUERYABLE.includes(game)) {
    fail(`--game must be one of ${QUERYABLE.join(' | ')} (got "${game}"). ` +
      `stud8 is not a draw game; query it elsewhere.`);
  }
  const g = GAMES[game];
  const meta = GAME_META.find(m => m.id === game);
  const handN = g.cfg.handSize;
  const hand = parseHand(arg('hand'), handN, game);
  const line = parseLine(arg('line', arg('history', '')));

  // a5td has no trained blueprint yet — detect the missing file up front.
  const bp = loadBlueprint(game);
  if (!bp) {
    console.log(`\nGame:  ${meta ? meta.name : game}  (${game})`);
    console.log(`Hand:  ${hand.map(cardStr).join(' ')}`);
    console.log(`\nNo blueprint yet — train it:  npm run train -- --game ${game}\n`);
    process.exit(2);
  }

  const { state, key, acts, seat } = replayToNode(g, line, hand);

  // optional cross-checks the user can assert against
  const wantStreet = arg('street');
  if (wantStreet !== undefined) {
    const gotStreet = parseInt(key[0], 10);
    if (parseInt(wantStreet, 10) !== gotStreet) {
      console.error(`warning: --street ${wantStreet} but the replayed line lands on street ${gotStreet}.`);
    }
  }
  const wantDraws = arg('draws');
  if (wantDraws !== undefined) {
    const parts = key.split('|');
    const od = parts[3].slice(1), md = parts[4].slice(1); // strip o / m
    const got = `${od}/${md}`;
    if (wantDraws.replace(/\s/g, '') !== got) {
      console.error(`warning: --draws "${wantDraws}" but replayed line gives opp/me = "${got}".`);
    }
  }

  const res = lookup(bp.strategy, key, acts);
  const desc = g.describe(state);
  const parts = key.split('|');
  const bucket = parts[5];

  // ── report ──
  console.log(`\nGame:      ${bp.meta.name || game}  (${game})`);
  console.log(`Blueprint: ${path.relative(process.cwd(), blueprintPath(game))}` +
    (bp.meta.iterations ? `  (${bp.meta.iterations.toLocaleString()} iters, ${(bp.meta.infosets || 0).toLocaleString()} infosets)` : ''));
  console.log(`Hero seat: ${seat === 0 ? 'Button / SB (0)' : 'Big Blind (1)'}   street ${desc.street} (${desc.streetName}), ${state.phase === 'draw' ? 'draw decision' : 'betting decision'}`);
  console.log(`Hand:      ${hand.map(cardStr).join(' ')}   →  bucket "${bucket}"  (${desc.handLabel})`);
  console.log(`Pot:       ${desc.pot}` + (desc.toCall ? `   to call ${desc.toCall}` : '   (no bet to call)'));
  console.log(`Infoset:   ${key}`);
  console.log('');

  const pct = x => (x * 100).toFixed(1) + '%';
  const rows = acts.map((a, i) => ({ label: labelFor(g, a, state), id: a, p: res.probs[i] }))
    .sort((r1, r2) => r2.p - r1.p);
  const w = Math.max(...rows.map(r => r.label.length), 6);
  console.log(`  ${'action'.padEnd(w)}   freq     bar`);
  for (const r of rows) {
    const bar = '█'.repeat(Math.round(r.p * 24));
    console.log(`  ${r.label.padEnd(w)}   ${pct(r.p).padStart(6)}   ${bar} (${r.id})`);
  }
  console.log('');

  if (res.trained) {
    console.log(`Source:    trained blueprint strategy   (visit mass ${res.mass.toLocaleString()})`);
  } else {
    const reason = bp.strategy[key]
      ? 'an infoset with this key exists but its action set differs from the legal actions here'
      : 'this infoset was never reached in training (or fell below the saved-mass floor)';
    console.log(`Source:    UNSEEN — defaulted to a uniform mix.`);
    console.log(`           (${reason}.)`);
    console.log(`           Many hands share a bucket, so try a nearby line; a deep/rare line may simply`);
    console.log(`           not be in the blueprint.`);
  }
  console.log('');
}

// ── self-test ───────────────────────────────────────────────
// Load badugi.json, pull a REAL infoset key straight out of it, rebuild that
// exact spot from its key fields, look it up, and assert we get the file's
// stored strategy back (sums to 1, identical to the file).
function runSelftest() {
  const game = 'badugi';
  const g = GAMES[game];
  const bp = loadBlueprint(game);
  let pass = 0, failN = 0;
  const check = (cond, msg) => { if (cond) { pass++; } else { failN++; console.log('  FAIL: ' + msg); } };

  console.log('\n── query.js self-test (badugi) ──\n');
  if (!bp) { console.log('FAIL: solver/strategies/badugi.json not found.'); process.exit(1); }

  const keys = Object.keys(bp.strategy);
  check(keys.length > 0, 'blueprint has at least one infoset');

  // (A) Direct round-trip: every stored strategy is a valid distribution and
  // lookup() returns it verbatim for its own key + action set.
  let probSumOK = 0;
  const sample = keys.slice(0, 2000); // a healthy sample, fast
  for (const k of sample) {
    const node = bp.strategy[k];
    const sum = node.p.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) <= 0.02) probSumOK++; // probs rounded to 1e-3 in the file
    const got = lookup(bp.strategy, k, node.a);
    if (!got.trained || got.probs !== node.p) { failN++; console.log('  FAIL: lookup mismatch for ' + k); }
  }
  check(probSumOK === sample.length, `all ${sample.length} sampled strategies sum to ~1 (got ${probSumOK})`);
  pass++; // lookup verbatim loop (counted once if no FAIL above)

  // (B) Reconstruct a spot from a REAL key by replaying a betting line that
  // reproduces that key, then assert the looked-up strategy equals the file's.
  // We search for a key we can hit with a short, well-defined line, choosing a
  // hero hand whose bucket matches the key's bucket field.
  const reconstructed = reconstructFromBlueprint(g, bp);
  check(reconstructed.ok, `reconstructed a real infoset by replay and matched the file ` +
    `(key ${reconstructed.key || '—'})`);
  if (reconstructed.ok) {
    console.log(`  reconstructed key: ${reconstructed.key}`);
    console.log(`  stored strategy:   ${JSON.stringify({ a: reconstructed.node.a, p: reconstructed.node.p })}`);
    const s = reconstructed.got.probs.reduce((a, b) => a + b, 0);
    console.log(`  looked-up probs:   [${reconstructed.got.probs.join(', ')}]  (sum ${s.toFixed(3)})`);
    check(Math.abs(s - 1) <= 0.02, 'reconstructed strategy sums to ~1');
    check(reconstructed.got.probs === reconstructed.node.p, 'looked-up probs are the file\'s exact array');
  }

  console.log(`\n${failN === 0 ? 'PASS' : 'FAIL'} — ${pass} checks passed, ${failN} failed.\n`);
  process.exit(failN === 0 ? 0 : 1);
}

// Find a real infoset we can reach by replaying a betting line, and verify the
// engine's key + our lookup match the file. We enumerate candidate (line, hand)
// pairs for the early, dense part of the tree and look for the first whose
// engine-built key is present in the blueprint.
function reconstructFromBlueprint(g, bp) {
  // Hands chosen to land in specific badugi buckets (4 distinct low suits/ranks
  // => a made badugi by its high card; high cards => 3-card "T" buckets).
  const handCandidates = [
    'As 2h 3d 4c', // 4-high badugi  -> B5/B4-ish (top<=5 => B5)
    'As 2h 3d 5c', // 5-high badugi  -> B5
    'As 2h 3d 7c', // 7-high badugi  -> B7
    'As 2h 3d Kc', // 3-card (K)     -> TH
    '2c 3d 4h Ks', // 3-card         -> T4/TH
    'Ac Kd Qh Js', // 3-card high    -> TH
  ].map(h => parseHand(h, g.cfg.handSize, g.id));

  // Lines covering pre-draw, draw, and a couple later-street nodes
  // (already tokenized — these are the action arrays replayToNode consumes).
  const lineCandidates = [
    [],
    ['c'],
    ['r'],
    ['c', 'k'],          // -> draw 1 (BB first)
    ['c', 'b'],
    ['r', 'c'],
    ['c', 'k', 'd1', 'd1'], // -> street 1 betting
    ['c', 'k', 'd0', 'd0'],
    ['c', 'k', 'd1', 'd1', 'k'],
  ];

  for (const line of lineCandidates) {
    for (const hand of handCandidates) {
      let r;
      try { r = replayToNodeSafe(g, line, hand); } catch (_) { continue; }
      if (!r) continue;
      const node = bp.strategy[r.key];
      if (!node) continue;
      // action sets must match for a clean lookup
      if (node.a.length !== r.acts.length || !node.a.every((a, i) => a === r.acts[i])) continue;
      const got = lookup(bp.strategy, r.key, r.acts);
      if (got.trained && got.probs === node.p) {
        return { ok: true, key: r.key, node, got };
      }
    }
  }
  return { ok: false };
}

// replayToNode but returns null instead of process.exit on an illegal line,
// so the self-test can probe many candidate lines.
function replayToNodeSafe(game, line, hand) {
  let s = game.newHand(makeRng(1));
  const drawRng = makeRng(1);
  const resolveChance = () => { while (game.isChance(s)) s = game.sampleChance(s, drawRng); };
  resolveChance();
  for (let i = 0; i < line.length; i++) {
    if (game.isTerminal(s)) return null;
    const legal = game.legalActions(s);
    if (!legal.includes(line[i])) return null;
    s = game.applyAction(s, line[i]);
    resolveChance();
  }
  if (game.isTerminal(s)) return null;
  const p = game.currentPlayer(s);
  if (hand.length !== s.hands[p].length) return null;
  s.hands[p] = hand.slice();
  return { key: game.infosetKey(s), acts: game.legalActions(s), seat: p };
}

// ── usage ───────────────────────────────────────────────────
function usage() {
  console.log(`
query.js — ask the trained draw-game blueprint for a spot's GTO frequencies

  node solver/query.js --game <td27|badugi|a5td> --hand "<cards>" [--line "<actions>"]
  node solver/query.js --selftest

Flags:
  --game      td27 | badugi | a5td
  --hand      hero's cards, e.g. "As 2h 3d 4c"  (badugi=4, td27/a5td=5)
  --line      full action line from the deal up to the hero's decision
              (alias: --history). Tokens: f c r k b  d0(=pat) d1..d4(=draw N).
              Empty = the hand's first decision (button, pre-draw).
              Seat order: pre-draw button first; after each draw BB first.
  --street N  (optional) assert the decision is on street N (0..3)
  --draws o/m (optional) assert opp/hero draw fields, e.g. "0/1" or "10/-"
  --selftest  reconstruct a real badugi infoset and verify the lookup

Examples:
  node solver/query.js --game badugi --hand "As 2h 3d 4c"
  node solver/query.js --game badugi --hand "As 2h 3d Kc" --line "c k d1 d1"
  node solver/query.js --game td27   --hand "2c 3d 4h 5s 7c" --line "r c d0 d0"
`);
}

// ── entry ───────────────────────────────────────────────────
if (has('selftest')) { runSelftest(); }
else if (has('help') || has('h') || process.argv.length <= 2) { usage(); }
else { runQuery(); }
