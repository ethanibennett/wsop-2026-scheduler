// oracle-bridge.js — JS <-> Python bridge to the TRUE-GTO 7th-street grading
// ORACLE (solver/neural/oracle_worker.py, run on the neural venv).
//
// A PERSISTENT worker (spawned once, kept warm) so a GUI grade is a fast round-
// trip, not a cold `python` spawn per spot. Requests are newline-delimited JSON
// keyed by an incrementing id; responses are matched back by id.
//
// EVERYTHING here is defensive: if the venv/worker is missing, crashes, errors,
// or times out, callers get a rejected promise (or ok:false) and the grader
// falls back to the blueprint grade — the trainer never breaks.
//
// Usage:
//   const { getOracle } = require('./oracle-bridge');
//   const oracle = getOracle();                    // lazy singleton
//   const res = await oracle.perActionEV(spot);    // {per_action_ev, gtoMix, ...}
//   // res is null on any failure -> caller uses the blueprint grade.

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const VENV_PY = path.join(ROOT, 'solver', 'neural', '.venv', 'bin', 'python');
const WORKER = path.join(ROOT, 'solver', 'neural', 'oracle_worker.py');

// The exact 7th-street re-solve is O(iters · union²); a top-mass-capped opponent
// range (~20 combos) at ~800 iters lands in a few seconds warm. Give generous
// headroom before falling back to the blueprint grade.
const DEFAULT_TIMEOUT_MS = 20000;

class OracleWorker {
  constructor(opts = {}) {
    this.pythonPath = opts.pythonPath || process.env.ORACLE_PYTHON || VENV_PY;
    this.workerPath = opts.workerPath || WORKER;
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.proc = null;
    this.buf = '';
    this.nextId = 1;
    this.pending = new Map(); // id -> {resolve, reject, timer}
    this.dead = false;        // once true, all requests short-circuit to null
    this.startError = null;
  }

  // Spawn the persistent worker on first use. Never throws — on failure the
  // worker is marked dead and every request resolves to null (blueprint fallback).
  _ensure() {
    if (this.proc || this.dead) return;
    if (!fs.existsSync(this.pythonPath) || !fs.existsSync(this.workerPath)) {
      this.dead = true;
      this.startError = `oracle unavailable: missing ${!fs.existsSync(this.pythonPath) ? this.pythonPath : this.workerPath}`;
      return;
    }
    try {
      this.proc = spawn(this.pythonPath, [this.workerPath], {
        cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      this.dead = true;
      this.startError = `oracle spawn failed: ${e.message}`;
      return;
    }
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => this._onData(chunk));
    this.proc.on('error', (e) => this._die(`oracle process error: ${e.message}`));
    this.proc.on('exit', (code) => this._die(`oracle exited (code ${code})`));
    // stderr is the worker's own log; swallow it (keep tool output small).
    this.proc.stderr.on('data', () => {});
  }

  _onData(chunk) {
    this.buf += chunk;
    let nl;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const id = msg.id;
      const p = this.pending.get(id);
      if (!p) continue;
      clearTimeout(p.timer);
      this.pending.delete(id);
      p.resolve(msg);
    }
  }

  // Fail every in-flight + future request; the singleton is now dead.
  _die(reason) {
    if (this.dead) return;
    this.dead = true;
    this.startError = this.startError || reason;
    this.proc = null;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve(null);
    }
    this.pending.clear();
  }

  // Low-level: send a request object, resolve with the response (or null on any
  // failure/timeout). NEVER rejects.
  _send(req) {
    this._ensure();
    if (this.dead || !this.proc) return Promise.resolve(null);
    const id = this.nextId++;
    req.id = id;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve(null); // timed out -> fall back; leave the worker running
        }
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject: resolve, timer });
      try {
        this.proc.stdin.write(JSON.stringify(req) + '\n');
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(null);
      }
    });
  }

  // Public: get the true-GTO per-action EV for a 7th-street spot.
  // spot = {game, up0, up1, dead, pot, me, opp_range:[[holding,weight],...], iters}
  // Returns {per_action_ev, gtoMix, exploitability, pot} or null (=> fall back).
  async perActionEV(spot) {
    const res = await this._send(Object.assign({}, spot));
    if (!res || res.ok !== true) return null;
    return res;
  }

  async ping() {
    const res = await this._send({ cmd: 'ping' });
    return !!(res && res.ok);
  }

  stop() {
    if (this.proc) {
      try { this.proc.stdin.write(JSON.stringify({ cmd: 'shutdown' }) + '\n'); } catch {}
      try { this.proc.kill(); } catch {}
    }
    this._die('stopped');
  }
}

let _singleton = null;
function getOracle(opts) {
  if (!_singleton) _singleton = new OracleWorker(opts);
  return _singleton;
}

module.exports = { getOracle, OracleWorker };
