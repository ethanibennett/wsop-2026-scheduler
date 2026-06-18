#!/usr/bin/env node
// ── Continuous-training supervisor ──────────────────────────
// A self-managing trainer for a dedicated always-on machine. It runs all
// three solvers concurrently (one child process each, so the box's cores
// stay busy), keeps them alive across crashes/OOM by resuming from the
// last checkpoint, meters exploitability on a schedule, and appends the
// exploitability-vs-iterations curve to a CSV. Plug-and-play:
//
//   node solver/supervise.js                 # auto-size to this machine
//   node solver/supervise.js --games td27,stud8
//   node solver/supervise.js --workers td27=4,badugi=4,stud8=1
//   node solver/supervise.js --meter-min 20 --heap 12288
//
// It never exits on its own (the iter target is effectively unbounded);
// stop it with Ctrl-C and it will signal the children to checkpoint and
// shut down cleanly. Resuming is automatic — just start it again.
//
// Design notes:
//  * Memory-bound Stud 8 runs single-worker by default (more workers means
//    more full-table copies; RAM is its binding constraint). The draw games
//    parallelize across cores via engine/parallel.js.
//  * Each child is `train.js` with periodic strategy saves (--save-every,
//    so the meter and the live site read fresh strategies) and periodic
//    full-state checkpoints (--ckpt-every, so a kill loses minutes not hours).
//  * The meter runs in its own short-lived process against the saved
//    strategy file, so it never perturbs training.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { fork, spawn } = require('child_process');

const SOLVER_DIR = __dirname;

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

// --dir lets you run a sandbox against a throwaway strategies dir without
// touching the deployed ones (default: solver/strategies).
const STRAT_DIR = path.resolve(arg('dir', path.join(SOLVER_DIR, 'strategies')));
const CURVE_CSV = path.join(STRAT_DIR, 'curve.csv');

// ── Configuration ───────────────────────────────────────────
const games = arg('games', 'td27,badugi,stud8').split(',').map(s => s.trim()).filter(Boolean);
const meterMin = parseFloat(arg('meter-min', '30'));       // meter cadence (minutes)
const meterHands = parseInt(arg('meter-hands', '8000'), 10); // hands per meter pass
const saveEverySec = parseInt(arg('save-every', '600'), 10);
const ckptEverySec = parseInt(arg('ckpt-every', '1800'), 10);
const heapMB = parseInt(arg('heap', '0'), 10);             // 0 = node default (coordinator/main thread)
// Per-worker-thread heap cap. Workers have their own heaps that --heap does
// NOT cover, so default them to a fraction of --heap (still generous) unless
// set explicitly. Keeps a parallel game's (W+2) table copies within RAM.
const workerHeapMB = parseInt(arg('worker-heap', heapMB > 0 ? String(Math.floor(heapMB * 0.6)) : '0'), 10);
const targetIters = arg('iters', '2000000000');           // effectively unbounded
const mergeEvery = parseInt(arg('merge-every', '100000'), 10);

// Auto worker sizing: Stud 8 stays single-worker (memory-bound); the rest
// of the cores are split among the memory-light draw games.
function autoWorkers() {
  const cores = os.cpus().length;
  const light = games.filter(g => g !== 'stud8');
  const w = {};
  for (const g of games) w[g] = 1;
  // reserve ~1 core for the OS/meter and 1 for stud8 if present
  let pool = Math.max(0, cores - 1 - (games.includes('stud8') ? 1 : 0));
  if (light.length) {
    const per = Math.max(1, Math.floor(pool / light.length));
    for (const g of light) w[g] = per;
  }
  return w;
}
let workers = autoWorkers();
// explicit override: --workers td27=4,badugi=4,stud8=1
const wOverride = arg('workers', '');
if (wOverride) for (const pair of wOverride.split(',')) {
  const [g, n] = pair.split('='); if (g && n) workers[g.trim()] = parseInt(n, 10);
}

// ── Curve log ───────────────────────────────────────────────
function ensureCurveHeader() {
  if (!fs.existsSync(CURVE_CSV)) {
    fs.mkdirSync(STRAT_DIR, { recursive: true });
    fs.writeFileSync(CURVE_CSV, 'timestamp,game,iterations,infosets,exploit_lb_chips_per_hand\n');
  }
}
function appendCurve(game, iterations, infosets, exploit) {
  fs.appendFileSync(CURVE_CSV, `${new Date().toISOString()},${game},${iterations},${infosets},${exploit}\n`);
}

// ── Children ────────────────────────────────────────────────
const children = new Map(); // game -> { proc, startedAt, restarts }
let shuttingDown = false;

