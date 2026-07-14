// Registry of solvable games (Kuhn is test-only, not listed here)
const td27 = require('./triple-draw-27');
const a5td = require('./ace-to-five-draw');
const badugi = require('./badugi-game');
const stud8 = require('./stud8-game');
const razz = require('./razz-game');

// razz DEFAULT is the v2 hole-aware bucket (shipped 2026-07-05, paired
// with strategies/razz.json retrained on v2 keys). Aliases, NOT in
// GAME_META (never surfaced in the app):
//   razzv1 = the frozen pre-ship hole-blind key, pairs ONLY with
//            strategies/razz.frozen-v1.json (LBR/A-B re-verification;
//            copy it to strategies/razzv1.json for `--game razzv1` CLIs).
//   razzv2 = the same v2 key under its opt-in training id; its file
//            razzv2.json == the committed razz-v2.json == razz.json.
const GAMES = { td27, a5td, badugi, stud8, razz, razzv1: razz.v1, razzv2: razz.v2, td27v2: td27.v2 };

const GAME_META = [
  { id: 'td27', name: '2-7 Triple Draw', stakes: 'Heads-up fixed limit, blinds 1/2, bets 2/4' },
  { id: 'a5td', name: 'A-5 Triple Draw', stakes: 'Heads-up fixed limit, blinds 1/2, bets 2/4' },
  { id: 'badugi', name: 'Badugi', stakes: 'Heads-up fixed limit, blinds 1/2, bets 2/4' },
  { id: 'stud8', name: 'Stud 8 or Better', stakes: 'Heads-up fixed limit, ante 1, bring-in 2, bets 4/8' },
  { id: 'razz', name: 'Razz', stakes: 'Heads-up fixed limit, ante 1, bring-in 2, bets 4/8' },
];

module.exports = { GAMES, GAME_META };
