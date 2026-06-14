// ── Plain-language "explain this spot" line ─────────────────
// Turns a self-play decision step into one or two short sentences.
// Everything here is grounded in computable facts (pot odds from the
// betting state) or an honest description of the solver's own mix —
// no fabricated EV numbers or invented hand reads. The qualitative
// gloss is gated on the actual strategy shape so it can't contradict
// the frequency bars it sits under.

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function actorName(step, isStud) {
  if (isStud) return 'Player ' + (step.actor + 1);
  return step.actor === 0 ? 'Button' : 'BB';
}

// Required equity to call: chips to call / (pot after calling).
function potOdds(pot, toCall) {
  return Math.round((toCall / (pot + toCall)) * 100);
}

function betClass(id) {
  if (id === 'r' || id === 'b' || id === 'co' || id === 'br') return 'aggr';
  if (id === 'c') return 'call';
  if (id === 'k') return 'check';
  if (id === 'f') return 'fold';
  return 'other';
}

function explainStep(step, isStud) {
  const acts = step.actions.slice().sort((a, b) => b.prob - a.prob);
  const top = acts[0], second = acts[1];
  const who = actorName(step, isStud);
  const hand = capitalize(step.players[step.actor].handLabel || 'this hand');
  const pure = top.prob >= 0.85;
  const evenish = second && (top.prob - second.prob) < 0.12;

  // ── Draw decisions ──
  if (step.kind === 'draw') {
    const patAct = step.actions.find(a => a.id === 'd0');
    const topIsPat = top.id === 'd0';
    let verb;
    if (topIsPat) {
      verb = pure ? 'stands pat almost every time'
        : evenish ? 'is close between standing pat and breaking'
          : `usually stands pat (${Math.round(top.prob * 100)}%)`;
    } else {
      const n = top.id.slice(1);
      verb = pure ? `almost always draws ${n}`
        : `usually draws ${n} (${Math.round(top.prob * 100)}%)`;
    }
    let gloss = '';
    if (topIsPat && !pure && patAct) gloss = ' The occasional break keeps the range balanced.';
    else if (!topIsPat && patAct && patAct.prob > 0 && patAct.prob < 0.18)
      gloss = ' The rare pat is a snow — standing pat with a weak hand to represent a made one.';
    return `${hand}. ${who} ${verb}.${gloss}`;
  }

  // ── Betting decisions ──
  const toCall = Math.max(0, step.contrib[1 - step.actor] - step.contrib[step.actor]);
  let price;
  if (toCall > 0) {
    price = `Facing ${toCall} to call into ${step.pot} — needs ~${potOdds(step.pot, toCall)}% equity to call.`;
  } else {
    price = 'No bet to call.';
  }

  let verb;
  if (evenish && second) {
    verb = `splits fairly evenly between ${top.label.toLowerCase()} and ${second.label.toLowerCase()}`;
  } else if (pure) {
    const c = betClass(top.id);
    verb = c === 'aggr' ? (toCall > 0 ? 'raises almost every time'
        : top.id === 'co' ? 'completes almost every time' : 'bets almost every time')
      : c === 'call' ? 'just calls'
        : c === 'fold' ? 'folds almost every time'
          : c === 'check' ? 'checks it back'
            : 'takes one line';
  } else if (second) {
    verb = `mostly picks ${top.label} (${Math.round(top.prob * 100)}%), sometimes ${second.label}`;
  } else {
    verb = `${top.label.toLowerCase()}`;
  }
  return `${hand}. ${price} ${who} ${verb}.`;
}

module.exports = { explainStep, potOdds };
