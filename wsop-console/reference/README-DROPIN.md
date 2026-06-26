# reference/ — prototypes to PORT (not shipped as-is)

⚠️ **These assets were NOT present in the repo when the app was scaffolded.**
Drop them here, then port them into `app/src/`:

| File | Ports into | Milestone |
|---|---|---|
| `lift-log.html` | `app/src/screens/TrainingScreen.tsx` | M3 |
| `year-plan-timeline.html` | `app/src/screens/PlanScreen.tsx` (Year view) | M4 |
| `phase-1-detail.html` | `app/src/screens/PlanScreen.tsx` (Phase view) | M4 |

> The prototypes persist with the Claude-artifact `window.storage` API, which
> **does not exist in a real PWA**. Replace it with the IndexedDB layer in
> `app/src/db/` (the `lifts` / `benchmarks` / `prehab` stores already exist).
> Never ship `window.storage`.
