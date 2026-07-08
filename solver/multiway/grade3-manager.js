// ── MULTIWAY (3-player razz) TRAINER — GRADE worker MANAGER ──────────────────
// Thin persistent-worker manager in front of grade3-worker.js. The server's
// /step handler calls `grade(handRecord, opts)` and `await`s the returned
// promise; the heavy grade3.gradeHand3 runs on the worker thread so the event
// loop stays free (a concurrent trivial request returns promptly while a ~5s
// grade is in flight).
//
// Design (mirrors the persistence + defensive posture of the HU oracle-bridge,
// solver/razz-trainer/oracle-bridge.js — id-keyed pending map, per-request
// timeout, never wedges the server):
//   • ONE persistent worker, spawned lazily on first grade, kept warm so the
//     70MB blueprint is parsed ONCE (in the worker) and reused across grades.
//   • Requests are id-keyed; responses matched back by id.
//   • Per-request timeout → the promise REJECTS with a clean error (the hand
//     stays playable; the server surfaces a 500 for that grade only).
//   • A worker crash / non-zero exit rejects all in-flight grades and clears the
//     worker; the NEXT grade lazily respawns a fresh one. One bad grade never
//     poisons the pool permanently.

const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');

// The exact 7th-street grade is ~5.8s median / ~13.5s worst on this box; give
// generous headroom before declaring a hung worker. Override via env for slower
// prod boxes. On timeout the grade rejects (clean error) and the worker is
// recycled (a timeout usually means the worker is genuinely stuck, not slow).
const DEFAULT_TIMEOUT_MS = Number(process.env.GRADE3_WORKER_TIMEOUT_MS || 30000);

class Grade3Manager {
  // opts: { bpFile, gameOpts:{cap,antes}, timeoutMs, workerHeapMB }
  constructor(opts = {}) {
    this.bpFile = opts.bpFile;
    this.gameOpts = opts.gameOpts || { cap: 2, antes: 8 };
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.workerHeapMB = opts.workerHeapMB || 0;
    this.worker = null;
    this.ready = false;        // worker has parsed the blueprint and is grading
    this.readyErr = null;      // last startup/fatal error (surfaced to callers)
    this.nextId = 1;
    this.pending = new Map();  // id -> { resolve, reject, timer }
    this.infosets = 0;
  }

  // Spawn the persistent worker on first use. Never throws — a spawn failure is
  // recorded and every grade rejects with a clean error (hand stays playable).
  _ensure() {
    if (this.worker) return;
    if (!this.bpFile || !fs.existsSync(this.bpFile)) {
      this.readyErr = `grade worker blueprint missing: ${this.bpFile}`;
      return;
    }
    const workerPath = path.join(__dirname, 'grade3-worker.js');
    const wopts = { workerData: { bpFile: this.bpFile, gameOpts: this.gameOpts } };
    if (this.workerHeapMB > 0) wopts.resourceLimits = { maxOldGenerationSizeMb: this.workerHeapMB };
    try {
      this.worker = new Worker(workerPath, wopts);
    } catch (e) {
      this.readyErr = `grade worker spawn failed: ${e.message}`;
      this.worker = null;
      return;
    }
    this.ready = false;
    this.readyErr = null;
    this.worker.on('message', (m) => this._onMessage(m));
    this.worker.on('error', (e) => this._die(`grade worker error: ${e.message}`));
    this.worker.on('exit', (code) => { if (code !== 0) this._die(`grade worker exited (code ${code})`); });
  }

  _onMessage(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'ready') { this.ready = true; this.infosets = m.infosets || 0; return; }
    if (m.type === 'fatal') { this._die(m.error || 'grade worker fatal'); return; }
    if (m.type === 'result') {
      const p = this.pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      p.resolve(m.grade);
      return;
    }
    if (m.type === 'error') {
      const p = this.pending.get(m.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(m.id);
      p.reject(new Error(m.error || 'grade worker error'));
    }
  }

  // Crash/fatal: reject every in-flight grade and drop the worker. The NEXT
  // grade() lazily respawns a fresh worker (which re-parses the blueprint once).
  _die(reason) {
    this.readyErr = reason;
    this.ready = false;
    const w = this.worker;
    this.worker = null;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
    if (w) { try { w.terminate(); } catch (_) {} }
  }

  // grade(handRecord, opts) → Promise<gradeHand3 result>. opts must be PLAIN
  // scalars (no `game` object — the worker rebuilds its own); any `game` is
  // stripped here defensively so a non-cloneable field never kills the worker.
  grade(handRecord, opts = {}) {
    this._ensure();
    if (!this.worker) {
      return Promise.reject(new Error(this.readyErr || 'grade worker unavailable'));
    }
    const { game, ...plainOpts } = opts; // drop the non-cloneable game object
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        // A timeout means the worker is likely wedged — recycle it so the next
        // grade gets a fresh thread rather than queuing behind a stuck one.
        reject(new Error(`grade worker timeout after ${this.timeoutMs}ms`));
        this._die('grade worker recycled after timeout');
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ type: 'grade', id, handRecord, opts: plainOpts });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`grade worker postMessage failed: ${e.message}`));
      }
    });
  }

  stop() {
    this._die('grade manager stopped');
  }
}

let _singleton = null;
// getManager(opts) — lazy singleton. The FIRST call fixes bpFile/gameOpts; later
// calls return the same manager (opts ignored) so the warm worker is reused.
function getManager(opts) {
  if (!_singleton) _singleton = new Grade3Manager(opts);
  return _singleton;
}

module.exports = { getManager, Grade3Manager };
