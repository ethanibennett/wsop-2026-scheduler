// ── razz3-reduced — a TINY exactly-enumerable razz3 for the ground-truth gate ─
// The full razz3 game (52-card deck, 5 streets) cannot be enumerated exactly,
// so — exactly as the spike used microrazz3 alongside the full plan — we keep a
// small deterministic sibling that shares razz3's MULTIWAY MECHANICS (re-open,
// fold-to-2way, dead pot, whole-pot-low) but shrinks the card space to a single
// hidden low-strength card per seat over a few ranks and ONE betting round.
// This is precisely microrazz3's shape, re-expressed with an enumerateDeals()
// hook so measure3.exactExploit can validate the sampled meter against exact BR.
//
// It is NOT the training target — it is the CORRECTNESS ANCHOR. The full razz3
// is trained + measured with the sampled meter; this proves the sampled meter's
// inequalities match exact BR on a game where both are computable.

const ANTE = 1, BET = 4;

// tight/uniform priors over the reduced ranks (1..NR, lower=better)
function makeReduced(opts = {}) {
  const NR = opts.ranks || 6;           // reduced low ranks 1..NR
  const CAP = opts.cap != null ? opts.cap : 2;
  const DEAD = opts.dead != null ? opts.dead : 5; // 8-max: 8-3=5 dead antes
  const deadPot = DEAD * ANTE;
  const ranges = opts.ranges || [Array(NR).fill(1), Array(NR).fill(1), Array(NR).fill(1)];
  const cdf = ranges.map(w => { const tot = w.reduce((a, b) => a + b, 0); const c = []; let s = 0; for (let i = 0; i < NR; i++) { s += w[i] / tot; c.push(s); } return c; });

  function dealt(r0, r1, r2) {
    return {
      ranks: [r0, r1, r2],
      folded: [false, false, false],
      contrib: [ANTE, ANTE, ANTE],
      high: ANTE, curRaises: 0, toAct: 0, acted: [false, false, false], hist: '',
    };
  }
  function nextLive(s, from) { for (let k = 1; k <= 3; k++) { const c = (from + k) % 3; if (!s.folded[c]) return c; } return from; }

  const game = {
    id: 'razz3-reduced', deadPot, CAP, ranges, NR,
    newHand(rng) {
      const samp = seat => { const c = cdf[seat]; const r = rng(); for (let i = 0; i < NR; i++) if (r <= c[i]) return i + 1; return NR; };
      return dealt(samp(0), samp(1), samp(2));
    },
    dealt,
    liveSeats(s) { return [0, 1, 2].filter(i => !s.folded[i]); },
    isChance() { return false; },
    sampleChance(s) { return s; },
    isTerminal(s) { return this.liveSeats(s).length === 1 || s.hist.endsWith('#'); },
    utility(s) {
      const live = this.liveSeats(s);
      const pot = deadPot + s.contrib.reduce((a, b) => a + b, 0);
      let winners;
      if (live.length === 1) winners = live;
      else { const best = Math.min(...live.map(i => s.ranks[i])); winners = live.filter(i => s.ranks[i] === best); }
      const share = 1 / winners.length;
      return [0, 1, 2].map(i => (winners.includes(i) ? share * pot : 0) - s.contrib[i]);
    },
    currentPlayer(s) { return s.toAct; },
    legalActions(s) {
      const p = s.toAct, behind = s.high - s.contrib[p], acts = [];
      if (behind > 0) { acts.push('f', 'c'); if (s.curRaises < CAP) acts.push('r'); }
      else { acts.push('k'); if (s.curRaises < CAP) acts.push('b'); }
      return acts;
    },
    applyAction(s, a) {
      const p = s.toAct;
      const ns = { ranks: s.ranks, folded: s.folded.slice(), contrib: s.contrib.slice(), high: s.high, curRaises: s.curRaises, toAct: s.toAct, acted: s.acted.slice(), hist: s.hist + a };
      if (a === 'f') ns.folded[p] = true;
      else if (a === 'c') ns.contrib[p] = ns.high;
      else if (a === 'b' || a === 'r') { ns.high += BET; ns.contrib[p] = ns.high; ns.curRaises++; ns.acted = [false, false, false]; }
      ns.acted[p] = true;
      const live = [0, 1, 2].filter(i => !ns.folded[i]);
      if (live.length === 1) { ns.hist += '#'; return ns; }
      if (live.every(i => ns.acted[i]) && live.every(i => ns.contrib[i] === ns.high)) { ns.hist += '#'; return ns; }
      ns.toAct = nextLive(ns, p);
      return ns;
    },
    infosetKey(s) { return 'P' + s.toAct + ':r' + s.ranks[s.toAct] + ':' + s.hist; },
    // Exact enumeration: every rank triple weighted by the per-seat priors.
    *enumerateDeals() {
      const w = ranges.map(r => { const tot = r.reduce((a, b) => a + b, 0); return r.map(x => x / tot); });
      for (let a = 1; a <= NR; a++) for (let b = 1; b <= NR; b++) for (let c = 1; c <= NR; c++) {
        const weight = w[0][a - 1] * w[1][b - 1] * w[2][c - 1];
        if (weight > 0) yield { state: dealt(a, b, c), w: weight };
      }
    },
  };
  return game;
}

module.exports = { makeReduced };
