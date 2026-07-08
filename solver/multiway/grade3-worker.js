// ── MULTIWAY (3-player razz) TRAINER — GRADE worker thread ───────────────────
// The heavy multiway grade (grade3.gradeHand3) is pure JS but takes ~5.8s median
// / up to 13.5s worst — the exact 7th-street opponent-range enumeration
// dominates. Running it on the server's single event-loop thread BLOCKS the whole
// app for every user during a grade (the HU trainer dodges this because its
// blueprint grade is ~150ms and its exact oracle is a separate Python worker).
// This worker OFFLOADS the multiway grade to a background thread so the server's
// /step handler `await`s it without blocking the loop.
//
// Structure mirrors solver/multiway/mccfr3-worker.js (the razz3 data-parallel
// path): parentPort message loop + a game rebuilt from a workerData descriptor so
// infoset keys / the deal distribution match the coordinator exactly. Here the
// worker additionally caches the 70MB blueprint ONCE at startup (a per-grade
// JSON.parse would dominate latency), then grades every request against it.
//
// PROTOCOL (newline-free structured-clone messages, id-keyed):
//   parent → worker: { type:'grade', id, handRecord, opts }   opts = plain scalars
//                                                              (game is rebuilt here)
//   worker → parent: { type:'result', id, grade }             grade = gradeHand3 output
//                    { type:'error',  id, error }             clean error string
//   worker → parent: { type:'ready', infosets } | { type:'fatal', error }  (startup)
//
// CORRECTNESS: this calls the SAME grade3.gradeHand3 the CLI/tests call, on the
// SAME handRecord (the server does the cheap deterministic replay and ships the
// record), against the SAME blueprint object — so the worker-served grade is
// byte-identical to a direct synchronous grade3.gradeHand3(record, bp, opts).

const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');
const grade3 = require('./grade3');
const { makeGame: makeRazz3 } = require('./razz3-game');
const play3 = require('./play3');

// Rebuild the IDENTICAL razz3 game the server grades against (blueprint training
// params). workerData.gameOpts carries {cap, antes}; grade3's own default is the
// same instance, but we pass it explicitly so a future param change is honored in
// one place.
const GAME = makeRazz3(workerData.gameOpts || { cap: 2, antes: 8 });

// Cache the 70MB blueprint ONCE. workerData.bpFile is the absolute path the server
// resolved (razz3.best-750k.json). Parse failure is fatal to the worker (the
// manager will surface it and the server keeps the hand playable via a clean
// error) — we never grade against a half-loaded blueprint.
let BP = null;
try {
  const raw = fs.readFileSync(workerData.bpFile, 'utf8');
  BP = JSON.parse(raw);
  const n = Object.keys(play3.strategyMapOf(BP)).length;
  parentPort.postMessage({ type: 'ready', infosets: n });
} catch (e) {
  parentPort.postMessage({ type: 'fatal', error: `grade3-worker blueprint load failed: ${e.message}` });
  // Do NOT exit; the manager handles a never-ready worker by rejecting grades.
  // Exiting here would race the manager's ready-listener.
}

parentPort.on('message', (msg) => {
  if (!msg || msg.type !== 'grade') return;
  const { id, handRecord, opts } = msg;
  if (!BP) {
    parentPort.postMessage({ type: 'error', id, error: 'blueprint not loaded in grade worker' });
    return;
  }
  try {
    // The game object cannot cross the thread boundary (it holds functions), so
    // the parent sends plain-scalar opts and we substitute the worker's own game.
    const gradeOpts = Object.assign({}, opts, { game: GAME });
    const grade = grade3.gradeHand3(handRecord, BP, gradeOpts);
    parentPort.postMessage({ type: 'result', id, grade });
  } catch (e) {
    parentPort.postMessage({ type: 'error', id, error: (e && e.message) || String(e) });
  }
});
