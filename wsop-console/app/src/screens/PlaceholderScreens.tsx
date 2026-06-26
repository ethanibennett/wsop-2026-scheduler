// M3 + M6 screens — scaffolded with clear pointers to the source assets they
// port from. (M4 Plan now lives in its own screens/PlanScreen.tsx.)

export function TrainingScreen() {
  return (
    <div className="screen">
      <h1 className="screen-title">Training</h1>
      <div className="screen-sub">M3 · strength log</div>
      <div className="placeholder-note">
        Port <code>reference/lift-log.html</code> here: Mon/Wed/Fri sessions with
        the specific lifts, last-session reference, progressive-overload display,
        the pre-op/build toggle, benchmarks, and the prehab checklist.
        <br />
        <br />
        Data model is ready in <code>db/types.ts</code> (
        <code>LiftEntry</code>, <code>Benchmark</code>, <code>PrehabTick</code>)
        and the IndexedDB stores (<code>lifts</code>, <code>benchmarks</code>,{' '}
        <code>prehab</code>) already exist. Swap the prototype’s{' '}
        <code>window.storage</code> for these.
        <br />
        <br />
        Source: <code>docs/plan/training-plan.md</code>.
      </div>
    </div>
  )
}

export function ReviewScreen() {
  return (
    <div className="screen">
      <h1 className="screen-title">Review</h1>
      <div className="screen-sub">M6 · the Sunday review</div>
      <div className="placeholder-note">
        Build the Sunday review here: pull the week’s sessions / hours / mood /
        anchor-streak and prompt the three questions — <em>anchor hold? what
        slipped? one thing to tighten</em> — then save a dated{' '}
        <code>ReviewEntry</code> (store + type already exist).
        <br />
        <br />
        Prompts source: <code>docs/plan/mental-health-and-game.md</code>.
      </div>
    </div>
  )
}
