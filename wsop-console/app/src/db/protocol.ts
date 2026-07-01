// The written downswing protocol — drafted while NOT in one (the whole point:
// "you can't install a downswing protocol in the middle of a downswing").
// Principles from mental-health-and-game.md, made concrete.

export interface ProtocolStep {
  title: string
  body: string
}

export const DOWNSWING_PROTOCOL: ProtocolStep[] = [
  {
    title: 'It’s math, not a verdict',
    body: 'A downswing is variance, not a referendum on you or your game. Separate results from decision quality — judge the decisions, ignore the scoreboard.',
  },
  {
    title: 'Hold the rules, don’t chase',
    body: 'No reloading the shot, no jumping up to “win it back.” Lean on the move-down discipline — drop a stake before the roll forces you to. The rules exist for exactly this week.',
  },
  {
    title: 'Run the reset',
    body: 'Post-session reset ritual every night; the in-event reset if you’re tilted mid-session. Bring back hypnotherapy for a downswing reset, and hold the meditation floor.',
  },
  {
    title: 'Protect the keystones',
    body: 'Sleep, the 10:00 wake anchor, training — the foundation matters most exactly now. A tired, rattled grind is how a downswing compounds into a bigger one.',
  },
  {
    title: 'Clean hours only',
    body: 'Volume from a clear headspace, not revenge hours. Pulling a flex night to study or rest is a fine move, not a failure — quality over forced reps.',
  },
  {
    title: 'Name it, don’t white-knuckle it',
    body: 'Impatience, doubt, comparison are normal in a rebuild. Take it to therapy and the Sunday review’s mental-game line — this is the thread most worth not carrying alone.',
  },
]
