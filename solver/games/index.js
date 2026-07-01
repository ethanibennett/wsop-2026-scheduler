// Registry of solvable games (Kuhn is test-only, not listed here)
const td27 = require('./triple-draw-27');
const a5td = require('./ace-to-five-draw');
const badugi = require('./badugi-game');
const stud8 = require('./stud8-game');
const razz = require('./razz-game');

const GAMES = { td27, a5td, badugi, stud8, razz };

const GAME_META = [
  { id: 'td27', name: '2-7 Triple Draw', stakes: 'Heads-up fixed limit, blinds 1/2, bets 2/4' },
  { id: 'a5td', name: 'A-5 Triple Draw', stakes: 'Heads-up fixed limit, blinds 1/2, bets 2/4' },
  { id: 'badugi', name: 'Badugi', stakes: 'Heads-up fixed limit, blinds 1/2, bets 2/4' },
  { id: 'stud8', name: 'Stud 8 or Better', stakes: 'Heads-up fixed limit, ante 1, bring-in 2, bets 4/8' },
  { id: 'razz', name: 'Razz', stakes: 'Heads-up fixed limit, ante 1, bring-in 2, bets 4/8' },
];

module.exports = { GAMES, GAME_META };