function trainArgs(game) {
  const a = [
    '--game', game,
    '--iters', String(targetIters),
    '--workers', String(workers[game] || 1),
    '--merge-every', String(mergeEvery),
    '--save-every', String(saveEverySec),
    '--ckpt-every', String(ckptEverySec),
    '--checkpoint', '1',
    '--out', path.join(STRAT_DIR, `${game}.json`),
  ];
  if (workerHeapMB > 0 && (workers[game] || 1) > 1) a.push('--worker-heap', String(workerHeapMB));
  return a;
}

function startGame(game) {
  if (shuttingDown) return;
  const execArgv = heapMB > 0 ? [`--max-old-space-size=${heapMB}`] : [];
  const proc = fork(path.join(SOLVER_DIR, 'train.js'), trainArgs(game), {
    execArgv,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const tag = `[${game}]`;
  const prefix = (buf) => buf.toString().split('\n').filter(Boolean).forEach(l => console.log(`${tag} ${l}`));
  proc.stdout.on('data', prefix);
  proc.stderr.on('data', prefix);
  const rec = children.get(game) || { restarts: 0 };
  rec.proc = proc; rec.startedAt = Date.now();
  children.set(game, rec);
  console.log(`${tag} started (pid ${proc.pid}, ${workers[game] || 1} worker(s))`);

  proc.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const ranMs = Date.now() - rec.startedAt;
    if (code === 0) {
      console.log(`${tag} reached iteration target — done.`);
      return; // do not restart a genuinely finished game
    }
    // crash / time-box / unfinished (train.js exits 3 if not finished) -> resume.
    rec.restarts++;
    // Back off if it died almost immediately (likely OOM / config error).
    const backoff = ranMs < 15000 ? Math.min(60000, 5000 * rec.restarts) : 1000;
    console.log(`${tag} exited (code ${code}, signal ${signal}) after ${(ranMs / 1000).toFixed(0)}s — ` +
      `resuming from checkpoint in ${(backoff / 1000).toFixed(0)}s (restart #${rec.restarts})`);
    setTimeout(() => startGame(game), backoff);
  });
}

// ── Meter ───────────────────────────────────────────────────
// Run exploitability.js against each game's saved strategy and log a curve
// row. Short-lived child; reads files only, never touches the trainers.
function runMeterOnce(game) {
  return new Promise((resolve) => {
    const stratFile = path.join(STRAT_DIR, `${game}.json`);
    const metaFile = path.join(STRAT_DIR, `${game}.meta.json`);
    if (!fs.existsSync(stratFile)) return resolve(); // not saved yet
    const proc = spawn(process.execPath,
      [path.join(SOLVER_DIR, 'exploitability.js'), '--game', game, '--hands', String(meterHands), '--file', stratFile],
      { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('exit', () => {
      const m = out.match(/EXPLOITABILITY \(lower bound\):\s*([-\d.]+)/);
      const exploit = m ? m[1] : 'NA';
      let iters = 'NA', infosets = 'NA';
      try {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        iters = meta.iterations; infosets = meta.infosets;
      } catch (_) { /* meta not ready */ }
      appendCurve(game, iters, infosets, exploit);
      console.log(`[meter] ${game}: ${iters} iters, ${infosets} infosets, exploit_lb ${exploit} chips/hand`);
      resolve();
    });
  });
}

async function meterLoop() {
  while (!shuttingDown) {
    await new Promise(r => setTimeout(r, meterMin * 60000));
    if (shuttingDown) break;
    for (const g of games) { if (shuttingDown) break; await runMeterOnce(g); }
  }
}

// ── Lifecycle ───────────────────────────────────────────────
function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  console.log('\n[supervisor] shutting down — signaling children to checkpoint...');
  for (const { proc } of children.values()) { try { proc.kill('SIGTERM'); } catch (_) {} }
  // give children a moment to finish their current chunk + write checkpoints,
  // then exit (children yield to the event loop each chunk so they will see
  // the signal within a chunk's time).
  setTimeout(() => process.exit(0), 15000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ── Go ──────────────────────────────────────────────────────
ensureCurveHeader();
console.log('═'.repeat(64));
console.log(' Continuous-training supervisor');
console.log(`  machine:    ${os.cpus().length} cores, ${(os.totalmem() / 1e9).toFixed(0)} GB RAM`);
console.log(`  games:      ${games.map(g => `${g}(${workers[g] || 1}w)`).join(', ')}`);
console.log(`  meter:      every ${meterMin} min, ${meterHands} hands -> ${path.relative(process.cwd(), CURVE_CSV)}`);
console.log(`  saves:      strategy every ${saveEverySec}s, checkpoint every ${ckptEverySec}s`);
console.log(`  heap cap:   ${heapMB > 0 ? heapMB + ' MB/child' : 'node default'}` +
  `${workerHeapMB > 0 ? `, ${workerHeapMB} MB/worker-thread` : ''}`);
console.log('  Ctrl-C to stop (children checkpoint first).');
console.log('═'.repeat(64));
for (const g of games) startGame(g);
meterLoop();
